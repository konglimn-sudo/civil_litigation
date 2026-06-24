import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { renderDocumentTemplate, templateLabels } from "../document-templates.mjs";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-plugin-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Plugin-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?plugin=${Date.now()}`);

function mockResponse() {
  return {
    status: 0, headers: {}, headersSent: false, body: "",
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    end(data = "") { this.body += data; }
  };
}

async function request(pathname, { method = "GET", cookie = "", csrf = "", body, headers = {} } = {}) {
  const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const req = {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), "content-type": "application/json", ...headers },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() { if (payload) yield payload; }
  };
  const response = mockResponse();
  await backend.handleApi(req, response, new URL(`http://127.0.0.1${pathname}`));
  return { response, data: response.body ? JSON.parse(response.body) : {} };
}

// serveStatic 用真实 http 路由（含 /plugin/*），直接调用导出的 serveStatic。
function serveStaticRequest(pathname, method = "GET") {
  const req = { method, headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  const response = mockResponse();
  backend.serveStatic(req, response, new URL(`http://127.0.0.1${pathname}`));
  return response;
}

test.after(() => {
  backend.db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// 共享模板纯函数：六类文书都能按案件数据生成。
test("renderDocumentTemplate produces drafts for every template", () => {
  const caseItem = { title: "甲乙买卖合同纠纷", caseNo: "（2026）示例民初 1 号", court: "某区人民法院", client: "甲", opposingParty: "乙", cause: "买卖合同纠纷", claims: "支付货款 10 万元", facts: "已交付货物并对账。" };
  const evidence = [{ name: "购销合同", type: "书证", source: "原件", fact: "证明合同关系", status: "已核验" }];
  for (const template of Object.keys(templateLabels)) {
    const text = renderDocumentTemplate(template, caseItem, evidence, []);
    assert.ok(text.length > 30, `${template} 应生成内容`);
    assert.ok(text.includes("系统提示"), `${template} 应含核验提示`);
  }
  assert.ok(renderDocumentTemplate("complaint", caseItem, evidence, []).includes("民事起诉状"));
  assert.equal(renderDocumentTemplate("complaint", null, [], []), "请先新建并选择案件。");
});

// 端点：/api/documents/generate 按案件状态生成并鉴权。
test("documents generate endpoint returns drafted content", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Plugin-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  const state = {
    activeCaseId: "case-p",
    cases: [{ id: "case-p", title: "插件测试案", client: "甲", opposingParty: "乙", cause: "买卖合同纠纷", court: "某区人民法院", caseNo: "（2026）示例民初 9 号", claims: "支付货款", facts: "已交付" }],
    evidence: [{ id: "ev-p", caseId: "case-p", name: "合同", type: "书证", source: "原件", fact: "证明合同关系", status: "已核验" }],
    tasks: [], timeLogs: [], assetClues: [], documentVersions: [], caseEvents: [], qaMessages: [],
    settings: { audit: true }, metrics: {}
  };
  let result = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: 0, state } });
  assert.equal(result.response.status, 200);

  const gen = await request("/api/documents/generate", { method: "POST", cookie, csrf, body: { caseId: "case-p", template: "complaint" } });
  assert.equal(gen.response.status, 200);
  assert.equal(gen.data.label, "民事起诉状");
  assert.ok(gen.data.content.includes("插件测试案") || gen.data.content.includes("民事起诉状"));

  const bad = await request("/api/documents/generate", { method: "POST", cookie, csrf, body: { caseId: "case-p", template: "no-such" } });
  assert.equal(bad.response.status, 400);
  const missing = await request("/api/documents/generate", { method: "POST", cookie, csrf, body: { caseId: "ghost", template: "complaint" } });
  assert.equal(missing.response.status, 404);
  const noCsrf = await request("/api/documents/generate", { method: "POST", cookie, body: { caseId: "case-p", template: "complaint" } });
  assert.equal(noCsrf.response.status, 403);
});

// serveStatic 提供任务窗格，并用允许 Office.js CDN 的 CSP、去除 X-Frame-Options。
test("serveStatic serves plugin taskpane with Office-compatible headers", () => {
  const pane = serveStaticRequest("/plugin/taskpane.html");
  assert.equal(pane.status, 200);
  assert.match(pane.headers["Content-Type"], /text\/html/);
  assert.match(pane.headers["Content-Security-Policy"], /appsforoffice\.microsoft\.com/);
  assert.equal(pane.headers["X-Frame-Options"], undefined);

  const manifest = serveStaticRequest("/plugin/manifest.xml");
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers["Content-Type"], /xml/);

  // 非白名单路径仍应 404（防目录穿越/任意读取）。
  assert.equal(serveStaticRequest("/plugin/secret.txt").status, 404);
  assert.equal(serveStaticRequest("/server.mjs").status, 404);
});

// 清单为合法 XML 且声明任务窗格与权限。
test("manifest.xml is well-formed and declares taskpane", () => {
  const xml = readFileSync(new URL("../plugin/manifest.xml", import.meta.url), "utf8");
  assert.ok(xml.includes("<OfficeApp"));
  assert.ok(xml.includes("ReadWriteDocument"));
  assert.ok(xml.includes("/plugin/taskpane.html"));
  // 标签配对的最简检查：起止标签数量一致。
  assert.equal((xml.match(/<OfficeApp/g) || []).length, 1);
  assert.equal((xml.match(/<\/OfficeApp>/g) || []).length, 1);
});
