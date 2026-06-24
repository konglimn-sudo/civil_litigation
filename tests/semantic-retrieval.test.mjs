// 语义向量 / 混合检索测试：
//  1) 嵌入模块单元测试（确定性、零依赖）——同概念不同表述应高余弦、无关文本低余弦、序列化往返。
//  2) 端到端——用「概念同义但无共享 bigram」的检索词，验证语义向量能召回纯 FTS 漏掉的法源。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { embedOne, embedBatch, cosineSim, vectorToBlob, blobToVector, embedderInfo } from "../embedding.mjs";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-semantic-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Semantic-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";
process.env.HENGFA_DISABLE_EMBED = "1"; // 测试固定走零依赖本地向量，确定性可断言。

const backend = await import(`../server.mjs?semantic=${Date.now()}`);

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

// —— 单元：本地概念向量 ——
test("local embedding maps same legal concept across surface forms to high cosine", () => {
  const info = embedderInfo();
  assert.equal(info.engine, "local", "测试应固定使用零依赖本地引擎");
  assert.equal(info.dense, false);

  // 「拖欠」与「欠款」无共享 bigram，但同属「欠款」概念组 → 余弦应明显高于无关文本。
  const a = embedOne("被告长期拖欠，迟迟不付").vector;
  const b = embedOne("当事人欠款未付，应承担责任").vector;
  const unrelated = embedOne("房屋租赁合同的押金与租金约定").vector;
  const sim = cosineSim(a, b);
  const noise = cosineSim(a, unrelated);
  assert.ok(sim > 0.2, `同概念余弦应较高，实际 ${sim}`);
  assert.ok(sim > noise + 0.1, `同概念(${sim})应明显高于无关(${noise})`);

  // 自身余弦为 1（已归一化）。
  assert.ok(Math.abs(cosineSim(a, a) - 1) < 1e-5, "归一化向量自余弦应为 1");
});

test("vector blob round-trips through SQLite buffer encoding", () => {
  const { vector } = embedOne("诉讼时效届满的法律后果");
  const restored = blobToVector(vectorToBlob(vector));
  assert.equal(restored.length, vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    assert.ok(Math.abs(restored[index] - vector[index]) < 1e-6, "往返后向量应一致");
  }
  // 批量与单条接口口径一致。
  const batch = embedBatch(["诉讼时效届满的法律后果"]);
  assert.ok(cosineSim(batch[0].vector, vector) > 0.999);
});

// —— 端到端：语义召回纯 FTS 漏掉的法源 ——
test("hybrid retrieval recalls a source the lexical index would miss (concept synonym, no shared bigram)", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Semantic-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  // 能力探测：混合检索启用、本地引擎、向量已入库。
  const cap = await request("/api/retrieval/capabilities", { cookie, csrf });
  assert.equal(cap.data.hybrid, true);
  assert.equal(cap.data.dense, false);
  assert.ok(cap.data.vectorCount > 0, "样例语料应已生成向量");

  // 导入一条只含「欠款」表述的法源（标题做唯一标记）。
  const marker = "概念召回样例ZX9K";
  const imported = await request("/api/legal/import", { method: "POST", cookie, csrf, body: {
    sources: [{ title: `${marker}·欠款责任条款`, authority: "实务样例", level: "其他", status: "有效",
      text: "本样例条款：债务人长期欠款不付的，债权人有权催告并依法主张相应责任。仅供检索演示。" }]
  } });
  assert.equal(imported.response.status, 201);
  assert.equal(imported.data.imported, 1);

  // 检索词用「拖欠」（同属欠款概念组），与上条法源无任何共享 bigram（欠款≠拖欠）。
  const query = "对方拖欠迟迟不还该怎么办";
  const search = await request("/api/legal/search", { method: "POST", cookie, csrf, body: { query, limit: 10 } });
  assert.equal(search.response.status, 200);
  assert.match(search.data.retrieval, /^hybrid-fts5\+vector\(/);

  const hit = search.data.results.find(item => item.title.includes(marker));
  assert.ok(hit, "概念同义检索词应召回仅含『欠款』表述的法源（纯字面无法命中）");
  assert.ok(typeof hit.vectorScore === "number" && hit.vectorScore > 0, "命中应由语义向量贡献");
  assert.equal(hit.lexScore, null, "纯 FTS 不应命中该条（证明语义召回的增量价值）");
});
