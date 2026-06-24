import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseTranscript, transcriptionCapabilities } from "../transcribe.mjs";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-hearing-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Hearing-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";
process.env.HENGFA_DISABLE_ASR = "1"; // 测试环境强制「无本地引擎」，转写走 manual 分支。

const backend = await import(`../server.mjs?hearing=${Date.now()}`);

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

test.after(() => {
  backend.db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// 零依赖笔录解析：SRT / 带说话人 / 纯文本。
test("parseTranscript structures SRT, labeled and plain transcripts", () => {
  const srt = parseTranscript("1\n00:00:01,000 --> 00:00:03,000\n审判长：现在开庭。\n\n2\n00:00:04,000 --> 00:00:06,000\n原告代理人：对证据真实性无异议。");
  assert.equal(srt.length, 2);
  assert.equal(srt[0].speaker, "审判长");
  assert.equal(srt[0].text, "现在开庭。");
  assert.equal(srt[0].time, "00:01");
  assert.equal(srt[1].speaker, "原告代理人");

  const labeled = parseTranscript("审判长：请原告陈述。\n被告代理人：我方有异议。");
  assert.equal(labeled.length, 2);
  assert.equal(labeled[1].speaker, "被告代理人");

  const plain = parseTranscript("本案争议焦点为货款数额与交付情况。\n双方对合同真实性均认可。");
  assert.equal(plain.length, 2);
  assert.equal(plain[0].speaker, "");
  assert.ok(plain[0].text.includes("争议焦点"));

  assert.deepEqual(parseTranscript("   "), []);
});

// 无本地引擎时能力探测应回退到 manual。
test("transcription capabilities report manual when no local engine", () => {
  const caps = transcriptionCapabilities();
  assert.equal(caps.available, false);
  assert.equal(caps.engine, "manual");
  assert.equal(caps.localOnly, true);
});

// 端到端：能力查询 / 导入结构化 / 音频转写回退 manual / 庭审小结本地回退。
test("hearing endpoints handle import, audio fallback and summary", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Hearing-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  const state = {
    activeCaseId: "case-h",
    cases: [{ id: "case-h", title: "庭审转写测试案", client: "甲", opposingParty: "乙", cause: "买卖合同纠纷", claims: "支付货款", facts: "已交付" }],
    evidence: [], tasks: [], timeLogs: [], assetClues: [], documentVersions: [], caseEvents: [], qaMessages: [],
    settings: { audit: true }, metrics: {}
  };
  let result = await request("/api/state", { method: "PUT", cookie, csrf, body: { revision: 0, state } });
  assert.equal(result.response.status, 200);

  // 能力查询：测试环境无引擎。
  const caps = await request("/api/hearing/capabilities", { cookie });
  assert.equal(caps.response.status, 200);
  assert.equal(caps.data.available, false);

  // 文本导入路径：结构化为分段。
  const imported = await request("/api/hearing/transcribe", { method: "POST", cookie, csrf, body: { caseId: "case-h", text: "审判长：现在开庭。\n原告代理人：对账单可以证明欠款。" } });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.data.method, "import");
  assert.equal(imported.data.segments.length, 2);

  // 音频转写路径：上传音频后无引擎回退 manual。
  const upload = await request("/api/files?caseId=case-h&name=hearing.mp3", {
    method: "POST", cookie, csrf,
    headers: { "content-type": "audio/mpeg" },
    body: Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00])
  });
  assert.equal(upload.response.status, 201);
  const transcribe = await request("/api/hearing/transcribe", { method: "POST", cookie, csrf, body: { caseId: "case-h", fileId: upload.data.file.id } });
  assert.equal(transcribe.response.status, 200);
  assert.equal(transcribe.data.method, "manual");

  // 庭审小结：未启用 LLM 时走本地启发式。
  const summary = await request("/api/hearing/summary", { method: "POST", cookie, csrf, body: { caseId: "case-h", transcript: "原告代理人：对该证据真实性无异议。\n被告代理人：我方有异议，申请鉴定。" } });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.data.summaryBy, "heuristic");
  assert.ok(summary.data.summary.includes("庭审笔录") || summary.data.summary.includes("发言"));

  // 空笔录小结应被拒绝；缺 CSRF 应被拒绝。
  const emptySummary = await request("/api/hearing/summary", { method: "POST", cookie, csrf, body: { caseId: "case-h", transcript: "  " } });
  assert.equal(emptySummary.response.status, 400);
  const noCsrf = await request("/api/hearing/transcribe", { method: "POST", cookie, body: { caseId: "case-h", text: "x" } });
  assert.equal(noCsrf.response.status, 403);
});
