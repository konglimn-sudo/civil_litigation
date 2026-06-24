// Agent 编排 / 意图识别 / 立案前评估 / 文书逻辑校验 / 当事人答疑 测试。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyIntent, assessPrefiling, litigationFeeEstimate, logicCheck } from "../agent.mjs";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-agent-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Agent-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";
process.env.HENGFA_DISABLE_EMBED = "1";

const backend = await import(`../server.mjs?agent=${Date.now()}`);

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

test.after(() => { backend.db.close(); rmSync(dataDir, { recursive: true, force: true }); });

// —— 单元 ——
test("classifyIntent routes natural language to the right capability", () => {
  assert.equal(classifyIntent("帮我起草一份答辩状").intent, "document_draft");
  assert.equal(classifyIntent("民法典关于违约金是怎么规定的").intent, "legal_search");
  assert.equal(classifyIntent("这个案子要不要起诉").intent, "prefiling");
  const none = classifyIntent("对方欠钱不还");
  assert.equal(none.intent, "consult");
  assert.equal(none.route, "qa");
});

test("litigationFeeEstimate follows the progressive tiered table", () => {
  assert.equal(litigationFeeEstimate(0), 0);
  assert.equal(litigationFeeEstimate(8000), 50);       // ≤1万：每件 50。
  assert.equal(litigationFeeEstimate(50000), 1050);    // 50 + 4万×2.5%。
  assert.equal(litigationFeeEstimate(1250000), 16050); // 分段累进求和。
});

test("assessPrefiling scores dimensions and flags items to shore up", () => {
  const caseItem = { client: "甲公司", opposingParty: "乙公司", court: "某区人民法院", cause: "买卖合同纠纷", claims: "支付货款", amount: 500000 };
  const evidence = [{ status: "已核验", strength: "强" }, { status: "已核验", strength: "强" }];
  const a = assessPrefiling(caseItem, evidence, []);
  assert.equal(a.dimensions.length, 7, "应覆盖 7 个评估维度");
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.ok(["较高", "中等", "偏低"].includes(a.readiness));
  assert.ok(a.recommendations.some(line => line.startsWith("诉讼时效")), "诉讼时效应提示人工核验");

  // 信息缺失时主体/管辖应判为需补强。
  const weak = assessPrefiling({}, [], []);
  assert.ok(weak.score < a.score, "信息缺失案件准备度应更低");
});

test("logicCheck catches missing claim, missing basis, and contradictions", () => {
  const noClaim = logicCheck("本文书没有任何主张内容仅作占位。", {});
  assert.ok(noClaim.some(item => item.issue === "未见明确诉讼请求"));

  const noBasis = logicCheck("原告甲请求判令被告乙支付货款。此致法院。", { client: "甲", opposingParty: "乙" });
  assert.ok(noBasis.some(item => item.issue === "缺少法律依据"));

  const contradiction = logicCheck("被告已付清全部款项，但仍拖欠货款未付。请求判令。依据《民法典》第五百七十七条。", { client: "甲", opposingParty: "乙" });
  assert.ok(contradiction.some(item => item.issue === "疑似前后表述矛盾"));
});

// —— 端到端 ——
async function authedClient() {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Agent-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;
  const state = {
    activeCaseId: "case-x",
    cases: [{ id: "case-x", title: "某买卖合同货款纠纷", client: "甲公司", opposingParty: "乙公司", court: "某区人民法院", cause: "买卖合同纠纷", claims: "判令被告支付货款及逾期利息", facts: "原告依约交付货物，被告拖欠货款未付。", amount: 500000 }],
    evidence: [{ id: "ev-x", caseId: "case-x", name: "购销合同", status: "已核验", strength: "强" }],
    tasks: [], timeLogs: [], assetClues: [], documentVersions: [], caseEvents: [], qaMessages: [],
    settings: { audit: true }, metrics: {}
  };
  // 同一 DB 跨多个测试，先取当前修订号再 PUT（避免 revision 冲突 409）。
  const boot = await request("/api/bootstrap", { cookie, csrf });
  const put = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: boot.data.revision || 0, state } });
  assert.equal(put.response.status, 200);
  return { cookie, csrf };
}

test("intent endpoint classifies user input", async () => {
  const { cookie, csrf } = await authedClient();
  const res = await request("/api/agent/intent", { method: "POST", cookie, csrf, body: { text: "帮我生成一份起诉状" } });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.intent, "document_draft");
  assert.equal(res.data.route, "documents");
});

test("agent run chains retrieve→analyze→generate→verify into staged output", async () => {
  const { cookie, csrf } = await authedClient();
  const res = await request("/api/agent/run", { method: "POST", cookie, csrf, body: { caseId: "case-x", template: "complaint" } });
  assert.equal(res.response.status, 200);
  const names = res.data.stages.map(stage => stage.name);
  assert.deepEqual(names, ["意图识别", "知识检索", "事实分析", "文书生成", "引用与逻辑校验"]);
  const gen = res.data.stages.find(stage => stage.name === "文书生成");
  assert.ok(gen.content.includes("民事起诉状"), "生成阶段应产出起诉状初稿");
  const verify = res.data.stages.find(stage => stage.name === "引用与逻辑校验");
  assert.ok(Array.isArray(verify.verify.logic), "校验阶段应含逻辑校验结果");
});

test("prefiling assessment endpoint returns readiness score and dimensions", async () => {
  const { cookie, csrf } = await authedClient();
  const res = await request("/api/assessment/prefiling", { method: "POST", cookie, csrf, body: { caseId: "case-x" } });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.dimensions.length, 7);
  assert.ok(typeof res.data.score === "number");
  assert.ok(res.data.recommendation.length > 0);
});

test("document verify now includes a logic array", async () => {
  const { cookie, csrf } = await authedClient();
  const res = await request("/api/documents/verify", { method: "POST", cookie, csrf, body: { caseId: "case-x", content: "原告甲公司诉被告乙公司，本文书未列明任何请求事项，仅作测试占位内容填充。" } });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data.logic), "verify 结果应含 logic 数组");
  assert.equal(typeof res.data.logicIssues, "number");
});

test("consult endpoint answers in party-facing mode with disclaimer and citations", async () => {
  const { cookie, csrf } = await authedClient();
  const res = await request("/api/consult/answer", { method: "POST", cookie, csrf, body: { query: "对方拖欠货款不还，我该怎么办" } });
  assert.equal(res.response.status, 200);
  assert.ok(res.data.answer.length > 0);
  assert.ok(res.data.disclaimer.includes("不构成正式法律意见"));
  assert.ok(Array.isArray(res.data.citations));
  assert.ok(res.data.intent && typeof res.data.intent.intent === "string");
});
