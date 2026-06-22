import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { htmlToText, mapFlkLevel, normalizeFlkSource } from "../scripts/fetch_flk.mjs";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-import-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Import-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?import=${Date.now()}`);

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

test("flk parser helpers normalize official data shape", () => {
  assert.equal(htmlToText("<p>第一条 <b>合同</b>依法成立。</p><div>第二条&nbsp;受保护。</div>"), "第一条 合同依法成立。\n第二条 受保护。");
  assert.equal(mapFlkLevel("法律"), "法律");
  assert.equal(mapFlkLevel("司法解释"), "司法解释/程序规则");
  assert.equal(mapFlkLevel(""), "法律");

  const source = normalizeFlkSource(
    { id: "ZmY4MDgx", title: "中华人民共和国民法典", office: "全国人民代表大会", type: "法律", publish: "2020-05-28" },
    "<p>第四百六十五条 依法成立的合同受法律保护。</p>"
  );
  assert.equal(source.title, "中华人民共和国民法典");
  assert.equal(source.level, "法律");
  assert.equal(source.status, "有效性待核验");
  assert.ok(source.sourceUrl.includes("flk.npc.gov.cn"));
  assert.ok(source.text.includes("依法成立的合同受法律保护"));
});

test("bulk import indexes sources and makes them searchable", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Import-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  const sources = [
    { title: "测试法源·建设工程价款优先受偿", authority: "全国人大常委会", level: "法律", status: "有效性待核验", text: "发包人未按约定支付工程价款的，承包人就该建设工程折价或者拍卖的价款享有优先受偿权，但不得对抗善意买受人。" },
    { title: "无效条目", text: "太短" } // 应被跳过
  ];
  const result = await request("/api/legal/import", { method: "POST", cookie, csrf, body: { sources } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.imported, 1);
  assert.equal(result.data.skipped, 1);
  assert.ok(result.data.chunks >= 1);

  const search = await request("/api/legal/search", { method: "POST", cookie, csrf, body: { query: "建设工程 价款 优先受偿" } });
  assert.ok(search.data.results.some(item => item.title.includes("建设工程价款优先受偿")), "导入的法源应可被检索到");

  const empty = await request("/api/legal/import", { method: "POST", cookie, csrf, body: { sources: [] } });
  assert.equal(empty.response.status, 400);
});

test("legal source status changes are tracked with revision history", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Import-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  // 创建一条法源(应产生「创建」留痕)
  const created = await request("/api/legal/sources", { method: "POST", cookie, csrf, body: { title: "留痕测试·某司法解释", authority: "最高人民法院", level: "司法解释", status: "现行有效", text: "本规定自公布之日起施行，用于变更留痕回归测试，内容须由办案人员核验。" } });
  assert.equal(created.response.status, 201);
  const sourceId = created.data.source.id;

  // 变更效力状态 + 生效日期(逐字段留痕)
  const patched = await request(`/api/legal/sources/${sourceId}`, { method: "PATCH", cookie, csrf, body: { status: "已废止", effectiveDate: "2026-01-01" } });
  assert.equal(patched.response.status, 200);
  assert.equal(patched.data.changes, 2);

  // 相同值再次 PATCH 不应产生新留痕
  const noop = await request(`/api/legal/sources/${sourceId}`, { method: "PATCH", cookie, csrf, body: { status: "已废止" } });
  assert.equal(noop.data.changes, 0);

  // 变更历史:创建 + 2 项字段变更,且效力状态记录 现行有效 → 已废止
  const history = await request(`/api/legal/sources/${sourceId}/revisions`, { cookie });
  assert.equal(history.response.status, 200);
  assert.equal(history.data.revisions.length, 3);
  const statusRev = history.data.revisions.find(item => item.field === "效力状态");
  assert.equal(statusRev.oldValue, "现行有效");
  assert.equal(statusRev.newValue, "已废止");
  assert.ok(history.data.revisions.some(item => item.field === "创建"));

  // 列表应反映最新状态与留痕计数
  const list = await request("/api/legal/sources", { cookie });
  const row = list.data.sources.find(item => item.id === sourceId);
  assert.equal(row.status, "已废止");
  assert.ok(row.revisionCount >= 3);
});

test("lapsed sources are filtered from search, flagged in verify, and surfaced as document impact", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Import-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  // 法源正文含可被「书名号引用」命中的独特短语(正文会被 FTS 索引)
  const created = await request("/api/legal/sources", { method: "POST", cookie, csrf, body: { title: "甲特别程序指引", authority: "最高人民法院", level: "司法解释", status: "现行有效", text: "甲特别程序条款 适用于特定抵充与履行顺序情形，本条用于失效联动回归测试，须由办案人员核验。" } });
  const sourceId = created.data.source.id;

  // 现行有效:默认可检索到
  let search = await request("/api/legal/search", { method: "POST", cookie, csrf, body: { query: "甲特别程序条款 抵充" } });
  assert.ok(search.data.results.some(item => item.title.includes("甲特别程序指引")), "现行有效法源默认可检索到");

  // 标记为已废止
  await request(`/api/legal/sources/${sourceId}`, { method: "PATCH", cookie, csrf, body: { status: "已废止" } });

  // 默认检索排除已废止;includeLapsed 时可检索到
  search = await request("/api/legal/search", { method: "POST", cookie, csrf, body: { query: "甲特别程序条款 抵充" } });
  assert.ok(!search.data.results.some(item => item.title.includes("甲特别程序指引")), "已废止法源默认应被过滤");
  search = await request("/api/legal/search", { method: "POST", cookie, csrf, body: { query: "甲特别程序条款 抵充", includeLapsed: true } });
  assert.ok(search.data.results.some(item => item.title.includes("甲特别程序指引")), "显式包含失效时应检索到");

  // 建立案件并保存一份引用该(已废止)法源的文书版本
  const draft = "本案应依据《甲特别程序条款》处理抵充与履行顺序。";
  const state = {
    activeCaseId: "case-imp",
    cases: [{ id: "case-imp", title: "失效联动测试案", client: "甲", opposingParty: "乙" }],
    evidence: [], tasks: [], timeLogs: [], assetClues: [], documentVersions: [{ id: "doc-imp", caseId: "case-imp", name: "代理词", version: "v1", member: "律师", updatedAt: "2026-06-01", content: draft }], caseEvents: [], qaMessages: [], settings: {}, metrics: {}
  };
  const put = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: 0, state } });
  assert.equal(put.response.status, 200);

  // 校验:引用了已废止法源 → 标记 outdated
  const verify = await request("/api/documents/verify", { method: "POST", cookie, csrf, body: { caseId: "case-imp", content: draft } });
  assert.equal(verify.response.status, 200);
  assert.ok(verify.data.outdatedLegal >= 1, "应识别出失效法源引用");
  assert.ok(verify.data.legal.some(item => item.status === "outdated" && item.matched.title.includes("甲特别程序指引")));

  // 影响面反查:已保存文书版本引用了失效法源
  const impact = await request("/api/legal/impact", { cookie });
  assert.equal(impact.response.status, 200);
  const hit = impact.data.impacts.find(item => item.document === "代理词");
  assert.ok(hit, "应反查到引用失效法源的文书");
  assert.equal(hit.documentId, "doc-imp", "影响面应返回文书版本 id 以便定位");
  assert.ok(hit.lapsed.some(law => law.source.includes("甲特别程序指引") && law.status === "已废止"));
  assert.ok(hit.lapsed.some(law => law.ref === "甲特别程序条款"), "应携带引用词用于高亮定位");

  // 替换为新版本(不含失效引用)后,影响面仅取最新版,告警消除
  const state2 = { ...state, documentVersions: [
    { id: "doc-imp2", caseId: "case-imp", name: "代理词", version: "v2", member: "律师", updatedAt: "2026-06-02", content: "本案应依据现行有效规定处理抵充与履行顺序。" },
    state.documentVersions[0]
  ] };
  const put2 = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: 1, state: state2 } });
  assert.equal(put2.response.status, 200);
  const impact2 = await request("/api/legal/impact", { cookie });
  assert.ok(!impact2.data.impacts.some(item => item.document === "代理词"), "替换为新版本后影响面应清除该文书告警");
});

test("legal source valid-until is stored, returned and change-tracked", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Import-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  const created = await request("/api/legal/sources", { method: "POST", cookie, csrf, body: { title: "某临时性规定·有效期测试", authority: "最高人民法院", level: "司法解释", status: "现行有效", validUntil: "2026-12-31", text: "本临时规定自公布之日起施行，至 2026 年底失效，用于到期预警回归测试，须人工核验。" } });
  const sourceId = created.data.source.id;

  let list = await request("/api/legal/sources", { cookie });
  let row = list.data.sources.find(item => item.id === sourceId);
  assert.equal(row.validUntil, "2026-12-31", "创建时应保存有效期至");

  // 修改有效期至 → 产生「有效期至」留痕
  const patched = await request(`/api/legal/sources/${sourceId}`, { method: "PATCH", cookie, csrf, body: { validUntil: "2027-06-30" } });
  assert.equal(patched.data.changes, 1);
  const history = await request(`/api/legal/sources/${sourceId}/revisions`, { cookie });
  const rev = history.data.revisions.find(item => item.field === "有效期至");
  assert.ok(rev, "有效期至变更应留痕");
  assert.equal(rev.oldValue, "2026-12-31");
  assert.equal(rev.newValue, "2027-06-30");

  list = await request("/api/legal/sources", { cookie });
  row = list.data.sources.find(item => item.id === sourceId);
  assert.equal(row.validUntil, "2027-06-30");
});
