import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-strategy-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Strategy-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?strategy=${Date.now()}`);

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

test.after(() => {
  backend.db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// 纯函数：FTS 召回相似类案 + 启发式倾向聚合。
test("precedent search recalls similar cases and aggregates tendency", () => {
  const results = backend.searchPrecedents("workspace_hengfa", "买卖合同 货款 对账 交付", 8);
  assert.ok(results.length > 0, "应召回相似类案");
  assert.ok(results.some(item => item.cause.includes("买卖合同")), "召回结果应含买卖合同类案");
  assert.ok(results.every(item => ["支持", "部分支持", "驳回"].includes(item.outcome)), "每条类案应有裁判结果标注");

  const tendency = backend.tendencyFromPrecedents(results);
  assert.equal(tendency.total, tendency.support + tendency.partial + tendency.dismiss, "三类计数应等于总数");
  assert.equal(tendency.supportPct + tendency.partialPct + tendency.dismissPct <= 100 + 2, true, "占比之和不应超过 100（含取整误差）");
  assert.ok(tendency.lead, "应给出占比最高的倾向");
});

// 端到端：/api/strategy/tendency 基于案件案由检索类案并给出本地综述（LLM 关闭时）。
test("strategy tendency endpoint returns grounded reference for a case", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Strategy-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  const state = {
    activeCaseId: "case-mm",
    cases: [{ id: "case-mm", title: "某建材买卖合同货款纠纷", client: "甲公司", opposingParty: "乙公司", cause: "买卖合同纠纷", claims: "判令被告支付货款及逾期利息", facts: "原告依约交付建材并经对账确认，被告拖欠货款未付。" }],
    evidence: [], tasks: [], timeLogs: [], assetClues: [], documentVersions: [], caseEvents: [], qaMessages: [],
    settings: { audit: true }, metrics: {}
  };
  let result = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: 0, state } });
  assert.equal(result.response.status, 200);

  const tendency = await request("/api/strategy/tendency", { method: "POST", cookie, csrf, body: { caseId: "case-mm" } });
  assert.equal(tendency.response.status, 200);
  assert.ok(tendency.data.precedents.length > 0, "应基于案由召回类案");
  assert.ok(tendency.data.precedents.some(item => item.cause.includes("买卖合同")), "应召回买卖合同类案");
  assert.ok(tendency.data.tendency.total > 0, "应聚合裁判倾向");
  assert.equal(tendency.data.summaryBy, "heuristic", "未启用 LLM 时应走本地启发式综述");
  assert.ok(tendency.data.summary.includes("类案"), "综述应说明类案样例口径");

  // 不存在的案件应被拒绝。
  const missing = await request("/api/strategy/tendency", { method: "POST", cookie, csrf, body: { caseId: "no-such-case" } });
  assert.equal(missing.response.status, 404);

  // 缺少 CSRF 应被拒绝。
  const noCsrf = await request("/api/strategy/tendency", { method: "POST", cookie, body: { caseId: "case-mm" } });
  assert.equal(noCsrf.response.status, 403);
});
