import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-reminders-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Reminder-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?reminders=${Date.now()}`);

function mockResponse() {
  return {
    status: 0, headers: {}, headersSent: false, body: "",
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    end(data = "") { this.body += data; }
  };
}
async function request(pathname, { method = "GET", cookie = "", csrf = "", body } = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), "content-type": "application/json" },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() { if (payload) yield payload; }
  };
  const response = mockResponse();
  await backend.handleApi(req, response, new URL(`http://127.0.0.1${pathname}`));
  return { response, data: response.body ? JSON.parse(response.body) : {} };
}
const cookieOf = response => String(response.headers["Set-Cookie"] || "").split(";", 1)[0];
function isoInDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test.after(() => { backend.db.close(); rmSync(dataDir, { recursive: true, force: true }); });

test("scheduled expiry reminders create deduped notifications", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Reminder-Test-2026" } });
  const cookie = cookieOf(login.response);
  const csrf = login.data.csrfToken;

  // 一条 5 天后到期(应触发 7d 里程碑),一条 200 天后到期(不触发)
  await request("/api/legal/sources", { method: "POST", cookie, csrf, body: { title: "临到期·测试规定A", authority: "最高法", level: "司法解释", status: "现行有效", validUntil: isoInDays(5), text: "本规定即将到期，用于到期定时提醒回归测试，须人工核验。" } });
  await request("/api/legal/sources", { method: "POST", cookie, csrf, body: { title: "远期·测试规定B", authority: "最高法", level: "司法解释", status: "现行有效", validUntil: isoInDays(200), text: "本规定远未到期，用于到期定时提醒回归测试，须人工核验。" } });

  // 后台任务运行:仅 A 生成提醒
  const created = backend.runReminderScan();
  assert.equal(created.length, 1, "仅临近到期法源应生成提醒");
  assert.ok(created[0].title.includes("测试规定A"));

  // 通知中心可见且未读
  let list = await request("/api/notifications", { cookie });
  assert.equal(list.data.unread, 1);
  const expiryNotif = list.data.notifications.find(item => item.type === "legal_expiry");
  assert.ok(expiryNotif && expiryNotif.title.includes("测试规定A"));
  assert.ok(expiryNotif.meta && expiryNotif.meta.sourceId, "到期通知应携带 sourceId 以便直达法源");

  // 再次运行:同里程碑去重,不重复生成
  assert.equal(backend.runReminderScan().length, 0, "同里程碑应去重");
  list = await request("/api/notifications", { cookie });
  assert.equal(list.data.unread, 1, "去重后未读数不变");

  // 标记全部已读
  const readAll = await request("/api/notifications/read-all", { method: "POST", cookie, csrf, body: {} });
  assert.equal(readAll.response.status, 200);
  list = await request("/api/notifications", { cookie });
  assert.equal(list.data.unread, 0);
});

test("reminders cover overdue/due/conflict events and respect member preferences", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Reminder-Test-2026" } });
  const cookie = cookieOf(login.response);
  const csrf = login.data.csrfToken;

  const state = {
    activeCaseId: "ca",
    cases: [{ id: "ca", title: "甲案", client: "甲" }, { id: "cb", title: "乙案", client: "乙" }],
    evidence: [],
    tasks: [
      { id: "t-overdue", caseId: "ca", title: "核实送货单签收人", owner: "王律师", dueDate: isoInDays(-4), priority: "高", done: false },
      { id: "t-due", caseId: "cb", title: "整理财产线索", owner: "陈助理", dueDate: isoInDays(5), priority: "中", done: false },
      { id: "t-done", caseId: "ca", title: "已完成任务", owner: "谢律师", dueDate: isoInDays(-1), priority: "中", done: true }
    ],
    timeLogs: [], assetClues: [], documentVersions: [],
    caseEvents: [
      { id: "e-overdue", caseId: "ca", date: isoInDays(-3), title: "举证期限届满", type: "法定/指定期限", status: "待办理" },
      { id: "e-due", caseId: "ca", date: isoInDays(5), title: "提交补充材料", type: "内部节点", status: "待办理" },
      { id: "e-h1", caseId: "ca", date: isoInDays(10), title: "第一次开庭", type: "庭审", status: "待办理" },
      { id: "e-h2", caseId: "cb", date: isoInDays(10), title: "开庭", type: "庭审", status: "待办理" }
    ],
    qaMessages: [], settings: {}, metrics: {}
  };
  const put = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: 0, state } });
  assert.equal(put.response.status, 200);

  const created = backend.runReminderScan();
  const types = new Set(created.map(item => item.type));
  assert.ok(types.has("deadline_overdue"), "应生成逾期节点提醒");
  assert.ok(types.has("deadline_due"), "应生成临近期限提醒");
  assert.ok(types.has("hearing_conflict"), "应生成庭期冲突提醒");
  assert.ok(types.has("task_overdue"), "应生成逾期任务提醒");
  assert.ok(types.has("task_due"), "应生成临近任务提醒");
  assert.ok(!created.some(item => item.detail.includes("已完成任务")), "已完成任务不应提醒");

  // 默认偏好:三类均可见
  let list = await request("/api/notifications", { cookie });
  const visibleTypes = new Set(list.data.notifications.map(item => item.type));
  assert.ok(visibleTypes.has("deadline_overdue") && visibleTypes.has("deadline_due") && visibleTypes.has("hearing_conflict"));

  // 通知携带定位信息以便点击直达
  const overdueNotif = list.data.notifications.find(item => item.type === "deadline_overdue");
  assert.equal(overdueNotif.meta.caseId, "ca", "逾期通知应携带 caseId");
  const conflictNotif = list.data.notifications.find(item => item.type === "hearing_conflict");
  assert.ok(Array.isArray(conflictNotif.meta.caseIds) && conflictNotif.meta.caseIds.length >= 2, "庭期冲突通知应携带 caseIds");

  // 静音庭期冲突 → 不再可见
  await request("/api/notifications/prefs", { method: "PUT", cookie, csrf, body: { leadDays: 7, mutedTypes: ["hearing_conflict"], channels: ["inapp", "webhook"] } });
  list = await request("/api/notifications", { cookie });
  assert.ok(!list.data.notifications.some(item => item.type === "hearing_conflict"), "静音类型应被过滤");

  // 提前天数收紧到 1 天 → 5 天后的临期提醒被隐藏,逾期仍在
  await request("/api/notifications/prefs", { method: "PUT", cookie, csrf, body: { leadDays: 1, mutedTypes: [], channels: ["inapp"] } });
  list = await request("/api/notifications", { cookie });
  assert.ok(!list.data.notifications.some(item => item.type === "deadline_due"), "超出个人提前天数的临期提醒应隐藏");
  assert.ok(list.data.notifications.some(item => item.type === "deadline_overdue"), "逾期提醒不受提前天数影响");

  // 偏好已持久化
  const prefs = await request("/api/notifications/prefs", { cookie });
  assert.equal(prefs.data.prefs.leadDays, 1);

  // 日报:把未读提醒合并为一封成稿报告(主题 + 分组),按偏好过滤
  const digest = await request("/api/notifications/digest", { cookie });
  assert.equal(digest.response.status, 200);
  assert.ok(digest.data.digest.subject.includes("提醒日报"));
  assert.ok(digest.data.digest.text.length > 0);
  const digestTypes = new Set(digest.data.digest.groups.map(group => group.type));
  assert.ok(digestTypes.has("deadline_overdue"), "日报应含逾期分组");
  assert.ok(!digestTypes.has("deadline_due"), "日报应遵循个人提前天数过滤掉临期项");
  assert.ok(digest.data.digest.subject.includes("逾期节点"));
});

test("webhook deliveries are personalized per recipient prefs", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Reminder-Test-2026" } });
  const cookie = cookieOf(login.response);
  const csrf = login.data.csrfToken;

  const reminders = [
    { type: "deadline_overdue", level: "high", title: "逾期A", detail: "甲案 · 举证逾期", meta: { caseId: "ca" } },
    { type: "deadline_due", level: "medium", title: "临期B", detail: "甲案 · 5 天后到期", meta: { caseId: "ca", daysLeft: 5 } },
    { type: "legal_expiry", level: "medium", title: "法源C", detail: "某法源临近到期", meta: { sourceId: "law-x" } }
  ];

  // 订阅外部渠道 + 静音 deadline_due → 个性化日报不含临期项
  await request("/api/notifications/prefs", { method: "PUT", cookie, csrf, body: { leadDays: 30, mutedTypes: ["deadline_due"], channels: ["inapp", "webhook"] } });
  let deliveries = backend.buildReminderDeliveries("workspace_hengfa", reminders);
  const admin = deliveries.find(item => item.email === "admin@hengfa.local");
  assert.ok(admin, "订阅 webhook 的成员应有个性化日报");
  const adminTypes = new Set(admin.digest.groups.map(group => group.type));
  assert.ok(adminTypes.has("deadline_overdue") && adminTypes.has("legal_expiry"));
  assert.ok(!adminTypes.has("deadline_due"), "静音类型不应出现在个性化日报");

  // 提前天数收紧到 1 天 → 5 天后的临期项被过滤
  await request("/api/notifications/prefs", { method: "PUT", cookie, csrf, body: { leadDays: 1, mutedTypes: [], channels: ["webhook"] } });
  deliveries = backend.buildReminderDeliveries("workspace_hengfa", reminders);
  const admin2 = deliveries.find(item => item.email === "admin@hengfa.local");
  assert.ok(!admin2.digest.groups.some(group => group.type === "deadline_due"), "超出个人提前天数的临期项应被过滤");

  // 未订阅外部渠道 → 不进入 deliveries
  await request("/api/notifications/prefs", { method: "PUT", cookie, csrf, body: { leadDays: 7, mutedTypes: [], channels: ["inapp"] } });
  deliveries = backend.buildReminderDeliveries("workspace_hengfa", reminders);
  assert.ok(!deliveries.some(item => item.email === "admin@hengfa.local"), "未选外部渠道的成员不应收到外部日报");
});

test("failed webhook delivery is recorded and retried", async () => {
  const ws = "workspace_hengfa";
  backend.db.prepare("INSERT INTO webhook_outbox (id, workspace_id, payload_json, status, attempts, created_at) VALUES ('hook-retry', ?, '{\"event\":\"test\"}', 'pending', 0, ?)").run(ws, new Date().toISOString());

  // 不可达地址 → 投递失败,留痕且保持 pending(未超最大次数)
  process.env.HENGFA_REMINDER_WEBHOOK = "http://127.0.0.1:9/unreachable";
  process.env.HENGFA_WEBHOOK_MAX_ATTEMPTS = "5";
  await backend.flushWebhookOutbox();
  let row = backend.db.prepare("SELECT status, attempts, last_error FROM webhook_outbox WHERE id = 'hook-retry'").get();
  assert.equal(row.status, "pending", "未超最大次数应保持待发以便重试");
  assert.equal(row.attempts, 1);
  assert.ok(row.last_error && row.last_error.length > 0, "失败原因应留痕");

  // 再次重试且最大次数设为 1 → 标记 failed
  process.env.HENGFA_WEBHOOK_MAX_ATTEMPTS = "1";
  await backend.flushWebhookOutbox();
  row = backend.db.prepare("SELECT status, attempts FROM webhook_outbox WHERE id = 'hook-retry'").get();
  assert.equal(row.status, "failed", "超过最大次数应标记 failed");
  delete process.env.HENGFA_REMINDER_WEBHOOK;
  delete process.env.HENGFA_WEBHOOK_MAX_ATTEMPTS;
});

test("webhook delivery log is queryable and retryable by admin", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Reminder-Test-2026" } });
  const cookie = cookieOf(login.response);
  const csrf = login.data.csrfToken;

  const log = await request("/api/notifications/webhook-log", { cookie });
  assert.equal(log.response.status, 200);
  assert.ok(Array.isArray(log.data.log));
  assert.ok(log.data.log.some(item => item.status === "failed"), "应能看到此前失败的投递留痕");
  assert.ok(typeof log.data.failed === "number" && typeof log.data.pending === "number");

  const retry = await request("/api/notifications/webhook-retry", { method: "POST", cookie, csrf, body: {} });
  assert.equal(retry.response.status, 200);
  assert.ok(typeof retry.data.pending === "number" && typeof retry.data.failed === "number");
});

test("retention cleanup removes only old read notifications", () => {
  const ws = "workspace_hengfa";
  const insert = backend.db.prepare("INSERT INTO notifications (id, workspace_id, type, level, title, detail, dedupe_key, meta_json, created_at, read_at) VALUES (?, ?, 'legal_expiry', 'medium', ?, ?, ?, '{}', ?, ?)");
  insert.run("ntf-old-read", ws, "旧已读", "旧已读", "ret:old", "2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z");
  insert.run("ntf-recent-read", ws, "近期已读", "近期已读", "ret:recent", new Date().toISOString(), new Date().toISOString());
  backend.db.prepare("INSERT INTO notifications (id, workspace_id, type, level, title, detail, dedupe_key, meta_json, created_at, read_at) VALUES (?, ?, 'legal_expiry', 'medium', ?, ?, ?, '{}', ?, NULL)")
    .run("ntf-old-unread", ws, "旧未读", "旧未读", "ret:oldunread", "2020-01-01T00:00:00.000Z");

  const removed = backend.purgeOldNotifications();
  assert.ok(removed >= 1, "应清理超期已读通知");
  assert.ok(!backend.db.prepare("SELECT 1 FROM notifications WHERE id = 'ntf-old-read'").get(), "超期已读应被删除");
  assert.ok(backend.db.prepare("SELECT 1 FROM notifications WHERE id = 'ntf-recent-read'").get(), "近期已读应保留");
  assert.ok(backend.db.prepare("SELECT 1 FROM notifications WHERE id = 'ntf-old-unread'").get(), "未读不应被删除");
});
