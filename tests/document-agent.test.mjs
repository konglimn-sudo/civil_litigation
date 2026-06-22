import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-docagent-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Doc-Agent-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?docagent=${Date.now()}`);

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
    headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), ...headers },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() { if (payload) yield payload; }
  };
  const response = mockResponse();
  await backend.handleApi(req, response, new URL(`http://127.0.0.1${pathname}`));
  return { response, data: response.body ? JSON.parse(response.body) : {} };
}

test.after(() => { backend.db.close(); rmSync(dataDir, { recursive: true, force: true }); });

test("document agent: fact extraction and citation verification", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Doc-Agent-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  // 建立案件
  const state = {
    activeCaseId: "case-a",
    cases: [{ id: "case-a", title: "张三买卖合同纠纷", client: "张三", opposingParty: "某建材有限公司", cause: "买卖合同纠纷", court: "某法院" }],
    evidence: [{ id: "ev-1", caseId: "case-a", name: "对账单", fact: "证明欠款", note: "" }],
    tasks: [], timeLogs: [], assetClues: [], documentVersions: [], caseEvents: [], qaMessages: [], settings: {}, metrics: {}
  };
  let r = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: 0, state } });
  assert.equal(r.response.status, 200);

  // 上传案件材料(txt),其文本含金额/当事人/日期(乱序)/履行要件
  const material = "2025年5月10日双方对账确认欠款。买卖合同签订于2025年3月。被告某建材有限公司应支付货款680000元。货物已交付并验收。被告逾期未付清尾款，构成违约。原告张三多次催告未果。";
  r = await request("/api/files?caseId=case-a&name=case-note.txt", {
    method: "POST", cookie, csrf, headers: { "content-type": "text/plain; charset=utf-8" }, body: Buffer.from(material)
  });
  assert.equal(r.response.status, 201);
  assert.equal(r.data.file.status, "processed");

  // 事实抽取:应从材料抽取带来源与类型的候选事实
  r = await request("/api/documents/facts", { method: "POST", cookie, csrf, body: { caseId: "case-a" } });
  assert.equal(r.response.status, 200);
  assert.equal(r.data.filesScanned, 1);
  assert.ok(r.data.facts.length > 0, "应抽取到候选事实");
  assert.ok(r.data.facts.every(item => item.source === "case-note.txt"), "事实应标注来源文件");
  assert.ok(r.data.facts.some(item => item.types.includes("金额")), "应识别金额类事实");
  assert.ok(r.data.facts.some(item => item.fact.includes("货款680000元")), "应抽取含货款金额的事实");

  // 时间线:含日期的事实按时间升序排列（即使原文中日期乱序）
  assert.ok(Array.isArray(r.data.timeline), "应返回时间线数组");
  assert.ok(r.data.timeline.length >= 2, "应解析出至少两个时间节点");
  assert.ok(r.data.timeline.every(item => item.date), "时间线元素应带日期");
  const dates = r.data.timeline.map(item => item.date);
  assert.deepEqual(dates, [...dates].sort((a, b) => a.localeCompare(b)), "时间线应按时间升序");
  assert.equal(dates[0], "2025-03-01", "最早节点应为 2025年3月");
  assert.ok(dates.includes("2025-05-10"), "应解析出 2025年5月10日");

  // 引用校验:法条引用命中法源库;金额/当事人按案件材料判定有无依据
  const draft = "原告张三诉称：被告某建材有限公司未支付货款680000元，构成违约责任，应承担损失赔偿。另根据诉讼时效规定主张权利。原告另主张利息123456元。";
  r = await request("/api/documents/verify", { method: "POST", cookie, csrf, body: { caseId: "case-a", content: draft } });
  assert.equal(r.response.status, 200);
  assert.equal(r.data.filesScanned, 1);

  // 法条引用:违约责任/诉讼时效应在种子语料中被检索到(verified)
  assert.ok(r.data.legal.some(item => item.ref === "违约责任" && item.status === "verified"), "违约责任应命中法源库");
  assert.ok(r.data.legal.some(item => item.ref === "诉讼时效" && item.status === "verified"), "诉讼时效应命中法源库");

  // 事实校验:680000 元在材料中→grounded;123456 元不在→ungrounded;当事人张三在材料中→grounded
  const amount680 = r.data.facts.find(item => item.claim.includes("680000"));
  const amount123 = r.data.facts.find(item => item.claim.includes("123456"));
  assert.equal(amount680?.status, "grounded", "材料中存在的金额应判为有依据");
  assert.equal(amount680?.source, "case-note.txt", "有依据金额应标注来源文件");
  assert.equal(amount680?.sourceKind, "file");
  assert.equal(amount123?.status, "ungrounded", "材料中不存在的金额应判为缺依据");
  assert.equal(amount123?.source, "", "缺依据金额无来源");
  assert.ok(r.data.facts.some(item => item.claim.includes("张三") && item.status === "grounded"), "当事人张三应判为有依据");
  assert.ok(r.data.ungroundedFacts >= 1);

  // 内容过短应被拒绝
  const short = await request("/api/documents/verify", { method: "POST", cookie, csrf, body: { caseId: "case-a", content: "太短" } });
  assert.equal(short.response.status, 400);
});
