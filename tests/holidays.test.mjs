import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-holidays-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Holiday-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?holidays=${Date.now()}`);

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

test.after(() => { backend.db.close(); rmSync(dataDir, { recursive: true, force: true }); });

test("holiday calendars are centrally seeded, served, and admin-editable", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Holiday-Test-2026" } });
  const cookie = cookieOf(login.response);
  const csrf = login.data.csrfToken;

  // 播种:2025 已核验 + 2026 待核验
  let r = await request("/api/holidays", { cookie });
  assert.equal(r.response.status, 200);
  assert.equal(r.data.calendars["2025"].verified, true);
  assert.equal(r.data.calendars["2026"].verified, false);
  assert.ok(r.data.calendars["2025"].holidays.includes("2025-10-01"));
  assert.ok(r.data.calendars["2025"].workdays.includes("2025-09-28"));

  // 管理员新增/更新年度,非法或跨年度日期被过滤
  r = await request("/api/holidays/2027", {
    method: "PUT", cookie, csrf,
    body: { verified: true, holidays: ["2027-01-01", "2027-10-01", "bad-date", "2025-05-01"], workdays: ["2027-09-26"] }
  });
  assert.equal(r.response.status, 200);
  assert.deepEqual(r.data.holidays, ["2027-01-01", "2027-10-01"], "应过滤非法与非本年度日期并排序");
  assert.deepEqual(r.data.workdays, ["2027-09-26"]);

  // 更新即对全员生效(再次 GET 可见)
  r = await request("/api/holidays", { cookie });
  assert.equal(r.data.calendars["2027"].verified, true);
  assert.deepEqual(r.data.calendars["2027"].holidays, ["2027-01-01", "2027-10-01"]);

  // 缺少 manage_settings 权限不可维护(助理角色)
  await request("/api/users", { method: "POST", cookie, csrf, body: { name: "助理", email: "assistant@example.test", password: "Assistant-2026-xx", role: "assistant" } });
  const assistant = await request("/api/auth/login", { method: "POST", body: { email: "assistant@example.test", password: "Assistant-2026-xx" } });
  const r2 = await request("/api/holidays/2028", { method: "PUT", cookie: cookieOf(assistant.response), csrf: assistant.data.csrfToken, body: { verified: true, holidays: ["2028-01-01"] } });
  assert.equal(r2.response.status, 403);
  assert.equal(r2.data.code, "PERMISSION_DENIED");

  // 但助理可读取(用于期限推算)
  const r3 = await request("/api/holidays", { cookie: cookieOf(assistant.response) });
  assert.equal(r3.response.status, 200);
  assert.ok(r3.data.calendars["2027"]);
});
