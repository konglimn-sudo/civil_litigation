import http from "node:http";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.mjs";
import { legalCorpus } from "./legal-corpus.mjs";
import { defaultHolidayCalendars } from "./holidays.mjs";
import { extractTextLocally, localExtractionCapabilities } from "./ocr.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const dataDir = process.env.HENGFA_DATA_DIR ? path.resolve(process.env.HENGFA_DATA_DIR) : path.join(root, "data");
const uploadsDir = path.join(dataDir, "uploads");
const sessionCookie = "hengfa_session";
const sessionHours = 8;
const bodyLimit = 3 * 1024 * 1024;
const fileLimit = 25 * 1024 * 1024;

// 可选 LLM provider：默认关闭（本地优先）。设 HENGFA_LLM=claude 且配置 ANTHROPIC_API_KEY 后，
// /api/legal/answer 改为基于检索片段的生成式回答并强制附引用；任何异常都回退到抽取式。
const llmProvider = (process.env.HENGFA_LLM || "none").toLowerCase();
const llmModel = process.env.HENGFA_LLM_MODEL || "claude-opus-4-8";
const llmApiKey = process.env.ANTHROPIC_API_KEY || "";
const llmEnabled = llmProvider === "claude" && Boolean(llmApiKey);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf"
};

const rolePermissions = {
  admin: ["manage_users", "manage_settings", "create_case", "edit_case", "manage_evidence", "manage_tasks", "export_documents", "view_audit"],
  lawyer: ["create_case", "edit_case", "manage_evidence", "manage_tasks", "export_documents", "view_audit"],
  assistant: ["manage_evidence", "manage_tasks", "export_documents"],
  client: []
};

mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadsDir, { recursive: true });
const db = await openDatabase(path.join(dataDir, "hengfa.db"), "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','lawyer','assistant','client')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
    created_at TEXT NOT NULL,
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspace_states (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    revision INTEGER NOT NULL DEFAULT 0,
    data_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS case_access (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL,
    PRIMARY KEY(user_id, case_id)
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    ip TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS case_files (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    case_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('processed','partial','error')),
    extraction_method TEXT,
    extracted_text TEXT,
    error_message TEXT,
    uploaded_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    processed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS legal_sources (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    title TEXT NOT NULL,
    authority TEXT NOT NULL,
    level TEXT NOT NULL,
    effective_status TEXT NOT NULL,
    effective_date TEXT,
    valid_until TEXT,
    source_url TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS legal_chunks_fts USING fts5(
    chunk_id UNINDEXED,
    source_id UNINDEXED,
    search_text,
    content UNINDEXED
  );
  CREATE TABLE IF NOT EXISTS legal_source_revisions (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT REFERENCES users(id),
    changed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS holiday_calendars (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    year TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    holidays_json TEXT NOT NULL DEFAULT '[]',
    workdays_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id),
    PRIMARY KEY(workspace_id, year)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_audit_workspace_time ON audit_logs(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_case_files_case ON case_files(workspace_id, case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_legal_sources_workspace ON legal_sources(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_legal_revisions_source ON legal_source_revisions(source_id, changed_at DESC);
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    type TEXT NOT NULL,
    level TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    read_at TEXT,
    UNIQUE(workspace_id, dedupe_key)
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lead_days INTEGER NOT NULL DEFAULT 7,
    muted_types TEXT NOT NULL DEFAULT '[]',
    channels TEXT NOT NULL DEFAULT '["inapp"]',
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS webhook_outbox (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_status ON webhook_outbox(status, created_at);
`);

// 迁移:为已存在的库补充新增列。
if (!db.prepare("PRAGMA table_info(legal_sources)").all().some(col => col.name === "valid_until")) {
  db.exec("ALTER TABLE legal_sources ADD COLUMN valid_until TEXT");
}
if (!db.prepare("PRAGMA table_info(notifications)").all().some(col => col.name === "meta_json")) {
  db.exec("ALTER TABLE notifications ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}'");
}

function id(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function isoNow() {
  return new Date().toISOString();
}

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(password, salt, expectedHex) {
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function seedDatabase() {
  const workspaceId = "workspace_hengfa";
  const now = isoNow();
  db.prepare("INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(workspaceId, "衡法律师工作区", now);
  db.prepare("INSERT OR IGNORE INTO workspace_states (workspace_id, revision, data_json, updated_at) VALUES (?, 0, '{}', ?)").run(workspaceId, now);

  const userCount = Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count);
  if (!userCount) {
    const email = process.env.HENGFA_ADMIN_EMAIL || "admin@hengfa.local";
    const password = process.env.HENGFA_ADMIN_PASSWORD || "Hengfa-Admin-2026";
    const credentials = hashPassword(password);
    db.prepare(`INSERT INTO users
      (id, workspace_id, name, email, password_hash, password_salt, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'admin', 'active', ?)`)
      .run(id("user"), workspaceId, "系统管理员", email.toLowerCase(), credentials.hash, credentials.salt, now);
    console.log(`Initial admin: ${email}`);
    if (!process.env.HENGFA_ADMIN_PASSWORD) console.log("Initial password: Hengfa-Admin-2026 (change it after login)");
  }
  seedLegalCorpus(workspaceId, now);
  seedHolidays(workspaceId, now);
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
function buildReminderDeliveries(workspaceId, reminders, dateStr = isoNow().slice(0, 10)) {
  const members = db.prepare("SELECT id, name, email FROM users WHERE workspace_id = ? AND status = 'active'").all(workspaceId);
  const deliveries = [];
  for (const member of members) {
    const prefs = userPrefs(member.id);
    if (!prefs.channels.includes("webhook")) continue;
    const personal = reminders.filter(reminder => reminderMatchesPrefs(reminder, prefs));
    if (!personal.length) continue;
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

seedDatabase();
db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(isoNow());

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...extra
  };
}

function sendJson(response, status, data, extraHeaders = {}) {
  response.writeHead(status, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  }));
  response.end(JSON.stringify(data));
}

function sendError(response, status, message, code = "REQUEST_ERROR") {
  sendJson(response, status, { error: message, code });
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").map(item => item.trim()).filter(Boolean).map(item => {
    const index = item.indexOf("=");
    return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
  }));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) throw Object.assign(new Error("请求数据过大"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw Object.assign(new Error("JSON 格式无效"), { status: 400 });
  }
}

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

function sendBinary(response, status, body, headers = {}) {
  response.writeHead(status, securityHeaders({ "Cache-Control": "no-store", ...headers }));
  response.end(body);
}

function publicUser(row) {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, email: row.email, role: row.role, status: row.status };
}

function permissionsFor(role) {
  return rolePermissions[role] || [];
}

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

function requireAuth(request, response) {
  const auth = authenticate(request);
  if (!auth) sendError(response, 401, "请先登录", "AUTH_REQUIRED");
  return auth;
}

function requireCsrf(request, response, auth) {
  const token = request.headers["x-csrf-token"];
  if (!token || token !== auth.csrfToken) {
    sendError(response, 403, "安全令牌无效，请刷新后重试", "CSRF_INVALID");
    return false;
  }
  return true;
}

function hasPermission(auth, permission) {
  return permissionsFor(auth.user.role).includes(permission);
}

function requirePermission(response, auth, permission) {
  if (hasPermission(auth, permission)) return true;
  sendError(response, 403, "当前角色无权执行此操作", "PERMISSION_DENIED");
  return false;
}

function audit(auth, action, detail, request) {
  db.prepare(`INSERT INTO audit_logs (id, workspace_id, user_id, action, detail, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id("audit"), auth.user.workspaceId, auth.user.id, String(action).slice(0, 80), String(detail).slice(0, 500), request.socket.remoteAddress || "", isoNow());
}

function auditRows(workspaceId, limit = 100) {
  return db.prepare(`SELECT audit_logs.id, audit_logs.action, audit_logs.detail, audit_logs.created_at,
      audit_logs.user_id, users.name AS member
    FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
    WHERE audit_logs.workspace_id = ? ORDER BY audit_logs.created_at DESC LIMIT ?`).all(workspaceId, limit)
    .map(row => ({ id: row.id, action: row.action, detail: row.detail, caseId: "", member: row.member || "系统", createdAt: row.created_at }));
}

function accessibleCaseIds(auth) {
  if (auth.user.role !== "client") return null;
  return new Set(db.prepare("SELECT case_id FROM case_access WHERE user_id = ?").all(auth.user.id).map(row => row.case_id));
}

function workspaceState(workspaceId) {
  const row = db.prepare("SELECT data_json FROM workspace_states WHERE workspace_id = ?").get(workspaceId);
  return JSON.parse(row?.data_json || "{}");
}

function canAccessCase(auth, caseId) {
  if (auth.user.role === "client") return Boolean(db.prepare("SELECT 1 FROM case_access WHERE user_id = ? AND case_id = ?").get(auth.user.id, caseId));
  return (workspaceState(auth.user.workspaceId).cases || []).some(item => item.id === caseId);
}

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

const allowedFileExtensions = new Set([".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"]);

let pythonExtractorReady = null;

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

function extractWithPython(filePath) {
  const python = process.env.HENGFA_PYTHON_BIN || "python3";
  const result = spawnSync(python, [path.join(root, "scripts", "extract_text.py"), filePath], {
    encoding: "utf8",
    timeout: 180000,
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

function extractCaseFile(filePath, mime = "") {
  let result = pythonExtractorAvailable() ? extractWithPython(filePath) : extractTextLocally(filePath, mime);
  if (result.status === "error" && pythonExtractorAvailable()) {
    const fallback = extractTextLocally(filePath, mime);
    if (fallback.status !== "error") result = { ...fallback, method: `${fallback.method}-fallback` };
  }
  return { ...result, text: String(result.text || "").slice(0, 5_000_000) };
}

function legalSearchTokens(text) {
  const normalized = String(text || "").normalize("NFKC").toLowerCase();
  const tokens = new Set(normalized.match(/[a-z0-9]{2,}/g) || []);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let index = 0; index < chinese.length - 1; index += 1) tokens.add(`${chinese[index]}${chinese[index + 1]}`);
  if (chinese.length === 1) tokens.add(chinese[0]);
  return [...tokens].slice(0, 60);
}

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

function indexLegalSource(sourceId, text) {
  const chunks = chunkLegalText(text);
  const insert = db.prepare("INSERT INTO legal_chunks_fts (chunk_id, source_id, search_text, content) VALUES (?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM legal_chunks_fts WHERE source_id = ?").run(sourceId);
    chunks.forEach((content, index) => insert.run(`${sourceId}:${index + 1}`, sourceId, legalSearchTokens(content).join(" "), content));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return chunks.length;
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

function searchLegalSources(workspaceId, query, limit = 8, { includeLapsed = false } = {}) {
  const tokens = legalSearchTokens(query);
  if (!tokens.length) return [];
  const match = tokens.map(token => `"${token.replaceAll('"', '""')}"`).join(" OR ");
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

// 抽取式回答：按相关度摘录检索片段，不做生成，避免编造。
function extractiveAnswer(results) {
  if (!results.length) return "当前正式法源库中未检索到可靠依据。请补充关键词或由管理员导入经核验的法源后重试。";
  return `检索到 ${results.length} 个相关法源片段。以下内容仅按相关度摘录，应结合完整条文、效力状态和案件事实核验：\n\n${results.slice(0, 3).map((item, index) => `${index + 1}. ${item.content.slice(0, 320)}`).join("\n\n")}`;
}

// 可选 Claude 生成式回答：仅以检索片段为依据，强制附「（依据：片段N）」，异常由调用方回退。
async function claudeAnswer(query, results) {
  const context = results.map((item, index) => `【片段${index + 1}｜${item.title}｜${item.authority}｜${item.status}】\n${item.content}`).join("\n\n");
  const system = "你是中国民事诉讼法律检索助理。只能依据下面提供的【检索片段】作答，不得引用片段之外的法条、案例或数字，不得编造。每个结论后用「（依据：片段N）」标注来源；片段不足以回答时应明确说明并建议核验正式法源。用简洁、可操作的中文回答，并在结尾提示最终须由办案人员核验现行条文与效力状态。";
  const userMessage = `问题：${query}\n\n可用检索片段：\n${context}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": llmApiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: llmModel, max_tokens: 1024, system, messages: [{ role: "user", content: userMessage }] }),
    signal: AbortSignal.timeout(40000)
  });
  if (!response.ok) throw new Error(`Claude API ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
  const data = await response.json();
  const text = (data.content || []).filter(part => part.type === "text").map(part => part.text).join("").trim();
  if (!text) throw new Error("Claude 返回空内容");
  return text;
}

// —— 文书 Agent：事实抽取与引用校验（纯函数，便于单测）——

const FACT_KEYWORDS = ["合同", "协议", "签订", "交付", "验收", "付款", "货款", "欠款", "尾款", "违约", "借款", "还款", "履行", "送达", "质量", "逾期", "利息", "赔偿", "定金", "转账", "收据", "发票", "对账", "解除", "担保", "抵押", "保证"];
const DATE_RE = /\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}-\d{1,2}-\d{1,2}/;
const AMOUNT_RE = /(?:人民币|¥)?\s*\d[\d,，]*(?:\.\d+)?\s*(?:元|万元)/;

function splitSentences(text) {
  return String(text || "").replace(/\r/g, "").split(/(?<=[。！？；\n])/).map(s => s.trim()).filter(s => s.length >= 8 && s.length <= 220);
}

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
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": llmApiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: llmModel, max_tokens: 1500, system, messages: [{ role: "user", content: userMessage }] }),
    signal: AbortSignal.timeout(40000)
  });
  if (!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = await response.json();
  const text = (data.content || []).filter(part => part.type === "text").map(part => part.text).join("");
  const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
  return parsed.filter(item => item && item.fact).slice(0, 20).map(item => ({
    fact: String(item.fact).slice(0, 220),
    source: String(item.source || "案件材料"),
    types: Array.isArray(item.types) ? item.types.map(String) : []
  }));
}

const caseScopedArrays = ["evidence", "tasks", "timeLogs", "assetClues", "documentVersions", "caseEvents"];

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

function sanitizeState(value) {
  const source = value && typeof value === "object" ? value : {};
  const clean = {};
  const arrays = ["cases", ...caseScopedArrays, "qaMessages"];
  for (const key of arrays) clean[key] = Array.isArray(source[key]) ? source[key].slice(0, 10000) : [];
  clean.activeCaseId = String(source.activeCaseId || "");
  clean.settings = source.settings && typeof source.settings === "object" ? source.settings : {};
  clean.metrics = source.metrics && typeof source.metrics === "object" ? source.metrics : {};
  return clean;
}

function mergeByRole(currentState, incomingState, auth) {
  const current = sanitizeState(currentState);
  const incoming = sanitizeState(incomingState);
  if (auth.user.role === "admin") return incoming;
  if (auth.user.role === "lawyer") return { ...incoming, settings: current.settings };
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

const loginAttempts = new Map();

function loginAllowed(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  return entry.count < 5;
}

function recordLoginFailure(key) {
  const entry = loginAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  entry.count += 1;
  loginAttempts.set(key, entry);
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const attemptKey = `${request.socket.remoteAddress || "local"}:${email}`;
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

  const auth = requireAuth(request, response);
  if (!auth) return;

  if (request.method === "GET" && url.pathname === "/api/session") {
    return sendJson(response, 200, { user: auth.user, csrfToken: auth.csrfToken, permissions: permissionsFor(auth.user.role) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    if (!requireCsrf(request, response, auth)) return;
    audit(auth, "用户退出", `${auth.user.email} 退出系统`, request);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(auth.sessionId);
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }

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

  if (request.method === "GET" && url.pathname === "/api/files") {
    const requestedCaseId = String(url.searchParams.get("caseId") || "");
    const rows = requestedCaseId
      ? db.prepare("SELECT * FROM case_files WHERE workspace_id = ? AND case_id = ? ORDER BY created_at DESC").all(auth.user.workspaceId, requestedCaseId)
      : db.prepare("SELECT * FROM case_files WHERE workspace_id = ? ORDER BY created_at DESC").all(auth.user.workspaceId);
    const files = rows.filter(row => canAccessCase(auth, row.case_id)).map(row => publicCaseFile(row));
    return sendJson(response, 200, { files });
  }

  if (request.method === "POST" && url.pathname === "/api/files") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_evidence")) return;
    const caseId = String(url.searchParams.get("caseId") || "");
    const originalName = path.basename(String(url.searchParams.get("name") || "未命名文件")).slice(0, 200);
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

  if (request.method === "DELETE" && legalSourceMatch) {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    const source = db.prepare("SELECT * FROM legal_sources WHERE id = ? AND workspace_id = ?").get(legalSourceMatch[1], auth.user.workspaceId);
    if (!source) return sendError(response, 404, "法源不存在", "LEGAL_SOURCE_NOT_FOUND");
    db.prepare("DELETE FROM legal_chunks_fts WHERE source_id = ?").run(source.id);
    db.prepare("DELETE FROM legal_source_revisions WHERE source_id = ?").run(source.id);
    db.prepare("DELETE FROM legal_sources WHERE id = ?").run(source.id);
    audit(auth, "法源删除", source.title, request);
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/legal/search") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    const query = String(body.query || "").trim();
    if (!query) return sendError(response, 400, "请输入检索问题", "QUERY_REQUIRED");
    const includeLapsed = Boolean(body.includeLapsed);
    const results = searchLegalSources(auth.user.workspaceId, query, body.limit, { includeLapsed });
    audit(auth, "法律检索", `${query.slice(0, 120)} · ${results.length} 条${includeLapsed ? " · 含失效" : ""}`, request);
    return sendJson(response, 200, { query, results, retrieval: "sqlite-fts5-bigram", includeLapsed });
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

  if (request.method === "POST" && url.pathname === "/api/legal/answer") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    const query = String(body.query || "").trim();
    if (!query) return sendError(response, 400, "请输入法律问题", "QUERY_REQUIRED");
    const results = searchLegalSources(auth.user.workspaceId, query, 5);
    let answer = extractiveAnswer(results);
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

  if (request.method === "POST" && url.pathname === "/api/notifications/webhook-retry") {
    if (!requireCsrf(request, response, auth) || !requirePermission(response, auth, "manage_settings")) return;
    await flushWebhookOutbox();
    const pending = Number(db.prepare("SELECT COUNT(*) AS c FROM webhook_outbox WHERE workspace_id = ? AND status = 'pending'").get(auth.user.workspaceId).c);
    const failed = Number(db.prepare("SELECT COUNT(*) AS c FROM webhook_outbox WHERE workspace_id = ? AND status = 'failed'").get(auth.user.workspaceId).c);
    audit(auth, "webhook 重试", `待发 ${pending} · 失败 ${failed}`, request);
    return sendJson(response, 200, { ok: true, pending, failed });
  }

  const notifReadMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (request.method === "POST" && notifReadMatch) {
    if (!requireCsrf(request, response, auth)) return;
    db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND workspace_id = ? AND read_at IS NULL").run(isoNow(), notifReadMatch[1], auth.user.workspaceId);
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const row = db.prepare("SELECT revision, data_json FROM workspace_states WHERE workspace_id = ?").get(auth.user.workspaceId);
    const state = filterStateForUser(JSON.parse(row?.data_json || "{}"), auth);
    return sendJson(response, 200, { state, revision: Number(row?.revision || 0), user: auth.user, permissions: permissionsFor(auth.user.role) });
  }

  if (request.method === "PUT" && url.pathname === "/api/state") {
    if (!requireCsrf(request, response, auth)) return;
    if (auth.user.role === "client") return sendError(response, 403, "当事人账号仅可查看已授权案件", "READ_ONLY_ROLE");
    const body = await readJson(request);
    const row = db.prepare("SELECT revision, data_json FROM workspace_states WHERE workspace_id = ?").get(auth.user.workspaceId);
    const currentRevision = Number(row.revision);
    if (Number(body.revision) !== currentRevision) return sendJson(response, 409, { error: "数据已被其他成员更新", code: "REVISION_CONFLICT", revision: currentRevision });
    const merged = mergeByRole(JSON.parse(row.data_json || "{}"), body.state, auth);
    if (!merged) return sendError(response, 403, "当前角色不可修改工作区数据", "READ_ONLY_ROLE");
    const nextRevision = currentRevision + 1;
    db.prepare("UPDATE workspace_states SET revision = ?, data_json = ?, updated_at = ? WHERE workspace_id = ?")
      .run(nextRevision, JSON.stringify(merged), isoNow(), auth.user.workspaceId);
    return sendJson(response, 200, { ok: true, revision: nextRevision });
  }

  if (request.method === "POST" && url.pathname === "/api/audit") {
    if (!requireCsrf(request, response, auth)) return;
    const body = await readJson(request);
    audit(auth, body.action || "系统操作", body.detail || "", request);
    return sendJson(response, 201, { ok: true });
  }

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

  return sendError(response, 404, "API 不存在", "API_NOT_FOUND");
}

function serveStatic(request, response, url) {
  try {
    const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!new Set(["index.html", "styles.css", "app.js"]).has(relativePath)) throw new Error("Not public");
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid path");
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const body = readFileSync(filePath);
    response.writeHead(200, securityHeaders({
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=300"
    }));
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || host}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else if (["GET", "HEAD"].includes(request.method)) serveStatic(request, response, url);
    else sendError(response, 405, "请求方法不支持", "METHOD_NOT_ALLOWED");
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendError(response, error.status || 500, error.status ? error.message : "服务器内部错误", "SERVER_ERROR");
    else response.end();
  }
});

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

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { db, handleApi, serveStatic, server, runReminderScan, buildReminderDeliveries, purgeOldNotifications, flushWebhookOutbox };
