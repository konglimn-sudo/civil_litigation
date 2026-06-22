import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-backend-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Backend-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?test=${Date.now()}`);

function mockRequest(method, cookie, csrf, body, headers = {}) {
  const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...headers
    },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      if (payload) yield payload;
    }
  };
}

function mockResponse() {
  return {
    status: 0,
    headers: {},
    headersSent: false,
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(data = "") { this.body += data; }
  };
}

async function request(pathname, { method = "GET", cookie = "", csrf = "", body, headers = {} } = {}) {
  const requestObject = mockRequest(method, cookie, csrf, body, headers);
  const response = mockResponse();
  await backend.handleApi(requestObject, response, new URL(`http://127.0.0.1${pathname}`));
  return { response, data: response.body ? JSON.parse(response.body) : {} };
}

function cookieFrom(response) {
  return String(response.headers["Set-Cookie"] || "").split(";", 1)[0];
}

test.after(() => {
  backend.db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("authentication, CSRF, revision and role isolation", async () => {
  let result = await request("/api/session");
  assert.equal(result.response.status, 401);

  result = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "wrong-password" } });
  assert.equal(result.response.status, 401);

  result = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Backend-Test-2026" } });
  assert.equal(result.response.status, 200);
  const adminCookie = cookieFrom(result.response);
  const adminCsrf = result.data.csrfToken;
  assert.ok(adminCookie.startsWith("hengfa_session="));
  assert.equal(result.data.user.role, "admin");
  assert.ok(result.data.permissions.includes("manage_users"));

  result = await request("/api/bootstrap", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.revision, 0);

  const state = {
    activeCaseId: "case-a",
    cases: [
      { id: "case-a", title: "甲案件", client: "甲" },
      { id: "case-b", title: "乙案件", client: "乙" }
    ],
    evidence: [{ id: "ev-a", caseId: "case-a", name: "合同" }],
    tasks: [], timeLogs: [], assetClues: [], documentVersions: [], caseEvents: [], qaMessages: [],
    settings: { audit: true }, metrics: {}
  };
  result = await request("/api/state", { method: "PUT", cookie: adminCookie, body: { revision: 0, state } });
  assert.equal(result.response.status, 403);
  assert.equal(result.data.code, "CSRF_INVALID");

  result = await request("/api/state", { method: "PUT", cookie: adminCookie, csrf: adminCsrf, body: { revision: 0, state } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.revision, 1);

  result = await request("/api/files?caseId=case-a&name=%E5%90%88%E5%90%8C%E8%AF%B4%E6%98%8E.txt", {
    method: "POST", cookie: adminCookie, csrf: adminCsrf,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: Buffer.from("合同已经签订并完成部分履行。案件材料仅用于权限测试。")
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.file.status, "processed");
  assert.ok(result.data.file.extractedText.includes("合同已经签订"));
  const uploadedFileId = result.data.file.id;

  result = await request("/api/files?caseId=case-a", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.files.length, 1);
  assert.equal(result.data.files[0].sha256.length, 64);

  result = await request("/api/state", { method: "PUT", cookie: adminCookie, csrf: adminCsrf, body: { revision: 0, state } });
  assert.equal(result.response.status, 409);
  assert.equal(result.data.code, "REVISION_CONFLICT");

  result = await request("/api/users", {
    method: "POST", cookie: adminCookie, csrf: adminCsrf,
    body: { name: "案件当事人", email: "client@example.test", password: "Client-Test-2026", role: "client", caseIds: ["case-a"] }
  });
  assert.equal(result.response.status, 201);

  result = await request("/api/users", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.users.length, 2);
  assert.deepEqual(result.data.users.find(user => user.email === "client@example.test").caseIds, ["case-a"]);

  result = await request("/api/auth/login", { method: "POST", body: { email: "client@example.test", password: "Client-Test-2026" } });
  assert.equal(result.response.status, 200);
  const clientCookie = cookieFrom(result.response);
  const clientCsrf = result.data.csrfToken;
  assert.equal(result.data.user.role, "client");

  result = await request("/api/bootstrap", { cookie: clientCookie });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.state.cases.map(item => item.id), ["case-a"]);
  assert.deepEqual(result.data.state.evidence.map(item => item.id), ["ev-a"]);

  result = await request("/api/files", { cookie: clientCookie });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.files.map(item => item.id), [uploadedFileId]);

  result = await request(`/api/files/${uploadedFileId}`, { cookie: clientCookie });
  assert.ok(result.data.file.extractedText.includes("权限测试"));

  result = await request("/api/files?caseId=case-a&name=forbidden.txt", {
    method: "POST", cookie: clientCookie, csrf: clientCsrf,
    headers: { "content-type": "text/plain" }, body: Buffer.from("forbidden")
  });
  assert.equal(result.response.status, 403);

  result = await request("/api/state", { method: "PUT", cookie: clientCookie, csrf: clientCsrf, body: { revision: 1, state } });
  assert.equal(result.response.status, 403);
  assert.equal(result.data.code, "READ_ONLY_ROLE");

  result = await request("/api/audit", { method: "POST", cookie: adminCookie, csrf: adminCsrf, body: { action: "测试操作", detail: "权限测试完成" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/bootstrap", { cookie: adminCookie });
  assert.ok(result.data.state.auditLogs.some(item => item.action === "测试操作"));
});

test("private data and backend files are not publicly served", () => {
  for (const pathname of ["/data/hengfa.db", "/data/uploads/private.pdf", "/server.mjs", "/scripts/extract_text.py"]) {
    const response = mockResponse();
    backend.serveStatic({ method: "GET" }, response, new URL(`http://127.0.0.1${pathname}`));
    assert.equal(response.status, 404, pathname);
  }
});
