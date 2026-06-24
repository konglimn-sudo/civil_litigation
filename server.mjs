// 衡法 AI 办案台服务端:零第三方依赖的 Node + SQLite,提供认证、权限、状态同步、
// 文件抽取、FTS5 法律检索、文书/类案/庭审等 AI 能力,并托管前端与 Word/WPS 插件静态文件。
import http from "node:http";                                                            // 内置 HTTP 服务器。
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";      // 哈希、随机、scrypt 口令、定时安全比较。
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"; // 文件系统读写。
import { spawnSync } from "node:child_process";                                          // 调用 Python/外部抽取与转写。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.mjs";                       // SQLite 适配层。
import { legalCorpus } from "./legal-corpus.mjs";              // 法条样例语料(首启播种)。
import { precedentCorpus } from "./precedent-corpus.mjs";      // 类案裁判要旨样例语料。
import { defaultHolidayCalendars } from "./holidays.mjs";      // 法定节假日默认数据。
import { extractTextLocally, localExtractionCapabilities } from "./ocr.mjs"; // 零依赖文字抽取兜底。
import { transcriptionCapabilities, transcribeAudioLocally, parseTranscript } from "./transcribe.mjs"; // 庭审语音转写。
import { renderDocumentTemplate, templateLabels } from "./document-templates.mjs"; // 文书模板(与插件共享)。
import { embedBatch, embedOne, embedderInfo, cosineSim, vectorToBlob, blobToVector } from "./embedding.mjs"; // 本地语义向量(混合检索)。
import { applyDomain, domainProfileInfo } from "./legal-domain.mjs"; // 法律领域适配层(领域提示 + 术语词典)。

const root = path.dirname(fileURLToPath(import.meta.url));     // 项目根目录(本文件所在处)。
const host = "127.0.0.1";                                      // 仅监听本机回环,默认不对外暴露。
const port = Number(process.env.PORT || 4173);                // 监听端口(可经 PORT 覆盖)。
const dataDir = process.env.HENGFA_DATA_DIR ? path.resolve(process.env.HENGFA_DATA_DIR) : path.join(root, "data"); // 数据目录(DB+上传)。
const uploadsDir = path.join(dataDir, "uploads");             // 案件文件存放目录(不经静态 URL 暴露)。
const sessionCookie = "hengfa_session";                      // 会话 Cookie 名。
const sessionHours = 8;                                       // 会话有效时长(小时)。
const bodyLimit = 3 * 1024 * 1024;                           // JSON 请求体上限 3MB。
const fileLimit = 25 * 1024 * 1024;                          // 上传文件上限 25MB。

// AI 能力中台基座模型：本系统统一指定 Claude 为生成式基座，但默认关闭（本地优先）。
// 设 HENGFA_LLM=claude 且配置 ANTHROPIC_API_KEY 后，问答 / 事实抽取 / 裁判倾向综述改为
// 以检索片段或案件材料为唯一依据的 Claude 生成并强制附引用；任何异常都回退到本地结果。
const llmProvider = (process.env.HENGFA_LLM || "none").toLowerCase();
const llmModel = process.env.HENGFA_LLM_MODEL || "claude-opus-4-8";
const llmApiKey = process.env.ANTHROPIC_API_KEY || "";
const llmEnabled = llmProvider === "claude" && Boolean(llmApiKey);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".xml": "text/xml; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const rolePermissions = {
  admin: ["manage_users", "manage_settings", "create_case", "edit_case", "manage_evidence", "manage_tasks", "export_documents", "view_audit"],
  lawyer: ["create_case", "edit_case", "manage_evidence", "manage_tasks", "export_documents", "view_audit"],
  assistant: ["manage_evidence", "manage_tasks", "export_documents"],
  client: []
};

mkdirSync(dataDir, { recursive: true });    // 确保数据目录存在。
mkdirSync(uploadsDir, { recursive: true }); // 确保上传子目录存在。
// 打开数据库:WAL 提升并发,开启外键约束,设 5 秒忙等待避免锁冲突即报错。
const db = await openDatabase(path.join(dataDir, "hengfa.db"), "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
// 一次性建表(IF NOT EXISTS,幂等)。业务实体(案件/证据/任务等)不在此,而是以 JSON 存于 workspace_states。
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (   -- 工作区(本系统目前为单工作区)
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (        -- 成员账号与角色
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- 邮箱唯一且大小写不敏感
    password_hash TEXT NOT NULL,               -- scrypt 派生哈希
    password_salt TEXT NOT NULL,               -- 每用户独立盐
    role TEXT NOT NULL CHECK(role IN ('admin','lawyer','assistant','client')), -- 四类角色
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')), -- 启用/停用
    created_at TEXT NOT NULL,
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (     -- 登录会话(Cookie 令牌只存哈希)
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,           -- 会话令牌的 sha256(原值仅存浏览器 Cookie)
    csrf_token TEXT NOT NULL,                  -- 配套 CSRF 令牌
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL                   -- 过期时间
  );
  CREATE TABLE IF NOT EXISTS workspace_states ( -- 工作区业务状态(案件/证据/任务...的 JSON 快照 + 版本号)
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    revision INTEGER NOT NULL DEFAULT 0,        -- 乐观锁版本号
    data_json TEXT NOT NULL DEFAULT '{}',       -- 整个工作区状态的 JSON
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS case_access (   -- 当事人(client)对具体案件的访问授权
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL,
    PRIMARY KEY(user_id, case_id)
  );
  CREATE TABLE IF NOT EXISTS audit_logs (    -- 操作审计留痕
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    ip TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS case_files (   -- 案件上传文件元数据 + 抽取文本(文件本体在 uploads/)
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    case_id TEXT NOT NULL,
    original_name TEXT NOT NULL,                -- 原始文件名
    stored_name TEXT NOT NULL,                  -- 落盘文件名(id+扩展名)
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,                       -- 内容校验值
    status TEXT NOT NULL CHECK(status IN ('processed','partial','error')), -- 抽取结果状态
    extraction_method TEXT,                     -- 抽取方式(pdf-text/image-ocr/transcript:... 等)
    extracted_text TEXT,                        -- 抽取/转写出的文本(供检索与事实抽取)
    error_message TEXT,
    uploaded_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    processed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS legal_sources (   -- 法源条目(法条/司法解释等)
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    title TEXT NOT NULL,
    authority TEXT NOT NULL,                    -- 制定机关
    level TEXT NOT NULL,                        -- 效力层级(法律/行政法规/司法解释...)
    effective_status TEXT NOT NULL,             -- 效力状态(有效/废止/失效...)
    effective_date TEXT,                        -- 生效日期
    valid_until TEXT,                           -- 有效期至(到期提醒用)
    source_url TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS legal_chunks_fts USING fts5( -- 法源分块的 FTS5 全文索引
    chunk_id UNINDEXED,                         -- 分块 id(不索引,仅存储)
    source_id UNINDEXED,                        -- 所属法源 id
    search_text,                                -- 参与 BM25 检索的分词文本
    content UNINDEXED                           -- 原文片段(展示用)
  );
  CREATE TABLE IF NOT EXISTS legal_source_revisions ( -- 法源字段变更留痕(谁/何时/由何值改为何值)
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    field TEXT NOT NULL,                        -- 变更字段名
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT REFERENCES users(id),
    changed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS holiday_calendars ( -- 各年度法定节假日/调休表(期限顺延用)
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    year TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    holidays_json TEXT NOT NULL DEFAULT '[]',
    workdays_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id),
    PRIMARY KEY(workspace_id, year)
  );
  -- 下列索引加速高频查询(会话令牌、审计/文件/法源按时间倒序等)。
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_audit_workspace_time ON audit_logs(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_case_files_case ON case_files(workspace_id, case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_legal_sources_workspace ON legal_sources(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_legal_revisions_source ON legal_source_revisions(source_id, changed_at DESC);
  CREATE TABLE IF NOT EXISTS precedents (    -- 类案裁判要旨(检索 + 裁判倾向)
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    court TEXT NOT NULL,                        -- 审理法院
    cause TEXT NOT NULL,                        -- 案由
    outcome TEXT NOT NULL,                      -- 裁判结果(支持/部分支持/驳回)
    year TEXT,
    title TEXT NOT NULL,
    gist TEXT NOT NULL,                         -- 裁判要旨正文
    source_url TEXT,
    created_at TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS precedent_fts USING fts5( -- 类案要旨的 FTS5 索引
    precedent_id UNINDEXED,
    search_text,                               -- 案由+标题+标签+要旨的分词
    content UNINDEXED
  );
  CREATE INDEX IF NOT EXISTS idx_precedents_workspace ON precedents(workspace_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS legal_embeddings (  -- 法源分块的语义向量(向量数据库,与 FTS5 混合检索)
    chunk_id TEXT PRIMARY KEY,                  -- 对应 legal_chunks_fts.chunk_id
    source_id TEXT NOT NULL,                    -- 所属法源 id(随法源删除/重建一并维护)
    content TEXT NOT NULL,                      -- 分块原文(向量库自持,避免与 FTS 虚表 JOIN)
    model TEXT NOT NULL,                        -- 引擎签名(local-concept-v1 / py:模型),失配则重建
    dim INTEGER NOT NULL,                       -- 向量维度
    vector BLOB NOT NULL                        -- L2 归一化后的 Float32 小端向量
  );
  CREATE INDEX IF NOT EXISTS idx_legal_embeddings_source ON legal_embeddings(source_id);
  CREATE TABLE IF NOT EXISTS precedent_embeddings ( -- 类案要旨的语义向量
    precedent_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    dim INTEGER NOT NULL,
    vector BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications (  -- 通知中心条目(到期/逾期/冲突等提醒)
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    type TEXT NOT NULL,                         -- 提醒类型(legal_expiry/deadline_overdue...)
    level TEXT NOT NULL,                        -- 紧急程度
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,                   -- 去重键,避免同一事项反复生成
    meta_json TEXT NOT NULL DEFAULT '{}',       -- 跳转所需的元数据(案件/法源 id 等)
    created_at TEXT NOT NULL,
    read_at TEXT,                               -- 已读时间(NULL=未读)
    UNIQUE(workspace_id, dedupe_key)            -- 同工作区同事项只保留一条
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS notification_prefs ( -- 每用户的提醒偏好
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lead_days INTEGER NOT NULL DEFAULT 7,        -- 临期提前天数
    muted_types TEXT NOT NULL DEFAULT '[]',      -- 屏蔽的提醒类型(JSON 数组)
    channels TEXT NOT NULL DEFAULT '["inapp"]',  -- 接收渠道(站内/外部)
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS webhook_outbox ( -- 外部提醒投递队列(失败留痕 + 重试)
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,                 -- 待投递的日报负载
    status TEXT NOT NULL DEFAULT 'pending',      -- pending/sent/failed
    attempts INTEGER NOT NULL DEFAULT 0,         -- 已尝试次数
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_status ON webhook_outbox(status, created_at);
`);

// 迁移:为早于这些字段的旧库补列(新库已含,故先探测 PRAGMA table_info 再 ALTER)。
if (!db.prepare("PRAGMA table_info(legal_sources)").all().some(col => col.name === "valid_until")) {
  db.exec("ALTER TABLE legal_sources ADD COLUMN valid_until TEXT"); // 旧库补"有效期至"列。
}
if (!db.prepare("PRAGMA table_info(notifications)").all().some(col => col.name === "meta_json")) {
  db.exec("ALTER TABLE notifications ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}'"); // 旧库补元数据列。
}

// 生成带前缀的随机 id(如 user_xxxx),96 位随机足够避免碰撞。
function id(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

// 当前时间的 ISO 字符串(全库统一用字符串存时间)。
function isoNow() {
  return new Date().toISOString();
}

// 对值取 sha256 十六进制(用于会话令牌只存哈希、不存原值)。
function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

// 口令派生:scrypt(口令, 盐)→ 64 字节哈希;每次默认生成新盐。
function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

// 校验口令:用同盐重算并以"定时安全比较"防时序侧信道,长度不一直接判否。
function verifyPassword(password, salt, expectedHex) {
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// 首启播种:建工作区、空状态、初始管理员,并写入法源/类案/节假日样例。每次启动调用(各步幂等)。
function seedDatabase() {
  const workspaceId = "workspace_hengfa";
  const now = isoNow();
  db.prepare("INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(workspaceId, "衡法律师工作区", now); // 工作区(已存在则忽略)。
  db.prepare("INSERT OR IGNORE INTO workspace_states (workspace_id, revision, data_json, updated_at) VALUES (?, 0, '{}', ?)").run(workspaceId, now); // 空业务状态。

  const userCount = Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count); // 是否已有任何用户。
  if (!userCount) { // 仅首次(无任何用户)创建初始管理员。
    const email = process.env.HENGFA_ADMIN_EMAIL || "admin@hengfa.local";       // 管理员邮箱(可环境变量配置)。
    const password = process.env.HENGFA_ADMIN_PASSWORD || "Hengfa-Admin-2026";  // 管理员初始密码。
    const credentials = hashPassword(password);                                 // 派生盐+哈希(不存明文)。
    db.prepare(`INSERT INTO users
      (id, workspace_id, name, email, password_hash, password_salt, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'admin', 'active', ?)`)
      .run(id("user"), workspaceId, "系统管理员", email.toLowerCase(), credentials.hash, credentials.salt, now);
    console.log(`Initial admin: ${email}`);
    if (!process.env.HENGFA_ADMIN_PASSWORD) console.log("Initial password: Hengfa-Admin-2026 (change it after login)"); // 未自定义密码时提示默认值。
  }
  seedLegalCorpus(workspaceId, now); // 法条样例。
  seedPrecedents(workspaceId, now);  // 类案样例。
  seedHolidays(workspaceId, now);    // 节假日表。
}

// 首次启动播种默认节假日表;之后由管理员集中维护(PUT /api/holidays/:year)。
function seedHolidays(workspaceId, now) {
  const insert = db.prepare(`INSERT OR IGNORE INTO holiday_calendars
    (workspace_id, year, verified, holidays_json, workdays_json, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, NULL)`);
  for (const [year, calendar] of Object.entries(defaultHolidayCalendars)) {
    insert.run(workspaceId, year, calendar.verified ? 1 : 0, JSON.stringify(calendar.holidays || []), JSON.stringify(calendar.workdays || []), now);
  }
}

function holidayCalendars(workspaceId) {
  const rows = db.prepare("SELECT year, verified, holidays_json, workdays_json, updated_at FROM holiday_calendars WHERE workspace_id = ? ORDER BY year").all(workspaceId);
  const calendars = {};
  for (const row of rows) {
    calendars[row.year] = {
      verified: Boolean(row.verified),
      holidays: JSON.parse(row.holidays_json || "[]"),
      workdays: JSON.parse(row.workdays_json || "[]"),
      updatedAt: row.updated_at
    };
  }
  return calendars;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeDateList(value, year) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item).trim()).filter(item => ISO_DATE_RE.test(item) && item.startsWith(`${year}-`)))].sort().slice(0, 60);
}

function daysFromToday(iso) {
  const target = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function expiryMilestone(days) {
  if (days < 0) return "expired";
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return null;
}

const NOTIF_TYPES = ["legal_expiry", "deadline_overdue", "deadline_due", "hearing_conflict", "task_overdue", "task_due"];

function safeJsonArray(value) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch (_) { return []; }
}

function userPrefs(userId) {
  const row = db.prepare("SELECT lead_days, muted_types, channels FROM notification_prefs WHERE user_id = ?").get(userId);
  return {
    leadDays: row ? Math.max(1, Math.min(60, Number(row.lead_days) || 7)) : 7,
    mutedTypes: row ? safeJsonArray(row.muted_types).filter(type => NOTIF_TYPES.includes(type)) : [],
    channels: row ? safeJsonArray(row.channels) : ["inapp"]
  };
}

// 写入一条去重通知,返回是否新建。
function pushNotification(workspaceId, { type, level, title, detail, dedupeKey, meta }) {
  return db.prepare(`INSERT OR IGNORE INTO notifications (id, workspace_id, type, level, title, detail, dedupe_key, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id("ntf"), workspaceId, type, level, String(title).slice(0, 120), String(detail).slice(0, 500), dedupeKey, JSON.stringify(meta || {}), isoNow()).changes > 0;
}

const NOTIF_TYPE_LABELS = { legal_expiry: "法源到期", deadline_overdue: "逾期节点", deadline_due: "临近期限", hearing_conflict: "庭期冲突", task_overdue: "逾期任务", task_due: "临近任务" };
const NOTIF_TYPE_ORDER = ["deadline_overdue", "task_overdue", "hearing_conflict", "deadline_due", "task_due", "legal_expiry"];

// 把多条提醒合并为一封成稿日报(主题 + 分类计数 + 分组正文),供一次性推送/查看。
function buildDigest(reminders, dateStr) {
  const groups = {};
  for (const item of reminders) (groups[item.type] = groups[item.type] || []).push(item);
  const present = NOTIF_TYPE_ORDER.filter(type => groups[type] && groups[type].length);
  const summary = Object.fromEntries(present.map(type => [type, groups[type].length]));
  const subject = `衡法办案提醒日报（${dateStr}）：${present.map(type => `${NOTIF_TYPE_LABELS[type]} ${groups[type].length}`).join(" · ") || "无新增提醒"}`;
  const sections = present.map(type => `【${NOTIF_TYPE_LABELS[type]}】\n${groups[type].map(item => `· ${item.detail}`).join("\n")}`);
  const text = `${subject}\n\n${sections.join("\n\n")}${sections.length ? "\n\n" : ""}（本提醒由衡法 AI 办案台自动生成，请登录系统处理；具体期限与效力须人工核验。）`;
  const groupList = present.map(type => ({ type, label: NOTIF_TYPE_LABELS[type], items: groups[type].map(item => ({ title: item.title, detail: item.detail, level: item.level })) }));
  return { subject, summary, text, total: reminders.length, groups: groupList };
}

// 是否符合成员偏好(未静音 + 临期在其提前窗口内)。
function reminderMatchesPrefs(reminder, prefs) {
  if (prefs.mutedTypes.includes(reminder.type)) return false;
  if (reminder.type.endsWith("_due")) {
    const days = reminder.meta?.daysLeft;
    if (typeof days === "number" && days > prefs.leadDays) return false;
  }
  return true;
}

// 为订阅外部渠道的每位成员生成个性化日报(只含其关注类型与提前窗口)。
// 为订阅了外部渠道(webhook)的每位在职成员,按其个人偏好筛选出专属提醒并生成个性化日报。
// 返回 [{ name, email, digest }],便于外部系统按收件人分别群发。
function buildReminderDeliveries(workspaceId, reminders, dateStr = isoNow().slice(0, 10)) {
  const members = db.prepare("SELECT id, name, email FROM users WHERE workspace_id = ? AND status = 'active'").all(workspaceId);
  const deliveries = [];
  for (const member of members) {
    const prefs = userPrefs(member.id);
    if (!prefs.channels.includes("webhook")) continue;                       // 未订阅外部渠道的成员跳过。
    const personal = reminders.filter(reminder => reminderMatchesPrefs(reminder, prefs)); // 只留该成员关注的提醒。
    if (!personal.length) continue;                                          // 没有可发内容则不生成。
    deliveries.push({ name: member.name, email: member.email, digest: buildDigest(personal, dateStr) });
  }
  return deliveries;
}

// 把一次提醒推送入队(待发),由 flushWebhookOutbox 投递并在失败时重试/留痕。
function dispatchReminderWebhook(workspaceId, reminders) {
  if (!process.env.HENGFA_REMINDER_WEBHOOK || !reminders.length) return;
  const dateStr = isoNow().slice(0, 10);
  const payload = { event: "hengfa-reminders", at: isoNow(), digest: buildDigest(reminders, dateStr), deliveries: buildReminderDeliveries(workspaceId, reminders, dateStr) };
  db.prepare("INSERT INTO webhook_outbox (id, workspace_id, payload_json, status, attempts, created_at) VALUES (?, ?, ?, 'pending', 0, ?)")
    .run(id("hook"), workspaceId, JSON.stringify(payload), isoNow());
  flushWebhookOutbox();
}

// 投递所有待发 webhook;失败则累加 attempts 并留痕,超过最大次数标记 failed。
async function flushWebhookOutbox() {
  const url = process.env.HENGFA_REMINDER_WEBHOOK;
  if (!url) return;
  const maxAttempts = Math.max(1, Number(process.env.HENGFA_WEBHOOK_MAX_ATTEMPTS) || 5);
  const rows = db.prepare("SELECT id, payload_json, attempts FROM webhook_outbox WHERE status = 'pending' ORDER BY created_at LIMIT 20").all();
  for (const row of rows) {
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: row.payload_json, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      db.prepare("UPDATE webhook_outbox SET status = 'sent', attempts = attempts + 1, last_error = NULL, updated_at = ? WHERE id = ?").run(isoNow(), row.id);
    } catch (error) {
      const attempts = row.attempts + 1;
      db.prepare("UPDATE webhook_outbox SET attempts = ?, status = ?, last_error = ?, updated_at = ? WHERE id = ?")
        .run(attempts, attempts >= maxAttempts ? "failed" : "pending", String(error.message || error).slice(0, 300), isoNow(), row.id);
    }
  }
}

// 清理超过保留天数的已读通知,避免无限堆积(未读保留)。
function purgeOldNotifications() {
  const days = Math.max(1, Number(process.env.HENGFA_NOTIF_RETENTION_DAYS) || 30);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const removed = db.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < ?").run(cutoff).changes;
  // 已成功投递的 webhook 记录按保留期清理(失败记录保留以便排查)。
  db.prepare("DELETE FROM webhook_outbox WHERE status = 'sent' AND updated_at < ?").run(cutoff);
  return removed;
}

// 后台定时任务:扫描法源到期、案件节点、协作任务与跨案庭期冲突,去重写入通知(无人登录也会运行)。
function runReminderScan() {
  purgeOldNotifications();
  flushWebhookOutbox();
  const allCreated = [];
  for (const workspace of db.prepare("SELECT id FROM workspaces").all()) {
    const created = [];
    const record = entry => { if (pushNotification(workspace.id, entry)) created.push({ type: entry.type, level: entry.level, title: entry.title, detail: entry.detail, meta: entry.meta || {} }); };

    // 临近到期/已过期法源(按里程碑去重)
    const sources = db.prepare("SELECT id, title, valid_until FROM legal_sources WHERE workspace_id = ? AND valid_until IS NOT NULL AND valid_until <> ''").all(workspace.id);
    for (const source of sources) {
      const days = daysFromToday(source.valid_until);
      if (days === null) continue;
      const milestone = expiryMilestone(days);
      if (!milestone) continue;
      record({
        type: "legal_expiry", level: milestone === "30d" ? "medium" : "high",
        title: `法源到期提醒：${source.title}`,
        detail: days < 0 ? `《${source.title}》有效期至 ${source.valid_until}，已过期 ${Math.abs(days)} 天，请复核效力或更换依据。` : `《${source.title}》有效期至 ${source.valid_until}，剩余 ${days} 天，请复核效力。`,
        dedupeKey: `expiry:${source.id}:${milestone}`, meta: { sourceId: source.id, validUntil: source.valid_until, daysLeft: days }
      });
    }

    // 案件节点:逾期 / 临近期限;跨案庭期冲突
    const maxLead = Math.max(7, ...db.prepare("SELECT lead_days FROM notification_prefs WHERE user_id IN (SELECT id FROM users WHERE workspace_id = ?)").all(workspace.id).map(row => Math.min(60, Number(row.lead_days) || 7)));
    const state = workspaceState(workspace.id);
    const cases = state.cases || [];
    const caseTitle = caseId => cases.find(item => item.id === caseId)?.title || "案件";
    const pending = (state.caseEvents || []).filter(item => item && item.status !== "已完成" && item.caseId && item.date);
    for (const event of pending) {
      const days = daysFromToday(event.date);
      if (days === null) continue;
      if (days < 0) {
        record({ type: "deadline_overdue", level: "high", title: `逾期节点：${event.title}`, detail: `${caseTitle(event.caseId)} · ${event.title} 已逾期 ${Math.abs(days)} 天（应于 ${event.date}）`, dedupeKey: `event-overdue:${event.id}`, meta: { caseId: event.caseId, eventDate: event.date, daysLeft: days } });
      } else if (days <= maxLead) {
        record({ type: "deadline_due", level: days <= 3 ? "high" : "medium", title: `临近期限：${event.title}`, detail: `${caseTitle(event.caseId)} · ${event.title} 将于 ${event.date} 到期（剩余 ${days} 天）`, dedupeKey: `event-due:${event.id}`, meta: { caseId: event.caseId, eventDate: event.date, daysLeft: days } });
      }
    }
    const hearingDates = {};
    for (const event of pending) {
      if (!/庭审|开庭/.test(`${event.type} ${event.title}`) || daysFromToday(event.date) < 0) continue;
      (hearingDates[event.date] = hearingDates[event.date] || new Set()).add(event.caseId);
    }
    for (const [date, ids] of Object.entries(hearingDates)) {
      if (ids.size < 2) continue;
      const caseIds = [...ids].sort();
      record({ type: "hearing_conflict", level: "high", title: `庭期冲突：${date}`, detail: `${date} 有 ${caseIds.length} 个案件同日庭审，无法同时出庭：${caseIds.map(caseTitle).join("、")}`, dedupeKey: `conflict:${date}:${caseIds.join(",")}`, meta: { date, caseIds } });
    }

    // 协作任务:逾期 / 临近到期
    for (const task of (state.tasks || []).filter(item => item && !item.done && item.dueDate)) {
      const days = daysFromToday(task.dueDate);
      if (days === null) continue;
      const owner = task.owner ? `（${task.owner}）` : "";
      if (days < 0) {
        record({ type: "task_overdue", level: "high", title: `逾期任务：${task.title}`, detail: `${caseTitle(task.caseId)} · ${task.title}${owner} 已逾期 ${Math.abs(days)} 天（应于 ${task.dueDate}）`, dedupeKey: `task-overdue:${task.id}`, meta: { caseId: task.caseId, dueDate: task.dueDate, daysLeft: days } });
      } else if (days <= maxLead) {
        record({ type: "task_due", level: days <= 3 ? "high" : "medium", title: `临近任务：${task.title}`, detail: `${caseTitle(task.caseId)} · ${task.title}${owner} 将于 ${task.dueDate} 到期（剩余 ${days} 天）`, dedupeKey: `task-due:${task.id}`, meta: { caseId: task.caseId, dueDate: task.dueDate, daysLeft: days } });
      }
    }

    if (created.length) { dispatchReminderWebhook(workspace.id, created); allCreated.push(...created); }
  }
  return allCreated;
}

// 按法源名称粗略推断制定机关(仅用于样例语料的展示)。
function authorityFor(code) {
  if (code.includes("最高人民法院")) return "最高人民法院";
  if (code.includes("民法典") || code.includes("民事诉讼法")) return "全国人民代表大会常务委员会";
  return "实务整理（样例）";
}

// 首次启动时把条文级样例语料导入 FTS5，使法律检索/问答开箱即用。
// 内容为要点归纳样例，效力与条号需由办案人员回到正式法源核验。
function seedLegalCorpus(workspaceId, now) {
  const existing = Number(db.prepare("SELECT COUNT(*) AS count FROM legal_sources WHERE workspace_id = ?").get(workspaceId).count);
  if (existing) return;
  const insert = db.prepare(`INSERT OR IGNORE INTO legal_sources
    (id, workspace_id, title, authority, level, effective_status, effective_date, source_url, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL, ?, ?)`);
  for (const item of legalCorpus) {
    const sourceId = `law_seed_${item.id}`;
    insert.run(sourceId, workspaceId, `${item.title}（${item.code}${item.article}）`, authorityFor(item.code), item.level, item.status, item.updatedAt, now, now);
    indexLegalSource(sourceId, `${item.title}。${item.text}`);
  }
  console.log(`Seeded ${legalCorpus.length} sample legal sources.`);
}

// 首次启动把类案裁判要旨样例写入 precedents 表与 FTS 索引(已有数据则跳过)。
function seedPrecedents(workspaceId, now) {
  const existing = Number(db.prepare("SELECT COUNT(*) AS count FROM precedents WHERE workspace_id = ?").get(workspaceId).count);
  if (existing) return;
  const insert = db.prepare(`INSERT OR IGNORE INTO precedents
    (id, workspace_id, court, cause, outcome, year, title, gist, source_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)`);
  for (const item of precedentCorpus) {
    const precedentId = `prec_seed_${item.id}`;
    insert.run(precedentId, workspaceId, item.court, item.cause, item.outcome, item.year || "", item.title, item.gist, now);
    indexPrecedent(precedentId, `${item.cause}。${item.title}。${(item.tags || []).join(" ")}。${item.gist}`);
  }
  console.log(`Seeded ${precedentCorpus.length} sample precedents.`);
}

seedDatabase();                                                 // 建工作区/管理员/样例数据(幂等)。
backfillEmbeddings();                                            // 补齐缺失/失配的语义向量(旧库或引擎切换后)。
db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(isoNow()); // 启动时清理过期会话。

// 统一安全响应头(防嗅探/点击劫持/泄露 Referer 等);extra 可覆盖默认值(如插件页放宽 CSP)。
function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",                        // 禁止 MIME 嗅探。
    "X-Frame-Options": "DENY",                                  // 禁止被任意页面内嵌(插件页会删除此项)。
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()", // 关闭敏感设备权限。
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'", // 仅同源。
    ...extra
  };
}

// 发送 JSON 响应(带安全头与 no-store)。
function sendJson(response, status, data, extraHeaders = {}) {
  response.writeHead(status, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  }));
  response.end(JSON.stringify(data));
}

// 发送标准错误响应:{ error, code }。
function sendError(response, status, message, code = "REQUEST_ERROR") {
  sendJson(response, status, { error: message, code });
}

// 解析 Cookie 头为对象(键值做 URL 解码)。
function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").map(item => item.trim()).filter(Boolean).map(item => {
    const index = item.indexOf("=");
    return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
  }));
}

// 读取并解析 JSON 请求体;超过 bodyLimit 抛 413,格式错误抛 400,空体返回 {}。
async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {                          // 流式累积请求体。
    size += chunk.length;
    if (size > bodyLimit) throw Object.assign(new Error("请求数据过大"), { status: 413 }); // 超限即断。
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw Object.assign(new Error("JSON 格式无效"), { status: 400 });
  }
}

// 读取二进制请求体(文件上传);超过 limit 抛 413。
async function readBuffer(request, limit = fileLimit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("文件超过 25 MB 限制"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// 发送二进制响应(文件下载)。
function sendBinary(response, status, body, headers = {}) {
  response.writeHead(status, securityHeaders({ "Cache-Control": "no-store", ...headers }));
  response.end(body);
}

// 把用户行裁剪为可对外返回的安全字段(不含口令哈希/盐)。
function publicUser(row) {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, email: row.email, role: row.role, status: row.status };
}

// 角色 → 权限列表。
function permissionsFor(role) {
  return rolePermissions[role] || [];
}

// 由请求 Cookie 解析会话:校验存在/未停用/未过期,过期则顺手删除。返回 {sessionId,csrfToken,user} 或 null。
function authenticate(request) {
  const token = parseCookies(request)[sessionCookie];
  if (!token) return null;
  const row = db.prepare(`SELECT sessions.id AS session_id, sessions.csrf_token, sessions.expires_at,
      users.id, users.workspace_id, users.name, users.email, users.role, users.status
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?`).get(hashToken(token));
  if (!row || row.status !== "active" || row.expires_at <= isoNow()) {
    if (row) db.prepare("DELETE FROM sessions WHERE id = ?").run(row.session_id);
    return null;
  }
  return { sessionId: row.session_id, csrfToken: row.csrf_token, user: publicUser(row) };
}

// 要求已登录:未登录则发 401 并返回 null(调用方据此提前返回)。
function requireAuth(request, response) {
  const auth = authenticate(request);
  if (!auth) sendError(response, 401, "请先登录", "AUTH_REQUIRED");
  return auth;
}

// 校验 CSRF:请求头 x-csrf-token 必须与会话内令牌一致(防跨站写操作)。
function requireCsrf(request, response, auth) {
  const token = request.headers["x-csrf-token"];
  if (!token || token !== auth.csrfToken) {
    sendError(response, 403, "安全令牌无效，请刷新后重试", "CSRF_INVALID");
    return false;
  }
  return true;
}

// 当前用户是否具备某权限。
function hasPermission(auth, permission) {
  return permissionsFor(auth.user.role).includes(permission);
}

// 要求具备某权限:无则发 403 返回 false。
function requirePermission(response, auth, permission) {
  if (hasPermission(auth, permission)) return true;
  sendError(response, 403, "当前角色无权执行此操作", "PERMISSION_DENIED");
  return false;
}

// 写一条审计记录(动作/详情/IP),字段做长度截断。
function audit(auth, action, detail, request) {
  db.prepare(`INSERT INTO audit_logs (id, workspace_id, user_id, action, detail, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id("audit"), auth.user.workspaceId, auth.user.id, String(action).slice(0, 80), String(detail).slice(0, 500), request.socket.remoteAddress || "", isoNow());
}

// 读取工作区最近的审计记录(关联用户名)。
function auditRows(workspaceId, limit = 100) {
  return db.prepare(`SELECT audit_logs.id, audit_logs.action, audit_logs.detail, audit_logs.created_at,
      audit_logs.user_id, users.name AS member
    FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
    WHERE audit_logs.workspace_id = ? ORDER BY audit_logs.created_at DESC LIMIT ?`).all(workspaceId, limit)
    .map(row => ({ id: row.id, action: row.action, detail: row.detail, caseId: "", member: row.member || "系统", createdAt: row.created_at }));
}

// 当事人可访问的案件 id 集合;非当事人返回 null(表示不受限,可访问全部)。
function accessibleCaseIds(auth) {
  if (auth.user.role !== "client") return null;
  return new Set(db.prepare("SELECT case_id FROM case_access WHERE user_id = ?").all(auth.user.id).map(row => row.case_id));
}

// 读取并解析工作区业务状态 JSON(案件/证据/任务等)。
function workspaceState(workspaceId) {
  const row = db.prepare("SELECT data_json FROM workspace_states WHERE workspace_id = ?").get(workspaceId);
  return JSON.parse(row?.data_json || "{}");
}

// 是否有权访问某案件:当事人查授权表,其他角色看案件是否存在于本工作区。
function canAccessCase(auth, caseId) {
  if (auth.user.role === "client") return Boolean(db.prepare("SELECT 1 FROM case_access WHERE user_id = ? AND case_id = ?").get(auth.user.id, caseId));
  return (workspaceState(auth.user.workspaceId).cases || []).some(item => item.id === caseId);
}

// 把 case_files 行裁剪为前端用的对象;默认只给文本预览,includeText 时附完整抽取文本。
function publicCaseFile(row, includeText = false) {
  const result = {
    id: row.id,
    caseId: row.case_id,
    name: row.original_name,
    mimeType: row.mime_type,
    size: Number(row.size),
    sha256: row.sha256,
    status: row.status,
    method: row.extraction_method || "",
    textLength: (row.extracted_text || "").length,
    textPreview: (row.extracted_text || "").slice(0, 180),
    error: row.error_message || "",
    createdAt: row.created_at,
    processedAt: row.processed_at
  };
  if (includeText) result.extractedText = row.extracted_text || "";
  return result;
}

// 允许上传的文件类型(文档/图片/音频);音频供庭审转写。
const allowedFileExtensions = new Set([".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".webm"]);

let pythonExtractorReady = null; // Python 加速器可用性的缓存(null=未探测)。

// 是否可用 Python 加速器（PyMuPDF + python-docx）。优先用它处理中文 PDF/DOCX；
// 不可用时自动回退到 ocr.mjs 的零依赖实现，使整套应用在无 Python 环境下仍可运行。
function pythonExtractorAvailable() {
  if (pythonExtractorReady !== null) return pythonExtractorReady;
  if (process.env.HENGFA_DISABLE_PYTHON === "1") { pythonExtractorReady = false; return false; }
  const python = process.env.HENGFA_PYTHON_BIN || "python3";
  const probe = spawnSync(python, ["-c", "import fitz, docx"], { timeout: 10000, stdio: "ignore" });
  pythonExtractorReady = probe.status === 0;
  return pythonExtractorReady;
}

// 调用 scripts/extract_text.py 抽取文本,解析其 JSON 输出为统一结果结构。
function extractWithPython(filePath) {
  const python = process.env.HENGFA_PYTHON_BIN || "python3";
  const result = spawnSync(python, [path.join(root, "scripts", "extract_text.py"), filePath], {
    encoding: "utf8",
    timeout: 180000,             // 扫描件 OCR 可能较慢。
    maxBuffer: 20 * 1024 * 1024
  });
  let data = {};
  try {
    data = JSON.parse((result.stdout || "{}").trim());
  } catch (error) {
    data = { error: (result.stderr || "文字提取程序输出无效").trim() };
  }
  if (result.status !== 0 || data.error) return { status: "error", text: "", method: "", error: data.error || result.stderr || "文字提取失败" };
  if (!String(data.text || "").trim()) return { status: "partial", text: "", method: data.method || "", error: "未识别到可用文字" };
  return {
    status: data.warnings?.length ? "partial" : "processed",
    text: String(data.text),
    method: data.method || "unknown",
    error: (data.warnings || []).join("；")
  };
}

// 抽取案件文件文本:优先 Python 加速器,出错则回退零依赖 ocr.mjs;文本上限 5MB。
function extractCaseFile(filePath, mime = "") {
  let result = pythonExtractorAvailable() ? extractWithPython(filePath) : extractTextLocally(filePath, mime);
  if (result.status === "error" && pythonExtractorAvailable()) {          // Python 失败时回退本地实现。
    const fallback = extractTextLocally(filePath, mime);
    if (fallback.status !== "error") result = { ...fallback, method: `${fallback.method}-fallback` };
  }
  return { ...result, text: String(result.text || "").slice(0, 5_000_000) };
}

// 中文检索分词:英数字取≥2 连续串,中文取相邻"双字"二元组(bigram),最多 60 个 token。
function legalSearchTokens(text) {
  const normalized = String(text || "").normalize("NFKC").toLowerCase();
  const tokens = new Set(normalized.match(/[a-z0-9]{2,}/g) || []);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let index = 0; index < chinese.length - 1; index += 1) tokens.add(`${chinese[index]}${chinese[index + 1]}`);
  if (chinese.length === 1) tokens.add(chinese[0]);
  return [...tokens].slice(0, 60);
}

// 把长文按空行切成 ≤900 字的检索分块(无空行则定长切),最多 5000 块。
function chunkLegalText(text) {
  const paragraphs = String(text || "").replace(/\r/g, "").split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > 900) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? "\n\n" : ""}${paragraph}`;
  }
  if (current) chunks.push(current);
  if (!chunks.length && String(text).trim()) {
    for (let index = 0; index < String(text).length; index += 900) chunks.push(String(text).slice(index, index + 900));
  }
  return chunks.slice(0, 5000);
}

// 为一条法源建/重建 FTS 索引 + 语义向量:分块→事务内先删旧再插新(失败回滚)。
// 向量在事务外先算(可能调用外部稠密引擎,避免持写锁期间等子进程)。
function indexLegalSource(sourceId, text) {
  const chunks = chunkLegalText(text);
  const embeddings = embedBatch(chunks);
  const insertChunk = db.prepare("INSERT INTO legal_chunks_fts (chunk_id, source_id, search_text, content) VALUES (?, ?, ?, ?)");
  const insertEmbed = db.prepare("INSERT INTO legal_embeddings (chunk_id, source_id, content, model, dim, vector) VALUES (?, ?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM legal_chunks_fts WHERE source_id = ?").run(sourceId);
    db.prepare("DELETE FROM legal_embeddings WHERE source_id = ?").run(sourceId);
    chunks.forEach((content, index) => {
      const chunkId = `${sourceId}:${index + 1}`;
      insertChunk.run(chunkId, sourceId, legalSearchTokens(content).join(" "), content);
      const e = embeddings[index];
      insertEmbed.run(chunkId, sourceId, content, e.model, e.dim, vectorToBlob(e.vector));
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return chunks.length;
}

// 类案裁判要旨入库索引（单条要旨作为一个 chunk）+ 语义向量。
function indexPrecedent(precedentId, text) {
  const { vector, model, dim } = embedOne(text);
  db.prepare("DELETE FROM precedent_fts WHERE precedent_id = ?").run(precedentId);
  db.prepare("INSERT INTO precedent_fts (precedent_id, search_text, content) VALUES (?, ?, ?)")
    .run(precedentId, legalSearchTokens(text).join(" "), text);
  db.prepare("DELETE FROM precedent_embeddings WHERE precedent_id = ?").run(precedentId);
  db.prepare("INSERT INTO precedent_embeddings (precedent_id, model, dim, vector) VALUES (?, ?, ?, ?)")
    .run(precedentId, model, dim, vectorToBlob(vector));
}

// 记录法源字段变更留痕(创建、效力状态变更等)。
function recordLegalRevision(sourceId, workspaceId, field, oldValue, newValue, userId) {
  db.prepare(`INSERT INTO legal_source_revisions (id, source_id, workspace_id, field, old_value, new_value, changed_by, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id("rev"), sourceId, workspaceId, field, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue), userId, isoNow());
}

// 法源是否已失效(默认检索排除这些状态)。
function isLapsedStatus(status) {
  return /废止|失效|已修改|尚未生效/.test(String(status || ""));
}

// 法源检索:对查询分词 → FTS5 MATCH(OR 连接) → 按 BM25 排序;默认排除失效法源。
function searchLegalSources(workspaceId, query, limit = 8, { includeLapsed = false } = {}) {
  const tokens = legalSearchTokens(query);
  if (!tokens.length) return [];                                  // 无有效 token 直接空结果。
  const match = tokens.map(token => `"${token.replaceAll('"', '""')}"`).join(" OR "); // 每 token 加引号防注入,OR 召回。
  const lapsedClause = includeLapsed ? "" : `AND legal_sources.effective_status NOT LIKE '%废止%'
      AND legal_sources.effective_status NOT LIKE '%失效%'
      AND legal_sources.effective_status NOT LIKE '%已修改%'
      AND legal_sources.effective_status NOT LIKE '%尚未生效%'`;
  return db.prepare(`SELECT legal_chunks_fts.chunk_id, legal_chunks_fts.source_id, legal_chunks_fts.content,
      bm25(legal_chunks_fts) AS rank, legal_sources.title, legal_sources.authority, legal_sources.level,
      legal_sources.effective_status, legal_sources.effective_date, legal_sources.source_url
    FROM legal_chunks_fts JOIN legal_sources ON legal_sources.id = legal_chunks_fts.source_id
    WHERE legal_chunks_fts MATCH ? AND legal_sources.workspace_id = ? ${lapsedClause}
    ORDER BY rank LIMIT ?`).all(match, workspaceId, Math.max(1, Math.min(Number(limit) || 8, 20))).map(row => ({
      chunkId: row.chunk_id,
      sourceId: row.source_id,
      title: row.title,
      authority: row.authority,
      level: row.level,
      status: row.effective_status,
      effectiveDate: row.effective_date,
      sourceUrl: row.source_url,
      content: row.content,
      score: Number((-row.rank).toFixed(4))
    }));
}

// 类案检索：按 BM25 召回最相似的裁判要旨。
function searchPrecedents(workspaceId, query, limit = 8) {
  const tokens = legalSearchTokens(query);
  if (!tokens.length) return [];
  const match = tokens.map(token => `"${token.replaceAll('"', '""')}"`).join(" OR ");
  return db.prepare(`SELECT precedents.id, precedents.court, precedents.cause, precedents.outcome,
      precedents.year, precedents.title, precedents.gist, precedents.source_url, bm25(precedent_fts) AS rank
    FROM precedent_fts JOIN precedents ON precedents.id = precedent_fts.precedent_id
    WHERE precedent_fts MATCH ? AND precedents.workspace_id = ?
    ORDER BY rank LIMIT ?`).all(match, workspaceId, Math.max(1, Math.min(Number(limit) || 8, 20))).map(row => ({
      id: row.id,
      court: row.court,
      cause: row.cause,
      outcome: row.outcome,
      year: row.year,
      title: row.title,
      gist: row.gist,
      sourceUrl: row.source_url,
      score: Number((-row.rank).toFixed(4))
    }));
}

// —— 语义向量检索 + 混合召回（hybrid）——
// 设计文档「知识与数据层」要求向量数据库支撑语义检索：以下用本地向量(默认零依赖,可选稠密模型)
// 做余弦召回,再与 FTS5/BM25 词法召回经 RRF(倒数排名融合)合并,兼顾「同义/概念」与「精确字面」。

const RRF_K = 60; // 倒数排名融合常数(越大越平滑,业界常用 60)。

// 语义向量召回(法源)：编码查询 → 扫描同引擎签名向量算余弦 → 取 topK。
function vectorSearchLegal(workspaceId, query, limit = 8, { includeLapsed = false } = {}) {
  const q = embedOne(query);
  if (!q) return [];
  const lapsedClause = includeLapsed ? "" : `AND s.effective_status NOT LIKE '%废止%'
      AND s.effective_status NOT LIKE '%失效%' AND s.effective_status NOT LIKE '%已修改%'
      AND s.effective_status NOT LIKE '%尚未生效%'`;
  const rows = db.prepare(`SELECT e.chunk_id, e.source_id, e.content, e.vector,
      s.title, s.authority, s.level, s.effective_status, s.effective_date, s.source_url
    FROM legal_embeddings e JOIN legal_sources s ON s.id = e.source_id
    WHERE s.workspace_id = ? AND e.model = ? AND e.dim = ? ${lapsedClause}`).all(workspaceId, q.model, q.dim);
  return rows.map(row => ({
    chunkId: row.chunk_id, sourceId: row.source_id, title: row.title, authority: row.authority,
    level: row.level, status: row.effective_status, effectiveDate: row.effective_date,
    sourceUrl: row.source_url, content: row.content,
    score: Number(cosineSim(q.vector, blobToVector(row.vector)).toFixed(4))
  })).filter(item => item.score > 0.02).sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)));
}

// 语义向量召回(类案)。
function vectorSearchPrecedents(workspaceId, query, limit = 8) {
  const q = embedOne(query);
  if (!q) return [];
  const rows = db.prepare(`SELECT p.id, p.court, p.cause, p.outcome, p.year, p.title, p.gist, p.source_url, e.vector
    FROM precedent_embeddings e JOIN precedents p ON p.id = e.precedent_id
    WHERE p.workspace_id = ? AND e.model = ? AND e.dim = ?`).all(workspaceId, q.model, q.dim);
  return rows.map(row => ({
    id: row.id, court: row.court, cause: row.cause, outcome: row.outcome, year: row.year,
    title: row.title, gist: row.gist, sourceUrl: row.source_url,
    score: Number(cosineSim(q.vector, blobToVector(row.vector)).toFixed(4))
  })).filter(item => item.score > 0.02).sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)));
}

// RRF 融合两路召回:对每路按名次给 1/(k+rank) 分,按 keyOf 去重累加,附两路原始分。
function fuseByRrf(lexical, semantic, keyOf, limit) {
  const merged = new Map();
  const absorb = (list, field) => list.forEach((item, index) => {
    const key = keyOf(item);
    const entry = merged.get(key) || { item, rrf: 0, lexScore: null, vecScore: null };
    entry.rrf += 1 / (RRF_K + index + 1);
    if (field === "lex") entry.lexScore = item.score;
    else entry.vecScore = item.score;
    merged.set(key, entry);
  });
  absorb(lexical, "lex");
  absorb(semantic, "vec");
  return [...merged.values()].sort((a, b) => b.rrf - a.rrf).slice(0, limit).map(entry => ({
    ...entry.item,
    score: Number(entry.rrf.toFixed(6)),     // 对外 score 改为融合分。
    lexScore: entry.lexScore,                // 词法 BM25 分(无则 null)。
    vectorScore: entry.vecScore              // 语义余弦分(无则 null)。
  }));
}

// 混合检索(法源):FTS5/BM25 ∪ 语义向量,RRF 融合。向量库为空时自动退化为纯 FTS。
function hybridSearchLegal(workspaceId, query, limit = 8, { includeLapsed = false } = {}) {
  const cap = Math.max(1, Math.min(Number(limit) || 8, 20));
  const lexical = searchLegalSources(workspaceId, query, cap * 2, { includeLapsed });
  const semantic = vectorSearchLegal(workspaceId, query, cap * 2, { includeLapsed });
  if (!semantic.length) return lexical.slice(0, cap);
  return fuseByRrf(lexical, semantic, item => item.chunkId, cap);
}

// 混合检索(类案)。
function hybridSearchPrecedents(workspaceId, query, limit = 8) {
  const cap = Math.max(1, Math.min(Number(limit) || 8, 20));
  const lexical = searchPrecedents(workspaceId, query, cap * 2);
  const semantic = vectorSearchPrecedents(workspaceId, query, cap * 2);
  if (!semantic.length) return lexical.slice(0, cap);
  return fuseByRrf(lexical, semantic, item => item.id, cap);
}

// 启动时补齐向量:为缺失或引擎签名失配的法源/类案重建向量,保证整库口径一致。
// 仅处理需要的条目;新库由播种时的 indexLegalSource/indexPrecedent 已覆盖,故通常是空操作。
function backfillEmbeddings() {
  const { model } = embedderInfo();
  const staleSources = db.prepare(`SELECT DISTINCT fts.source_id FROM legal_chunks_fts fts
    WHERE NOT EXISTS (SELECT 1 FROM legal_embeddings e WHERE e.chunk_id = fts.chunk_id AND e.model = ?)`).all(model);
  for (const { source_id } of staleSources) {
    const chunks = db.prepare("SELECT content FROM legal_chunks_fts WHERE source_id = ? ORDER BY chunk_id").all(source_id).map(row => row.content);
    if (!chunks.length) continue;
    const embeddings = embedBatch(chunks);
    const insertEmbed = db.prepare("INSERT INTO legal_embeddings (chunk_id, source_id, content, model, dim, vector) VALUES (?, ?, ?, ?, ?, ?)");
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM legal_embeddings WHERE source_id = ?").run(source_id);
      chunks.forEach((content, index) => insertEmbed.run(`${source_id}:${index + 1}`, source_id, content, embeddings[index].model, embeddings[index].dim, vectorToBlob(embeddings[index].vector)));
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); console.error("[embedding] 法源向量补齐失败:", error.message); }
  }
  const stalePrecedents = db.prepare(`SELECT p.id, p.cause, p.title, p.gist FROM precedents p
    WHERE NOT EXISTS (SELECT 1 FROM precedent_embeddings e WHERE e.precedent_id = p.id AND e.model = ?)`).all(model);
  for (const row of stalePrecedents) {
    const { vector, dim } = embedOne(`${row.cause}。${row.title}。${row.gist}`);
    db.prepare("DELETE FROM precedent_embeddings WHERE precedent_id = ?").run(row.id);
    db.prepare("INSERT INTO precedent_embeddings (precedent_id, model, dim, vector) VALUES (?, ?, ?, ?)").run(row.id, model, dim, vectorToBlob(vector));
  }
  if (staleSources.length || stalePrecedents.length) console.log(`Backfilled embeddings: ${staleSources.length} sources, ${stalePrecedents.length} precedents (${model}).`);
}

// 本地启发式裁判倾向聚合：统计召回类案中支持 / 部分支持 / 驳回的占比（仅供参考）。
function tendencyFromPrecedents(results) {
  const buckets = { 支持: 0, 部分支持: 0, 驳回: 0 };
  for (const item of results) if (item.outcome in buckets) buckets[item.outcome] += 1;
  const total = buckets.支持 + buckets.部分支持 + buckets.驳回;
  const pct = value => (total ? Math.round((value / total) * 100) : 0);
  const lead = total
    ? Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0]
    : null;
  return {
    total,
    support: buckets.支持,
    partial: buckets.部分支持,
    dismiss: buckets.驳回,
    supportPct: pct(buckets.支持),
    partialPct: pct(buckets.部分支持),
    dismissPct: pct(buckets.驳回),
    lead
  };
}

// 可选 Claude 类案综述：仅依据召回的裁判要旨片段，强制附「（依据：类案N）」，异常由调用方回退。
async function claudePrecedentSummary(query, results) {
  const context = results.map((item, index) => `【类案${index + 1}｜${item.cause}｜${item.court}｜结果：${item.outcome}】\n${item.title}。${item.gist}`).join("\n\n");
  const system = "你是中国民事诉讼类案分析助理。只能依据下面提供的【类案裁判要旨】综述裁判倾向与影响裁判的关键因素，不得引用片段之外的案例、法条或数字，不得编造。每个结论后用「（依据：类案N）」标注来源。须明确指出这是基于样例类案的倾向参考、并非胜败概率或确定性意见，结尾提示应回到正式裁判文书库核验。用简洁、可操作的中文回答。";
  return claudeChat({ system, user: `当前案件检索语：${query}\n\n召回的类案裁判要旨：\n${context}`, maxTokens: 900, hint: query });
}

// 类案倾向的本地综述（不调用模型）。
function localTendencySummary(tendency, results) {
  if (!tendency.total) return "未检索到相似类案样例。可调整案由或关键事实关键词后重试，或由管理员导入更多类案。";
  const parts = [`在 ${tendency.total} 件相似类案样例中，支持 ${tendency.support} 件（${tendency.supportPct}%）、部分支持 ${tendency.partial} 件（${tendency.partialPct}%）、驳回 ${tendency.dismiss} 件（${tendency.dismissPct}%）。`];
  if (tendency.lead) parts.push(`倾向以「${tendency.lead}」居多。`);
  const dismiss = results.find(item => item.outcome === "驳回");
  if (dismiss) parts.push(`需重点关注被驳回类案的风险点：${dismiss.title}。`);
  parts.push("以上为样例类案的倾向参考，不代表胜败概率或确定性结论，须回到正式裁判文书库核验。");
  return parts.join("");
}

const HEARING_KEYWORDS = /自认|承认|认可|无异议|有异议|不认可|不予认可|否认|质证|争议焦点|当庭|和解|调解|举证|鉴定|管辖|陈述/;

// 本地启发式庭审小结（不调用模型）：统计发言并摘录自认/异议/质证等关键发言。
function localHearingSummary(transcript) {
  const segments = parseTranscript(transcript);
  if (!segments.length) return "未解析到有效庭审笔录内容。导入文本支持 SRT / VTT /「说话人：内容」/ 纯文本格式。";
  const speakers = [...new Set(segments.map(item => item.speaker).filter(Boolean))];
  const keyPoints = segments.filter(item => HEARING_KEYWORDS.test(item.text)).slice(0, 8);
  const lines = [`本庭审笔录共 ${segments.length} 段${speakers.length ? `，发言主体：${speakers.join("、")}` : ""}。`];
  if (keyPoints.length) {
    lines.push("关注要点（自认 / 异议 / 质证 / 争议等关键发言摘录）：");
    keyPoints.forEach((item, index) => lines.push(`${index + 1}. ${item.speaker ? item.speaker + "：" : ""}${item.text.slice(0, 80)}${item.text.length > 80 ? "…" : ""}${item.time ? `（${item.time}）` : ""}`));
  } else {
    lines.push("未自动识别到自认 / 异议 / 质证等关键发言，请人工通读笔录确认。");
  }
  lines.push("以上为本地启发式摘录，仅供庭后整理参考，须结合完整笔录与录音核验。");
  return lines.join("\n");
}

// 可选 Claude 庭审小结：仅依据庭审发言，强制附「（依据：发言N）」，异常由调用方回退。
async function claudeHearingSummary(caseItem, transcript) {
  const segments = parseTranscript(transcript);
  const context = segments.map((item, index) => `【发言${index + 1}${item.time ? `｜${item.time}` : ""}${item.speaker ? `｜${item.speaker}` : ""}】${item.text}`).join("\n").slice(0, 16000);
  const system = "你是中国民事诉讼庭审记录分析助理。只能依据下面提供的【庭审发言】归纳，不得引用发言之外的信息或编造。请分四部分输出：一、争议焦点；二、各方自认/不利陈述；三、质证与证据意见；四、待跟进事项。每个结论后用「（依据：发言N）」标注来源；信息不足处应明确说明。结尾提示须结合完整笔录与录音核验。用简洁中文回答。";
  return claudeChat({ system, user: `案件：${caseItem?.title || ""}\n\n庭审发言：\n${context}`, maxTokens: 1200 });
}

// 抽取式回答：按相关度摘录检索片段，不做生成，避免编造。
function extractiveAnswer(results) {
  if (!results.length) return "当前正式法源库中未检索到可靠依据。请补充关键词或由管理员导入经核验的法源后重试。";
  return `检索到 ${results.length} 个相关法源片段。以下内容仅按相关度摘录，应结合完整条文、效力状态和案件事实核验：\n\n${results.slice(0, 3).map((item, index) => `${index + 1}. ${item.content.slice(0, 320)}`).join("\n\n")}`;
}

// 统一 Claude 基座客户端：所有生成式能力共用此入口。仅在基座启用时可调用，
// 任何网络/状态/空内容异常都抛出，由各调用方 catch 并回退到本地结果。
// 每次调用都经法律领域适配层 applyDomain 组合「领域系统提示 + 任务提示（+ 命中术语提示）」，
// 把领域知识固化进每次推理（设计文档「基座模型 + 法律领域微调」的本地可落地形态）。
async function claudeChat({ system, user, maxTokens = 1024, timeout = 40000, hint = "" }) {
  if (!llmEnabled) throw new Error("Claude 基座未启用");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": llmApiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: llmModel, max_tokens: maxTokens, system: applyDomain(system, hint), messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`Claude API ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
  const data = await response.json();
  const text = (data.content || []).filter(part => part.type === "text").map(part => part.text).join("").trim();
  if (!text) throw new Error("Claude 返回空内容");
  return text;
}

// 可选 Claude 生成式回答：仅以检索片段为依据，强制附「（依据：片段N）」，异常由调用方回退。
async function claudeAnswer(query, results) {
  const context = results.map((item, index) => `【片段${index + 1}｜${item.title}｜${item.authority}｜${item.status}】\n${item.content}`).join("\n\n");
  const system = "你是中国民事诉讼法律检索助理。只能依据下面提供的【检索片段】作答，不得引用片段之外的法条、案例或数字，不得编造。每个结论后用「（依据：片段N）」标注来源；片段不足以回答时应明确说明并建议核验正式法源。用简洁、可操作的中文回答，并在结尾提示最终须由办案人员核验现行条文与效力状态。";
  return claudeChat({ system, user: `问题：${query}\n\n可用检索片段：\n${context}`, maxTokens: 1024 });
}

// —— 文书 Agent：事实抽取与引用校验（纯函数，便于单测）——

const FACT_KEYWORDS = ["合同", "协议", "签订", "交付", "验收", "付款", "货款", "欠款", "尾款", "违约", "借款", "还款", "履行", "送达", "质量", "逾期", "利息", "赔偿", "定金", "转账", "收据", "发票", "对账", "解除", "担保", "抵押", "保证"];
const DATE_RE = /\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}-\d{1,2}-\d{1,2}/;
const AMOUNT_RE = /(?:人民币|¥)?\s*\d[\d,，]*(?:\.\d+)?\s*(?:元|万元)/;

// 按中文句末标点/换行断句,只保留 8~220 字的句子(过短无信息、过长非要件句)。
function splitSentences(text) {
  return String(text || "").replace(/\r/g, "").split(/(?<=[。！？；\n])/).map(s => s.trim()).filter(s => s.length >= 8 && s.length <= 220);
}

// 给句子打要件类型标签:时间/金额/当事人/权利义务(命中相应正则或关键词)。
function factTypes(sentence, caseItem) {
  const types = [];
  if (DATE_RE.test(sentence)) types.push("时间");
  if (AMOUNT_RE.test(sentence)) types.push("金额");
  if ((caseItem?.client && sentence.includes(caseItem.client)) || (caseItem?.opposingParty && sentence.includes(caseItem.opposingParty))) types.push("当事人");
  if (FACT_KEYWORDS.some(word => sentence.includes(word))) types.push("权利义务");
  return types;
}

// 从句子中解析可排序的日期键（年 / 年月 / 年月日 / YYYY-M-D），无法解析返回 null。
function parseFactDate(text) {
  const pad = value => String(value).padStart(2, "0");
  let m;
  if ((m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/))) return `${m[1]}-${pad(m[2])}-01`;
  if ((m = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = text.match(/(\d{4})\s*年/))) return `${m[1]}-01-01`;
  return null;
}

// 从案件文件文本中抽取带来源、类型与日期标注的候选事实句。
function extractFactCandidates(caseTexts, caseItem, limit = 20) {
  const facts = [];
  for (const file of caseTexts) {
    for (const sentence of splitSentences(file.text)) {
      const types = factTypes(sentence, caseItem);
      if (!types.length) continue;
      const score = types.length + (/(违约|欠款|货款|借款|赔偿|解除|逾期)/.test(sentence) ? 1 : 0) + (types.includes("金额") ? 1 : 0);
      facts.push({ fact: sentence, source: file.name, types, score, date: parseFactDate(sentence) });
    }
  }
  const seen = new Set();
  return facts.sort((a, b) => b.score - a.score).filter(item => {
    const key = item.fact.slice(0, 36);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

// 把带日期的事实按时间升序排列，形成案件时间线。
function buildTimeline(facts) {
  return facts.filter(item => item.date).sort((a, b) => a.date.localeCompare(b.date));
}

// 识别文书草稿中的法律引用：书名号、法律名+第X条、常见法律概念。
function findLegalReferences(content) {
  const text = String(content || "");
  const refs = new Set();
  for (const match of text.matchAll(/《([^》]{2,40})》/g)) refs.add(match[1].trim());
  for (const match of text.matchAll(/(?:中华人民共和国[^，。；\n、（(]{2,12}法|民法典|民事诉讼法|[^，。；\n、（(]{0,10}司法解释)\s*第[一二三四五六七八九十百千零〇\d]+条(?:第[一二三四五六七八九十\d]+款)?/g)) refs.add(match[0].trim());
  for (const term of ["违约责任", "诉讼时效", "举证责任", "合同解除", "损失赔偿", "可得利益", "善意取得", "保证责任", "财产保全", "强制执行", "定金", "不安抗辩", "代位权", "撤销权"]) if (text.includes(term)) refs.add(term);
  return [...refs];
}

// 归一金额串以便比对(去掉千分位逗号、空白、"人民币/¥")。
function normalizeAmount(value) {
  return String(value).replace(/[,，\s人民币¥]/g, "");
}

// 校验文书：法条引用 → FTS5 法源库；关键事实（金额/当事人）→ 案件材料与证据。
function verifyDocumentContent(workspaceId, content, caseItem, caseTexts, evidence) {
  const legal = findLegalReferences(content).map(ref => {
    const matched = searchLegalSources(workspaceId, ref, 1, { includeLapsed: true })[0];
    if (!matched || matched.score < 2) return { ref, status: "unverified", matched: null };
    const info = { title: matched.title, authority: matched.authority, status: matched.status, chunkId: matched.chunkId };
    return { ref, status: isLapsedStatus(matched.status) ? "outdated" : "verified", matched: info };
  });

  // 在案件材料与证据中定位某关键词，返回命中的来源（文件或证据名）。
  const locate = (needle, asAmount) => {
    const norm = asAmount ? normalizeAmount : value => String(value);
    const target = norm(needle);
    for (const file of caseTexts) if (norm(file.text).includes(target)) return { name: file.name, kind: "file" };
    for (const item of evidence || []) if (norm(`${item.name} ${item.fact || ""} ${item.note || ""}`).includes(target)) return { name: item.name, kind: "evidence" };
    return null;
  };

  const facts = [];
  const amounts = new Set([...String(content || "").matchAll(/\d[\d,，]*(?:\.\d+)?\s*(?:元|万元)/g)].map(match => match[0]));
  for (const amount of amounts) {
    const hit = caseTexts.length || (evidence || []).length ? locate(amount, true) : null;
    facts.push({ claim: `金额：${amount.trim()}`, type: "金额", status: hit ? "grounded" : "ungrounded", source: hit?.name || "", sourceKind: hit?.kind || "" });
  }
  for (const party of [caseItem?.client, caseItem?.opposingParty].filter(Boolean)) {
    if (!String(content || "").includes(party)) continue;
    const hit = locate(party, false);
    facts.push({ claim: `当事人：${party}`, type: "当事人", status: hit ? "grounded" : "ungrounded", source: hit?.name || "", sourceKind: hit?.kind || "" });
  }

  return {
    legal,
    facts,
    unverifiedLegal: legal.filter(item => item.status === "unverified").length,
    outdatedLegal: legal.filter(item => item.status === "outdated").length,
    ungroundedFacts: facts.filter(item => item.status === "ungrounded").length,
    filesScanned: caseTexts.length
  };
}

// 取某案件所有已抽取出文本的文件(供事实抽取/引用校验/类案检索)。
function caseFileTexts(workspaceId, caseId) {
  return db.prepare("SELECT original_name, extracted_text FROM case_files WHERE workspace_id = ? AND case_id = ? AND extracted_text IS NOT NULL AND length(extracted_text) > 0")
    .all(workspaceId, caseId)
    .map(row => ({ name: row.original_name, text: row.extracted_text }));
}

// 可选 Claude 结构化事实抽取：仅依据案件材料，输出带来源的事实 JSON；调用方异常回退本地。
async function claudeExtractFacts(caseItem, caseTexts) {
  const context = caseTexts.map(file => `【${file.name}】\n${file.text.slice(0, 4000)}`).join("\n\n").slice(0, 16000);
  const system = "你是中国民事诉讼案件事实抽取助理。只能依据提供的【案件材料】抽取客观要件事实，不得编造或加入材料之外的信息。仅输出 JSON 数组，每个元素为 {\"fact\":\"一句客观事实\",\"source\":\"来源文件名\",\"types\":[\"时间\"|\"金额\"|\"当事人\"|\"权利义务\"]}，聚焦时间、金额、交付/付款/违约/履行等要件，最多 20 条。";
  const userMessage = `案件：${caseItem?.title || ""}\n当事人：${caseItem?.client || ""} / ${caseItem?.opposingParty || ""}\n\n案件材料：\n${context}\n\n请输出 JSON 数组。`;
  const text = await claudeChat({ system, user: userMessage, maxTokens: 1500, hint: [caseItem?.cause, caseItem?.claims].filter(Boolean).join(" ") });
  const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
  return parsed.filter(item => item && item.fact).slice(0, 20).map(item => ({
    fact: String(item.fact).slice(0, 220),
    source: String(item.source || "案件材料"),
    types: Array.isArray(item.types) ? item.types.map(String) : []
  }));
}

// 这些数组按 caseId 归属于具体案件,当事人视图需逐数组过滤。
const caseScopedArrays = ["evidence", "tasks", "timeLogs", "assetClues", "documentVersions", "caseEvents"];

// 按角色裁剪下发给前端的状态:当事人仅见授权案件且去除审计/设置;其他角色可带审计(需权限)。
function filterStateForUser(state, auth) {
  const filtered = structuredClone(state || {});
  const allowed = accessibleCaseIds(auth);
  if (allowed) {
    filtered.cases = (filtered.cases || []).filter(item => allowed.has(item.id));
    for (const key of caseScopedArrays) filtered[key] = (filtered[key] || []).filter(item => allowed.has(item.caseId));
    filtered.activeCaseId = filtered.cases[0]?.id || "";
    filtered.auditLogs = [];
    filtered.settings = {};
  } else {
    filtered.auditLogs = hasPermission(auth, "view_audit") ? auditRows(auth.user.workspaceId) : [];
  }
  return filtered;
}

// 清洗客户端提交的状态:只保留白名单数组/字段并限量,防止写入异常结构。
function sanitizeState(value) {
  const source = value && typeof value === "object" ? value : {};
  const clean = {};
  const arrays = ["cases", ...caseScopedArrays, "qaMessages"];
  for (const key of arrays) clean[key] = Array.isArray(source[key]) ? source[key].slice(0, 10000) : []; // 每数组上限 1 万条。
  clean.activeCaseId = String(source.activeCaseId || "");
  clean.settings = source.settings && typeof source.settings === "object" ? source.settings : {};
  clean.metrics = source.metrics && typeof source.metrics === "object" ? source.metrics : {};
  return clean;
}

// 按角色合并状态写入,限制各角色可改范围:管理员全量;律师不可改工作区设置;
// 助理只能改证据/任务/工时等业务数组(不动案件与设置);当事人(返回 null)不可写。
function mergeByRole(currentState, incomingState, auth) {
  const current = sanitizeState(currentState);
  const incoming = sanitizeState(incomingState);
  if (auth.user.role === "admin") return incoming;                              // 管理员:整盘覆盖。
  if (auth.user.role === "lawyer") return { ...incoming, settings: current.settings }; // 律师:保留原设置。
  if (auth.user.role === "assistant") {
    return {
      ...current,
      evidence: incoming.evidence,
      tasks: incoming.tasks,
      timeLogs: incoming.timeLogs,
      assetClues: incoming.assetClues,
      documentVersions: incoming.documentVersions,
      caseEvents: incoming.caseEvents,
      qaMessages: incoming.qaMessages,
      metrics: incoming.metrics
    };
  }
  return null;
}

const loginAttempts = new Map(); // 登录失败计数(按 IP+邮箱),内存级限流。

// 是否允许继续尝试登录:15 分钟窗口内失败 <5 次;窗口过期自动重置。
function loginAllowed(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  return entry.count < 5;
}

// 记录一次登录失败(计数 +1)。
function recordLoginFailure(key) {
  const entry = loginAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  entry.count += 1;
  loginAttempts.set(key, entry);
}

// 所有 /api/* 请求的总分发器:按 方法+路径 依次匹配端点。除登录外都先过 requireAuth;
// 写操作各自再校验 CSRF 与权限。匹配不到则在末尾返回 404。
async function handleApi(request, response, url) {
  // 登录:限流 → 校验口令 → 建会话(令牌只存哈希)→ 下发 HttpOnly Cookie + CSRF 令牌。
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const attemptKey = `${request.socket.remoteAddress || "local"}:${email}`;   // 限流键:IP+邮箱。
    if (!loginAllowed(attemptKey)) return sendError(response, 429, "登录尝试过多，请稍后再试", "LOGIN_RATE_LIMITED");
    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!row || row.status !== "active" || !verifyPassword(password, row.password_salt, row.password_hash)) {
      recordLoginFailure(attemptKey);
      return sendError(response, 401, "邮箱或密码错误", "LOGIN_FAILED");
    }
    loginAttempts.delete(attemptKey);
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const sessionId = id("session");
    const expiresAt = new Date(Date.now() + sessionHours * 3600000).toISOString();
    db.prepare("INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(sessionId, row.id, hashToken(token), csrfToken, isoNow(), expiresAt);
    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(isoNow(), row.id);
    const auth = { sessionId, csrfToken, user: publicUser(row) };
    audit(auth, "用户登录", `${row.email} 登录系统`, request);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return sendJson(response, 200, { user: auth.user, csrfToken, permissions: permissionsFor(row.role) }, {
      "Set-Cookie": `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionHours * 3600}${secure}`
    });
  }

  // —— 以下端点均需登录 —— 。
  const auth = requireAuth(request, response);
  if (!auth) return;

  // 当前会话信息(用户/CSRF/权限),前端启动时据此判断是否已登录。
  if (request.method === "GET" && url.pathname === "/api/session") {
    return sendJson(response, 200, { user: auth.user, csrfToken: auth.csrfToken, permissions: permissionsFor(auth.user.role) });
  }

  // 退出:删会话并清 Cookie。
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    if (!requireCsrf(request, response, auth)) return;
    audit(auth, "用户退出", `${auth.user.email} 退出系统`, request);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(auth.sessionId);
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }

  // 修改密码:校验原密码与强度,改后注销其它会话(仅保留当前)。
  if (request.method === "POST" && url.pathname === "/api/auth/change-password") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    if (String(body.newPassword || "").length < 10) return sendError(response, 400, "新密码至少需要 10 个字符", "WEAK_PASSWORD");
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(auth.user.id);
    if (!verifyPassword(String(body.currentPassword || ""), row.password_salt, row.password_hash)) return sendError(response, 400, "当前密码不正确", "PASSWORD_INVALID");
    const credentials = hashPassword(String(body.newPassword));
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(credentials.hash, credentials.salt, auth.user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(auth.user.id, auth.sessionId);
    audit(auth, "密码修改", "用户修改登录密码", request);
    return sendJson(response, 200, { ok: true });
  }

  // 文字抽取能力探测(给前端展示是否支持图片 OCR/扫描件等)。
  if (request.method === "GET" && url.pathname === "/api/ocr/capabilities") {
    const python = pythonExtractorAvailable();
    const local = localExtractionCapabilities();
    return sendJson(response, 200, {
      // DOCX 与数字版 PDF 始终可用（Python 或 Node 兜底均可解析）。
      pdfAndDocx: python || true,
      imageOcr: python || local.tesseract,
      chineseOcr: python || local.hasChinese,
      scannedPdf: python || local.pdftoppm,
      engine: python ? "python+tesseract" : (local.tesseract ? "node+tesseract" : "node"),
      localOnly: true,
      maxFileSize: fileLimit
    });
  }

  // 庭审语音转写能力探测(本地引擎是否就绪、是否启用 Claude 小结)。
  if (request.method === "GET" && url.pathname === "/api/hearing/capabilities") {
    return sendJson(response, 200, { ...transcriptionCapabilities(), llmSummary: llmEnabled, maxFileSize: fileLimit });
  }

  // AI 能力中台探测：基座模型是否启用、模型名与法律领域适配画像（领域提示 + 术语/概念词典规模）。
  if (request.method === "GET" && url.pathname === "/api/ai/capabilities") {
    return sendJson(response, 200, {
      baseModel: llmEnabled ? llmModel : null,        // 启用 Claude 基座时的模型名（可指向已微调模型）。
      generative: llmEnabled,                          // 是否启用生成式（默认关，走本地）。
      domainAdaptation: domainProfileInfo(),           // 法律领域适配画像（来源/术语数/概念组数）。
      localOnly: true
    });
  }

  // 语义检索能力探测(当前向量引擎、维度、是否稠密模型;混合检索始终启用)。
  if (request.method === "GET" && url.pathname === "/api/retrieval/capabilities") {
    const info = embedderInfo();
    return sendJson(response, 200, {
      hybrid: true,
      lexical: "sqlite-fts5-bm25-bigram",
      semantic: info.model,
      engine: info.engine,
      dim: info.dim,
      dense: info.dense,
      localOnly: true,
      vectorCount: Number(db.prepare("SELECT COUNT(*) AS count FROM legal_embeddings").get().count)
    });
  }

  // 列出案件文件(按访问权限过滤)。
  if (request.method === "GET" && url.pathname === "/api/files") {
    const requestedCaseId = String(url.searchParams.get("caseId") || "");
    const rows = requestedCaseId
      ? db.prepare("SELECT * FROM case_files WHERE workspace_id = ? AND case_id = ? ORDER BY created_at DESC").all(auth.user.workspaceId, requestedCaseId)
      : db.prepare("SELECT * FROM case_files WHERE workspace_id = ? ORDER BY created_at DESC").all(auth.user.workspaceId);
    const files = rows.filter(row => canAccessCase(auth, row.case_id)).map(row => publicCaseFile(row));
    return sendJson(response, 200, { files });
  }

  // 上传案件文件:校验类型/大小 → 落盘(0600,wx 防覆盖)→ 算 SHA256 → 抽取文本入库。
  if (request.method === "POST" && url.pathname === "/api/files") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_evidence")) return;
    const caseId = String(url.searchParams.get("caseId") || "");
    const originalName = path.basename(String(url.searchParams.get("name") || "未命名文件")).slice(0, 200); // basename 防路径穿越。
    if (!canAccessCase(auth, caseId)) return sendError(response, 404, "案件不存在或无访问权限", "CASE_NOT_FOUND");
    const extension = path.extname(originalName).toLowerCase();
    if (!allowedFileExtensions.has(extension)) return sendError(response, 415, "暂不支持该文件类型", "FILE_TYPE_UNSUPPORTED");
    const buffer = await readBuffer(request);
    if (!buffer.length) return sendError(response, 400, "文件内容为空", "FILE_EMPTY");
    const fileId = id("file");
    const storedName = `${fileId}${extension}`;
    const filePath = path.join(uploadsDir, storedName);
    writeFileSync(filePath, buffer, { flag: "wx", mode: 0o600 });
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const extraction = extractCaseFile(filePath, request.headers["content-type"] || "");
    const now = isoNow();
    db.prepare(`INSERT INTO case_files
      (id, workspace_id, case_id, original_name, stored_name, mime_type, size, sha256, status, extraction_method, extracted_text, error_message, uploaded_by, created_at, processed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(fileId, auth.user.workspaceId, caseId, originalName, storedName, request.headers["content-type"] || "application/octet-stream", buffer.length, sha256, extraction.status, extraction.method, extraction.text, extraction.error, auth.user.id, now, now);
    audit(auth, "案件文件上传", `${originalName} · ${Math.ceil(buffer.length / 1024)} KB · ${extraction.status}`, request);
    const row = db.prepare("SELECT * FROM case_files WHERE id = ?").get(fileId);
    return sendJson(response, 201, { file: publicCaseFile(row, true) });
  }

  // 下载案件文件原件(权限校验 + 附件方式返回,文件名 UTF-8 编码)。
  const fileDownloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
  if (request.method === "GET" && fileDownloadMatch) {
    const row = db.prepare("SELECT * FROM case_files WHERE id = ? AND workspace_id = ?").get(fileDownloadMatch[1], auth.user.workspaceId);
    if (!row || !canAccessCase(auth, row.case_id)) return sendError(response, 404, "文件不存在", "FILE_NOT_FOUND");
    const filePath = path.join(uploadsDir, row.stored_name);
    if (!existsSync(filePath)) return sendError(response, 404, "文件内容已丢失", "FILE_CONTENT_MISSING");
    return sendBinary(response, 200, readFileSync(filePath), {
      "Content-Type": row.mime_type,
      "Content-Length": String(row.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`
    });
  }

  // 重新抽取某文件的文本(如安装 Python 后重跑;更新 status/text)。
  const fileReprocessMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/reprocess$/);
  if (request.method === "POST" && fileReprocessMatch) {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_evidence")) return;
    const row = db.prepare("SELECT * FROM case_files WHERE id = ? AND workspace_id = ?").get(fileReprocessMatch[1], auth.user.workspaceId);
    if (!row || !canAccessCase(auth, row.case_id)) return sendError(response, 404, "文件不存在", "FILE_NOT_FOUND");
    const extraction = extractCaseFile(path.join(uploadsDir, row.stored_name), row.mime_type);
    db.prepare("UPDATE case_files SET status = ?, extraction_method = ?, extracted_text = ?, error_message = ?, processed_at = ? WHERE id = ?")
      .run(extraction.status, extraction.method, extraction.text, extraction.error, isoNow(), row.id);
    audit(auth, "OCR 重新处理", `${row.original_name} · ${extraction.status}`, request);
    return sendJson(response, 200, { file: publicCaseFile(db.prepare("SELECT * FROM case_files WHERE id = ?").get(row.id), true) });
  }

  // 单个文件:GET 取详情(含完整文本),DELETE 删除(同时删盘上文件)。
  const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
  if (request.method === "GET" && fileMatch) {
    const row = db.prepare("SELECT * FROM case_files WHERE id = ? AND workspace_id = ?").get(fileMatch[1], auth.user.workspaceId);
    if (!row || !canAccessCase(auth, row.case_id)) return sendError(response, 404, "文件不存在", "FILE_NOT_FOUND");
    return sendJson(response, 200, { file: publicCaseFile(row, true) });
  }
  if (request.method === "DELETE" && fileMatch) {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_evidence")) return;
    const row = db.prepare("SELECT * FROM case_files WHERE id = ? AND workspace_id = ?").get(fileMatch[1], auth.user.workspaceId);
    if (!row || !canAccessCase(auth, row.case_id)) return sendError(response, 404, "文件不存在", "FILE_NOT_FOUND");
    const filePath = path.join(uploadsDir, row.stored_name);
    if (existsSync(filePath)) unlinkSync(filePath);
    db.prepare("DELETE FROM case_files WHERE id = ?").run(row.id);
    audit(auth, "案件文件删除", row.original_name, request);
    return sendJson(response, 200, { ok: true });
  }

  // 列出工作区法源(附检索片段数与变更次数)。
  if (request.method === "GET" && url.pathname === "/api/legal/sources") {
    const sources = db.prepare(`SELECT legal_sources.*,
        (SELECT COUNT(*) FROM legal_chunks_fts WHERE source_id = legal_sources.id) AS chunk_count,
        (SELECT COUNT(*) FROM legal_source_revisions WHERE source_id = legal_sources.id) AS revision_count
      FROM legal_sources WHERE workspace_id = ? ORDER BY created_at DESC`).all(auth.user.workspaceId).map(row => ({
        id: row.id, title: row.title, authority: row.authority, level: row.level, status: row.effective_status,
        effectiveDate: row.effective_date, validUntil: row.valid_until || "", sourceUrl: row.source_url, chunkCount: Number(row.chunk_count),
        revisionCount: Number(row.revision_count), createdAt: row.created_at, updatedAt: row.updated_at
      }));
    return sendJson(response, 200, { sources });
  }

  // 单条新增法源:落库 → 建 FTS 索引 → 记"创建"留痕(索引失败则回滚删除)。
  if (request.method === "POST" && url.pathname === "/api/legal/sources") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    const body = await readJson(request);
    const text = String(body.text || "").trim();
    const title = String(body.title || "").trim();
    if (title.length < 2 || text.length < 20) return sendError(response, 400, "法源标题或正文过短", "LEGAL_SOURCE_INVALID");
    const sourceId = id("law");
    const now = isoNow();
    db.prepare(`INSERT INTO legal_sources
      (id, workspace_id, title, authority, level, effective_status, effective_date, valid_until, source_url, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sourceId, auth.user.workspaceId, title.slice(0, 200), String(body.authority || "待核验").slice(0, 120), String(body.level || "其他").slice(0, 80), String(body.status || "待核验").slice(0, 40), String(body.effectiveDate || ""), String(body.validUntil || "").slice(0, 40), String(body.sourceUrl || "").slice(0, 1000), auth.user.id, now, now);
    try {
      const chunkCount = indexLegalSource(sourceId, text);
      recordLegalRevision(sourceId, auth.user.workspaceId, "创建", null, String(body.status || "待核验").slice(0, 40), auth.user.id);
      audit(auth, "法源入库", `${title} · ${chunkCount} 个检索片段`, request);
      return sendJson(response, 201, { source: { id: sourceId, title, chunkCount } });
    } catch (error) {
      db.prepare("DELETE FROM legal_sources WHERE id = ?").run(sourceId);
      throw error;
    }
  }

  // 批量导入法源（用于官方法源库抓取结果或离线法源 JSON 入库）。
  if (request.method === "POST" && url.pathname === "/api/legal/import") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    const body = await readJson(request);
    const sources = Array.isArray(body.sources) ? body.sources.slice(0, 500) : [];
    if (!sources.length) return sendError(response, 400, "请提供 sources 数组", "IMPORT_EMPTY");
    const now = isoNow();
    const insert = db.prepare(`INSERT INTO legal_sources
      (id, workspace_id, title, authority, level, effective_status, effective_date, valid_until, source_url, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let imported = 0, chunks = 0, skipped = 0;
    for (const item of sources) {
      const title = String(item.title || "").trim();
      const text = String(item.text || "").trim();
      if (title.length < 2 || text.length < 20) { skipped += 1; continue; }
      const sourceId = id("law");
      insert.run(sourceId, auth.user.workspaceId, title.slice(0, 200), String(item.authority || "待核验").slice(0, 120), String(item.level || "其他").slice(0, 80), String(item.status || "待核验").slice(0, 40), String(item.effectiveDate || ""), String(item.validUntil || "").slice(0, 40), String(item.sourceUrl || "").slice(0, 1000), auth.user.id, now, now);
      try {
        chunks += indexLegalSource(sourceId, text);
        recordLegalRevision(sourceId, auth.user.workspaceId, "创建", null, String(item.status || "待核验").slice(0, 40), auth.user.id);
        imported += 1;
      } catch (error) { db.prepare("DELETE FROM legal_sources WHERE id = ?").run(sourceId); skipped += 1; }
    }
    audit(auth, "法源批量导入", `导入 ${imported} 条 · ${chunks} 片段 · 跳过 ${skipped}`, request);
    return sendJson(response, 201, { imported, chunks, skipped });
  }

  // 法源变更历史(留痕)。
  const legalRevMatch = url.pathname.match(/^\/api\/legal\/sources\/([^/]+)\/revisions$/);
  if (request.method === "GET" && legalRevMatch) {
    if (!requirePermission(response, auth, "manage_settings")) return;
    const source = db.prepare("SELECT id, title FROM legal_sources WHERE id = ? AND workspace_id = ?").get(legalRevMatch[1], auth.user.workspaceId);
    if (!source) return sendError(response, 404, "法源不存在", "LEGAL_SOURCE_NOT_FOUND");
    const revisions = db.prepare(`SELECT r.field, r.old_value, r.new_value, r.changed_at, u.name AS member
      FROM legal_source_revisions r LEFT JOIN users u ON u.id = r.changed_by
      WHERE r.source_id = ? ORDER BY r.changed_at DESC`).all(source.id)
      .map(row => ({ field: row.field, oldValue: row.old_value, newValue: row.new_value, changedAt: row.changed_at, member: row.member || "系统" }));
    return sendJson(response, 200, { title: source.title, revisions });
  }

  // 法源元数据 / 效力状态变更(逐字段留痕)。
  const legalSourceMatch = url.pathname.match(/^\/api\/legal\/sources\/([^/]+)$/);
  if (request.method === "PATCH" && legalSourceMatch) {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    const source = db.prepare("SELECT * FROM legal_sources WHERE id = ? AND workspace_id = ?").get(legalSourceMatch[1], auth.user.workspaceId);
    if (!source) return sendError(response, 404, "法源不存在", "LEGAL_SOURCE_NOT_FOUND");
    const body = await readJson(request);
    const editable = [
      { col: "effective_status", bodyKey: "status", label: "效力状态", max: 40 },
      { col: "effective_date", bodyKey: "effectiveDate", label: "生效日期", max: 40 },
      { col: "valid_until", bodyKey: "validUntil", label: "有效期至", max: 40 },
      { col: "title", bodyKey: "title", label: "名称", max: 200 },
      { col: "authority", bodyKey: "authority", label: "发布机关", max: 120 },
      { col: "level", bodyKey: "level", label: "效力层级", max: 80 },
      { col: "source_url", bodyKey: "sourceUrl", label: "来源链接", max: 1000 }
    ];
    let changes = 0;
    for (const field of editable) {
      if (!(field.bodyKey in body)) continue;
      const newValue = String(body[field.bodyKey] ?? "").slice(0, field.max);
      const oldValue = source[field.col] || "";
      if (newValue === oldValue) continue;
      db.prepare(`UPDATE legal_sources SET ${field.col} = ? WHERE id = ?`).run(newValue, source.id);
      recordLegalRevision(source.id, auth.user.workspaceId, field.label, oldValue, newValue, auth.user.id);
      changes += 1;
    }
    if (changes) db.prepare("UPDATE legal_sources SET updated_at = ? WHERE id = ?").run(isoNow(), source.id);
    audit(auth, "法源变更", `${source.title} · ${changes} 项`, request);
    return sendJson(response, 200, { ok: true, changes });
  }

  // 删除法源(连带删除其 FTS 索引与变更记录)。
  if (request.method === "DELETE" && legalSourceMatch) {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    const source = db.prepare("SELECT * FROM legal_sources WHERE id = ? AND workspace_id = ?").get(legalSourceMatch[1], auth.user.workspaceId);
    if (!source) return sendError(response, 404, "法源不存在", "LEGAL_SOURCE_NOT_FOUND");
    db.prepare("DELETE FROM legal_chunks_fts WHERE source_id = ?").run(source.id);
    db.prepare("DELETE FROM legal_embeddings WHERE source_id = ?").run(source.id);
    db.prepare("DELETE FROM legal_source_revisions WHERE source_id = ?").run(source.id);
    db.prepare("DELETE FROM legal_sources WHERE id = ?").run(source.id);
    audit(auth, "法源删除", source.title, request);
    return sendJson(response, 200, { ok: true });
  }

  // 法律检索:FTS5/BM25 召回法源片段(可选含失效)。
  if (request.method === "POST" && url.pathname === "/api/legal/search") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    const query = String(body.query || "").trim();
    if (!query) return sendError(response, 400, "请输入检索问题", "QUERY_REQUIRED");
    const includeLapsed = Boolean(body.includeLapsed);
    const results = hybridSearchLegal(auth.user.workspaceId, query, body.limit, { includeLapsed });
    audit(auth, "法律检索", `${query.slice(0, 120)} · ${results.length} 条${includeLapsed ? " · 含失效" : ""}`, request);
    return sendJson(response, 200, { query, results, retrieval: `hybrid-fts5+vector(${embedderInfo().model})`, includeLapsed });
  }

  // 失效法源影响面:反查已生成文书(documentVersions)引用了哪些已失效法源。
  if (request.method === "GET" && url.pathname === "/api/legal/impact") {
    const state = workspaceState(auth.user.workspaceId);
    // documentVersions 为新→旧排列，仅取每个(案件+文书名)的最新版本，替换为新版后旧告警自动消除。
    const latest = new Map();
    for (const item of state.documentVersions || []) {
      if (!item || typeof item.content !== "string" || !item.content || !canAccessCase(auth, item.caseId)) continue;
      const key = `${item.caseId}|${item.name}`;
      if (!latest.has(key)) latest.set(key, item);
    }
    const versions = [...latest.values()];
    const impacts = [];
    for (const version of versions.slice(0, 200)) {
      const lapsed = new Map();
      for (const ref of findLegalReferences(version.content)) {
        const matched = searchLegalSources(auth.user.workspaceId, ref, 1, { includeLapsed: true })[0];
        if (matched && matched.score >= 2 && isLapsedStatus(matched.status) && !lapsed.has(matched.title)) {
          lapsed.set(matched.title, { source: matched.title, status: matched.status, ref });
        }
      }
      if (lapsed.size) impacts.push({ documentId: version.id, document: version.name, version: version.version, caseId: version.caseId, caseTitle: (state.cases || []).find(item => item.id === version.caseId)?.title || "", lapsed: [...lapsed.values()] });
    }
    return sendJson(response, 200, { impacts });
  }

  // 检索增强问答:默认抽取式带引用;启用 Claude 时改为仅依据片段的生成式回答(失败回退抽取式)。
  if (request.method === "POST" && url.pathname === "/api/legal/answer") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    const query = String(body.query || "").trim();
    if (!query) return sendError(response, 400, "请输入法律问题", "QUERY_REQUIRED");
    const results = hybridSearchLegal(auth.user.workspaceId, query, 5);
    let answer = extractiveAnswer(results);          // 默认:摘录式回答。
    let generatedBy = "extractive";
    if (llmEnabled && results.length) {
      try {
        answer = await claudeAnswer(query, results);
        generatedBy = `claude:${llmModel}`;
      } catch (error) {
        console.error("LLM answer failed, falling back to extractive:", error.message);
        generatedBy = "extractive-fallback";
      }
    }
    audit(auth, "RAG 问答", `${query.slice(0, 120)} · ${results.length} 个引用 · ${generatedBy}`, request);
    return sendJson(response, 200, {
      answer,
      generatedBy,
      citations: results.map(item => ({ chunkId: item.chunkId, title: item.title, authority: item.authority, status: item.status, sourceUrl: item.sourceUrl }))
    });
  }

  // 案情策略：类案检索 + 裁判倾向参考（FTS 召回 + 本地启发式聚合 + 可选 Claude 综述）。
  if (request.method === "POST" && url.pathname === "/api/strategy/tendency") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    const caseId = String(body.caseId || "");
    if (!canAccessCase(auth, caseId)) return sendError(response, 404, "案件不存在或无访问权限", "CASE_NOT_FOUND");
    const state = workspaceState(auth.user.workspaceId);
    const caseItem = (state.cases || []).find(item => item.id === caseId) || null;
    const query = String(body.query || [caseItem?.cause, caseItem?.title, caseItem?.claims, caseItem?.facts].filter(Boolean).join(" ")).trim();
    const precedents = hybridSearchPrecedents(auth.user.workspaceId, query, 8);
    const tendency = tendencyFromPrecedents(precedents);
    let summary = localTendencySummary(tendency, precedents);
    let summaryBy = "heuristic";
    if (llmEnabled && precedents.length) {
      try { summary = await claudePrecedentSummary(query, precedents); summaryBy = `claude:${llmModel}`; }
      catch (error) { console.error("LLM tendency summary failed, using heuristic:", error.message); summaryBy = "heuristic-fallback"; }
    }
    audit(auth, "类案倾向分析", `${caseItem?.title || caseId} · ${precedents.length} 件类案 · ${summaryBy}`, request);
    return sendJson(response, 200, { precedents, tendency, summary, summaryBy, query });
  }

  // 庭审语音转写：转写已上传音频文件，或结构化导入的庭审笔录文本。
  if (request.method === "POST" && url.pathname === "/api/hearing/transcribe") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "export_documents")) return;
    const body = await readJson(request);
    const caseId = String(body.caseId || "");
    if (!canAccessCase(auth, caseId)) return sendError(response, 404, "案件不存在或无访问权限", "CASE_NOT_FOUND");
    // 文本导入路径：零依赖结构化，本地演示与无引擎时同样可用。
    if (body.text != null) {
      const segments = parseTranscript(String(body.text));
      audit(auth, "庭审笔录导入", `${caseId} · ${segments.length} 段`, request);
      return sendJson(response, 200, { method: "import", status: "processed", segments, text: String(body.text) });
    }
    // 音频转写路径：调用本地引擎，无引擎时返回 manual 提示手工导入。
    const fileId = String(body.fileId || "");
    const row = db.prepare("SELECT * FROM case_files WHERE id = ? AND workspace_id = ?").get(fileId, auth.user.workspaceId);
    if (!row || !canAccessCase(auth, row.case_id)) return sendError(response, 404, "音频文件不存在或无访问权限", "FILE_NOT_FOUND");
    const filePath = path.join(uploadsDir, row.stored_name);
    if (!existsSync(filePath)) return sendError(response, 404, "音频内容已丢失", "FILE_CONTENT_MISSING");
    const result = transcribeAudioLocally(filePath);
    // 转写成功时回写到 case_files.extracted_text，使笔录纳入检索与事实抽取。
    if (result.status === "processed" || result.status === "partial") {
      db.prepare("UPDATE case_files SET extracted_text = ?, extraction_method = ?, status = ?, processed_at = ? WHERE id = ? AND workspace_id = ?")
        .run(result.text, `transcript:${result.method}`, result.status, isoNow(), row.id, auth.user.workspaceId);
    }
    audit(auth, "庭审语音转写", `${row.original_name} · ${result.method} · ${result.status}`, request);
    return sendJson(response, 200, { method: result.method, status: result.status, segments: result.segments, text: result.text, error: result.error });
  }

  // 庭审小结：本地启发式摘录，可选 Claude 生成（仅依据笔录、强制引用，失败回退）。
  if (request.method === "POST" && url.pathname === "/api/hearing/summary") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "export_documents")) return;
    const body = await readJson(request);
    const caseId = String(body.caseId || "");
    if (!canAccessCase(auth, caseId)) return sendError(response, 404, "案件不存在或无访问权限", "CASE_NOT_FOUND");
    const transcript = String(body.transcript || "").trim();
    if (!transcript) return sendError(response, 400, "请先提供庭审笔录", "TRANSCRIPT_REQUIRED");
    const state = workspaceState(auth.user.workspaceId);
    const caseItem = (state.cases || []).find(item => item.id === caseId) || null;
    let summary = localHearingSummary(transcript);
    let summaryBy = "heuristic";
    if (llmEnabled) {
      try { summary = await claudeHearingSummary(caseItem, transcript); summaryBy = `claude:${llmModel}`; }
      catch (error) { console.error("LLM hearing summary failed, using heuristic:", error.message); summaryBy = "heuristic-fallback"; }
    }
    audit(auth, "庭审小结", `${caseItem?.title || caseId} · ${summaryBy}`, request);
    return sendJson(response, 200, { summary, summaryBy });
  }

  // 文书 Agent：从案件材料抽取带来源的候选事实。
  if (request.method === "POST" && url.pathname === "/api/documents/facts") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "export_documents")) return;
    const body = await readJson(request);
    const caseId = String(body.caseId || "");
    if (!canAccessCase(auth, caseId)) return sendError(response, 404, "案件不存在或无访问权限", "CASE_NOT_FOUND");
    const state = workspaceState(auth.user.workspaceId);
    const caseItem = (state.cases || []).find(item => item.id === caseId) || null;
    const caseTexts = caseFileTexts(auth.user.workspaceId, caseId);
    let facts = extractFactCandidates(caseTexts, caseItem, 20);
    let extractedBy = "local";
    if (llmEnabled && caseTexts.length) {
      try { facts = await claudeExtractFacts(caseItem, caseTexts); extractedBy = `claude:${llmModel}`; }
      catch (error) { console.error("LLM fact extraction failed, using local:", error.message); extractedBy = "local-fallback"; }
    }
    facts = facts.map(item => ({ ...item, date: item.date || parseFactDate(item.fact) }));
    audit(auth, "事实抽取", `${caseItem?.title || caseId} · ${facts.length} 条 · ${extractedBy}`, request);
    return sendJson(response, 200, { facts, timeline: buildTimeline(facts), filesScanned: caseTexts.length, extractedBy });
  }

  // 文书 Agent：法条引用与关键事实校验。
  // 文书生成：按案件状态生成文书草稿文本（供 Web 应用与 Word/WPS 插件复用）。
  if (request.method === "POST" && url.pathname === "/api/documents/generate") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "export_documents")) return;
    const body = await readJson(request);
    const caseId = String(body.caseId || "");
    const template = String(body.template || "complaint");
    if (!Object.prototype.hasOwnProperty.call(templateLabels, template)) return sendError(response, 400, "未知文书类型", "TEMPLATE_UNKNOWN");
    if (!canAccessCase(auth, caseId)) return sendError(response, 404, "案件不存在或无访问权限", "CASE_NOT_FOUND");
    const state = workspaceState(auth.user.workspaceId);
    const caseItem = (state.cases || []).find(item => item.id === caseId) || null;
    if (!caseItem) return sendError(response, 404, "案件不存在", "CASE_NOT_FOUND");
    const evidence = (state.evidence || []).filter(item => item.caseId === caseId);
    const assetClues = (state.assetClues || []).filter(item => item.caseId === caseId);
    const content = renderDocumentTemplate(template, caseItem, evidence, assetClues);
    audit(auth, "文书生成", `${templateLabels[template]} · ${caseItem.title}`, request);
    return sendJson(response, 200, { template, label: templateLabels[template], content });
  }

  if (request.method === "POST" && url.pathname === "/api/documents/verify") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "export_documents")) return;
    const body = await readJson(request);
    const caseId = String(body.caseId || "");
    const content = String(body.content || "");
    if (!canAccessCase(auth, caseId)) return sendError(response, 404, "案件不存在或无访问权限", "CASE_NOT_FOUND");
    if (content.length < 10) return sendError(response, 400, "文书内容过短", "CONTENT_TOO_SHORT");
    const state = workspaceState(auth.user.workspaceId);
    const caseItem = (state.cases || []).find(item => item.id === caseId) || null;
    const evidence = (state.evidence || []).filter(item => item.caseId === caseId);
    const caseTexts = caseFileTexts(auth.user.workspaceId, caseId);
    const result = verifyDocumentContent(auth.user.workspaceId, content, caseItem, caseTexts, evidence);
    audit(auth, "文书引用校验", `${caseItem?.title || caseId} · 未核验法条 ${result.unverifiedLegal} · 缺依据事实 ${result.ungroundedFacts}`, request);
    return sendJson(response, 200, result);
  }

  // 节假日表(用于期限顺延):集中维护，全员共享。
  if (request.method === "GET" && url.pathname === "/api/holidays") {
    return sendJson(response, 200, { calendars: holidayCalendars(auth.user.workspaceId) });
  }

  // 更新某年度节假日/调休(管理员;upsert + 留痕,全员共享生效)。
  const holidayMatch = url.pathname.match(/^\/api\/holidays\/(\d{4})$/);
  if (request.method === "PUT" && holidayMatch) {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    const year = holidayMatch[1];
    const body = await readJson(request);
    const holidays = sanitizeDateList(body.holidays, year);
    const workdays = sanitizeDateList(body.workdays, year);
    db.prepare(`INSERT INTO holiday_calendars (workspace_id, year, verified, holidays_json, workdays_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, year) DO UPDATE SET verified = excluded.verified, holidays_json = excluded.holidays_json, workdays_json = excluded.workdays_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .run(auth.user.workspaceId, year, body.verified ? 1 : 0, JSON.stringify(holidays), JSON.stringify(workdays), isoNow(), auth.user.id);
    audit(auth, "节假日维护", `${year} · 放假 ${holidays.length} 天 · 调休 ${workdays.length} 天`, request);
    return sendJson(response, 200, { ok: true, year, holidays, workdays, verified: Boolean(body.verified) });
  }

  // 提醒偏好(每个成员可配置提前天数/静音类型/接收渠道)。
  if (request.method === "GET" && url.pathname === "/api/notifications/prefs") {
    return sendJson(response, 200, { prefs: userPrefs(auth.user.id), types: NOTIF_TYPES });
  }
  if (request.method === "PUT" && url.pathname === "/api/notifications/prefs") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    const leadDays = Math.max(1, Math.min(60, Number(body.leadDays) || 7));
    const mutedTypes = Array.isArray(body.mutedTypes) ? [...new Set(body.mutedTypes.map(String).filter(type => NOTIF_TYPES.includes(type)))] : [];
    const channels = Array.isArray(body.channels) ? [...new Set(body.channels.map(String).filter(channel => ["inapp", "webhook"].includes(channel)))] : ["inapp"];
    db.prepare(`INSERT INTO notification_prefs (user_id, lead_days, muted_types, channels, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET lead_days = excluded.lead_days, muted_types = excluded.muted_types, channels = excluded.channels, updated_at = excluded.updated_at`)
      .run(auth.user.id, leadDays, JSON.stringify(mutedTypes), JSON.stringify(channels), isoNow());
    return sendJson(response, 200, { ok: true, prefs: { leadDays, mutedTypes, channels } });
  }

  // 通知中心(到期/逾期/庭期冲突等后台提醒,无需登录即由定时任务生成,按成员偏好过滤)。
  if (request.method === "GET" && url.pathname === "/api/notifications") {
    const prefs = userPrefs(auth.user.id);
    const rows = db.prepare("SELECT id, type, level, title, detail, meta_json, created_at, read_at FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200").all(auth.user.workspaceId);
    const notifications = rows
      .filter(row => {
        if (prefs.mutedTypes.includes(row.type)) return false;
        if (row.type.endsWith("_due")) { const days = JSON.parse(row.meta_json || "{}").daysLeft; if (typeof days === "number" && days > prefs.leadDays) return false; }
        return true;
      })
      .slice(0, 100)
      .map(row => ({ id: row.id, type: row.type, level: row.level, title: row.title, detail: row.detail, meta: JSON.parse(row.meta_json || "{}"), createdAt: row.created_at, read: Boolean(row.read_at) }));
    return sendJson(response, 200, { notifications, unread: notifications.filter(item => !item.read).length });
  }

  // 摘要日报:把当前未读提醒(按成员偏好过滤)合并为一封成稿报告。
  if (request.method === "GET" && url.pathname === "/api/notifications/digest") {
    const prefs = userPrefs(auth.user.id);
    const rows = db.prepare("SELECT type, level, title, detail, meta_json FROM notifications WHERE workspace_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 200").all(auth.user.workspaceId);
    const items = rows.filter(row => {
      if (prefs.mutedTypes.includes(row.type)) return false;
      if (row.type.endsWith("_due")) { const days = JSON.parse(row.meta_json || "{}").daysLeft; if (typeof days === "number" && days > prefs.leadDays) return false; }
      return true;
    });
    return sendJson(response, 200, { digest: buildDigest(items, isoNow().slice(0, 10)) });
  }

  // 一键全部已读。
  if (request.method === "POST" && url.pathname === "/api/notifications/read-all") {
    if (!requireCsrf(request, response, auth)) return;
    db.prepare("UPDATE notifications SET read_at = ? WHERE workspace_id = ? AND read_at IS NULL").run(isoNow(), auth.user.workspaceId);
    return sendJson(response, 200, { ok: true });
  }

  // webhook 投递留痕(管理员查看失败/待发/已发记录)。
  if (request.method === "GET" && url.pathname === "/api/notifications/webhook-log") {
    if (!requirePermission(response, auth, "manage_settings")) return;
    const rows = db.prepare("SELECT id, status, attempts, last_error, created_at, updated_at FROM webhook_outbox WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50").all(auth.user.workspaceId);
    const pending = Number(db.prepare("SELECT COUNT(*) AS c FROM webhook_outbox WHERE workspace_id = ? AND status = 'pending'").get(auth.user.workspaceId).c);
    const failed = Number(db.prepare("SELECT COUNT(*) AS c FROM webhook_outbox WHERE workspace_id = ? AND status = 'failed'").get(auth.user.workspaceId).c);
    return sendJson(response, 200, { configured: Boolean(process.env.HENGFA_REMINDER_WEBHOOK), pending, failed, log: rows });
  }

  // 手动重试待发 webhook(管理员)。
  if (request.method === "POST" && url.pathname === "/api/notifications/webhook-retry") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    await flushWebhookOutbox();
    const pending = Number(db.prepare("SELECT COUNT(*) AS c FROM webhook_outbox WHERE workspace_id = ? AND status = 'pending'").get(auth.user.workspaceId).c);
    const failed = Number(db.prepare("SELECT COUNT(*) AS c FROM webhook_outbox WHERE workspace_id = ? AND status = 'failed'").get(auth.user.workspaceId).c);
    audit(auth, "webhook 重试", `待发 ${pending} · 失败 ${failed}`, request);
    return sendJson(response, 200, { ok: true, pending, failed });
  }

  // 单条标记已读。
  const notifReadMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (request.method === "POST" && notifReadMatch) {
    if (!requireCsrf(request, response, auth)) return;
    db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND workspace_id = ? AND read_at IS NULL").run(isoNow(), notifReadMatch[1], auth.user.workspaceId);
    return sendJson(response, 200, { ok: true });
  }

  // 启动引导:返回(按角色裁剪后的)业务状态、版本号、当前用户与权限。
  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const row = db.prepare("SELECT revision, data_json FROM workspace_states WHERE workspace_id = ?").get(auth.user.workspaceId);
    const state = filterStateForUser(JSON.parse(row?.data_json || "{}"), auth);
    return sendJson(response, 200, { state, revision: Number(row?.revision || 0), user: auth.user, permissions: permissionsFor(auth.user.role) });
  }

  // 保存业务状态:乐观锁(revision 不符返回 409)+ 按角色合并写入,版本号 +1。当事人只读。
  if (request.method === "PUT" && url.pathname === "/api/state") {
    if (!requireCsrf(request, response, auth)) return;
    if (auth.user.role === "client") return sendError(response, 403, "当事人账号仅可查看已授权案件", "READ_ONLY_ROLE");
    const body = await readJson(request);
    const row = db.prepare("SELECT revision, data_json FROM workspace_states WHERE workspace_id = ?").get(auth.user.workspaceId);
    const currentRevision = Number(row.revision);
    if (Number(body.revision) !== currentRevision) return sendJson(response, 409, { error: "数据已被其他成员更新", code: "REVISION_CONFLICT", revision: currentRevision }); // 版本冲突。
    const merged = mergeByRole(JSON.parse(row.data_json || "{}"), body.state, auth);
    if (!merged) return sendError(response, 403, "当前角色不可修改工作区数据", "READ_ONLY_ROLE");
    const nextRevision = currentRevision + 1;
    db.prepare("UPDATE workspace_states SET revision = ?, data_json = ?, updated_at = ? WHERE workspace_id = ?")
      .run(nextRevision, JSON.stringify(merged), isoNow(), auth.user.workspaceId);
    return sendJson(response, 200, { ok: true, revision: nextRevision });
  }

  // 前端补记一条审计(如本地导出等动作)。
  if (request.method === "POST" && url.pathname === "/api/audit") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    audit(auth, body.action || "系统操作", body.detail || "", request);
    return sendJson(response, 201, { ok: true });
  }

  // 成员列表(管理员;附每人授权案件 id)。
  if (request.method === "GET" && url.pathname === "/api/users") {
    if (!requirePermission(response, auth, "manage_users")) return;
    const users = db.prepare("SELECT id, workspace_id, name, email, role, status, created_at, last_login FROM users WHERE workspace_id = ? ORDER BY created_at")
      .all(auth.user.workspaceId).map(row => ({
        ...publicUser(row),
        createdAt: row.created_at,
        lastLogin: row.last_login,
        caseIds: db.prepare("SELECT case_id FROM case_access WHERE user_id = ?").all(row.id).map(item => item.case_id)
      }));
    return sendJson(response, 200, { users });
  }

  // 新建成员(管理员):校验邮箱/角色/密码强度、查重,建账号并写入案件授权。
  if (request.method === "POST" && url.pathname === "/api/users") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_users")) return;
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "assistant");
    if (!email.includes("@") || password.length < 10 || !rolePermissions[role]) return sendError(response, 400, "请提供有效邮箱、角色和至少 10 位密码", "USER_INVALID");
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return sendError(response, 409, "该邮箱已经存在", "EMAIL_EXISTS");
    const credentials = hashPassword(password);
    const userId = id("user");
    db.prepare(`INSERT INTO users (id, workspace_id, name, email, password_hash, password_salt, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
      .run(userId, auth.user.workspaceId, String(body.name || email).slice(0, 80), email, credentials.hash, credentials.salt, role, isoNow());
    for (const caseId of Array.isArray(body.caseIds) ? body.caseIds.slice(0, 1000) : []) {
      db.prepare("INSERT OR IGNORE INTO case_access (user_id, case_id) VALUES (?, ?)").run(userId, String(caseId));
    }
    audit(auth, "用户创建", `${email} · ${role}`, request);
    return sendJson(response, 201, { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId)) });
  }

  // 更新成员(管理员):改姓名/角色/状态/案件授权;禁止停用自己;停用即注销其会话。
  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === "PATCH" && userMatch) {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_users")) return;
    const body = await readJson(request);
    const target = db.prepare("SELECT * FROM users WHERE id = ? AND workspace_id = ?").get(userMatch[1], auth.user.workspaceId);
    if (!target) return sendError(response, 404, "用户不存在", "USER_NOT_FOUND");
    const role = rolePermissions[body.role] ? body.role : target.role;
    const status = ["active", "disabled"].includes(body.status) ? body.status : target.status;
    if (target.id === auth.user.id && status === "disabled") return sendError(response, 400, "不能停用当前登录账号", "SELF_DISABLE");
    db.prepare("UPDATE users SET name = ?, role = ?, status = ? WHERE id = ?")
      .run(String(body.name || target.name).slice(0, 80), role, status, target.id);
    if (Array.isArray(body.caseIds)) {
      db.prepare("DELETE FROM case_access WHERE user_id = ?").run(target.id);
      for (const caseId of body.caseIds.slice(0, 1000)) db.prepare("INSERT INTO case_access (user_id, case_id) VALUES (?, ?)").run(target.id, String(caseId));
    }
    if (status === "disabled") db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    audit(auth, "用户权限更新", `${target.email} · ${role} · ${status}`, request);
    return sendJson(response, 200, { ok: true });
  }

  return sendError(response, 404, "API 不存在", "API_NOT_FOUND"); // 所有端点都没匹配到。
}

// Word/WPS 办公插件任务窗格的 CSP：仅放行 Office.js 官方 CDN，连接仍限本域。
const pluginCsp = "default-src 'self'; script-src 'self' https://appsforoffice.microsoft.com https://res.cdn.office.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self' https://*.officeapps.live.com https://*.office.com https://*.wps.cn https://*.officeonline.wps.cn";
const pluginFiles = new Set(["plugin/taskpane.html", "plugin/taskpane.js", "plugin/taskpane.css", "plugin/commands.html", "plugin/manifest.xml", "plugin/icon.png"]);

// 托管静态文件:仅白名单(前端三件套 + plugin/ 下固定文件),并校验解析后路径仍在根目录内防穿越。
function serveStatic(request, response, url) {
  try {
    const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, ""); // "/" 映射到首页。
    const isPlugin = pluginFiles.has(relativePath);
    if (!new Set(["index.html", "styles.css", "app.js"]).has(relativePath) && !isPlugin) throw new Error("Not public"); // 非白名单一律 404。
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid path"); // 解析后必须仍在根目录内。
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const body = readFileSync(filePath);
    const headers = securityHeaders({
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=300"
    });
    // 插件窗格需被 Office/WPS 宿主框架内嵌：放宽 CSP 并移除 X-Frame-Options。
    if (isPlugin) {
      headers["Content-Security-Policy"] = pluginCsp;
      delete headers["X-Frame-Options"];
    }
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    response.end("Not found");
  }
}

// HTTP 服务器:/api/* 交给 handleApi,其余 GET/HEAD 走静态托管;统一兜底异常(已发头则仅结束)。
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || host}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else if (["GET", "HEAD"].includes(request.method)) serveStatic(request, response, url);
    else sendError(response, 405, "请求方法不支持", "METHOD_NOT_ALLOWED");
  } catch (error) {
    console.error(error);
    // 带 status 的错误(如 413/400)透出其消息,其余统一报 500 不泄露细节。
    if (!response.headersSent) sendError(response, error.status || 500, error.status ? error.message : "服务器内部错误", "SERVER_ERROR");
    else response.end();
  }
});

// 测试用 HENGFA_NO_LISTEN=1 仅加载模块不监听端口;正常运行则监听并启动后台提醒任务。
if (process.env.HENGFA_NO_LISTEN !== "1") {
  server.listen(port, host, () => {
    console.log(`Hengfa workbench: http://${host}:${server.address().port}`);
  });
  // 后台到期提醒:启动后运行一次,并按间隔(默认 12 小时)定期扫描。
  const reminderHours = Math.max(1, Number(process.env.HENGFA_REMINDER_INTERVAL_HOURS) || 12);
  try {
    const first = runReminderScan();
    if (first.length) console.log(`Reminders generated: ${first.length}`);
  } catch (error) { console.error("Reminder scan failed:", error.message); }
  setInterval(() => {
    try { runReminderScan(); } catch (error) { console.error("Reminder scan failed:", error.message); }
  }, reminderHours * 3600000).unref();
}

// 优雅退出:停止接收连接 → 关闭数据库 → 退出进程。
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);   // Ctrl+C。
process.on("SIGTERM", shutdown);  // 进程管理器终止。

// 导出供测试与桌面端复用(handleApi/serveStatic 直接驱动,纯函数便于单测)。
export { db, handleApi, serveStatic, server, runReminderScan, buildReminderDeliveries, purgeOldNotifications, flushWebhookOutbox, searchPrecedents, tendencyFromPrecedents, localHearingSummary };
