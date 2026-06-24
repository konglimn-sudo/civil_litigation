import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { extractTextLocally } from "../ocr.mjs";

const dataDir = mkdtempSync(path.join(tmpdir(), "hengfa-rag-"));
process.env.HENGFA_DATA_DIR = dataDir;
process.env.HENGFA_ADMIN_PASSWORD = "Rag-Test-2026";
process.env.HENGFA_NO_LISTEN = "1";

const backend = await import(`../server.mjs?rag=${Date.now()}`);

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

test("seeded legal corpus powers FTS5 retrieval and grounded answers", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@hengfa.local", password: "Rag-Test-2026" } });
  const cookie = String(login.response.headers["Set-Cookie"] || "").split(";", 1)[0];
  const csrf = login.data.csrfToken;

  // 检索命中条文级语料，相关条文应排在前列。
  const search = await request("/api/legal/search", { method: "POST", cookie, csrf, body: { query: "违约 损失赔偿 可得利益" } });
  assert.equal(search.response.status, 200);
  assert.match(search.data.retrieval, /^hybrid-fts5\+vector\(/, "检索应为 FTS5 + 语义向量混合");
  assert.ok(search.data.results.length > 0, "应检索到法源片段");
  assert.ok(search.data.results.slice(0, 3).some(item => item.title.includes("违约损害赔偿")), "违约损害赔偿范围应在混合检索前列");

  // 问答返回带可核验引用。
  const answer = await request("/api/legal/answer", { method: "POST", cookie, csrf, body: { query: "诉讼时效期间多久" } });
  assert.equal(answer.response.status, 200);
  assert.ok(answer.data.citations.length > 0, "问答应附引用");
  assert.ok(answer.data.citations.some(item => item.title.includes("诉讼时效")), "引用应包含诉讼时效条文");

  // 空查询应被拒绝。
  const empty = await request("/api/legal/search", { method: "POST", cookie, csrf, body: { query: "  " } });
  assert.equal(empty.response.status, 400);
});

// 零依赖本地抽取（不依赖 Python）。
test("local zero-dependency extraction handles txt and docx", () => {
  const txtPath = path.join(dataDir, "note.txt");
  writeFileSync(txtPath, "本案争议焦点为合同违约与损失赔偿范围。", "utf8");
  const txt = extractTextLocally(txtPath, "text/plain");
  assert.equal(txt.status, "processed");
  assert.ok(txt.text.includes("合同违约"));

  // 用 STORE 方式手工拼一个最小 DOCX，验证零依赖 zip 解析与文本提取。
  const docPath = path.join(dataDir, "brief.docx");
  writeFileSync(docPath, buildStoreDocx("民事起诉状\n原告：张三\n诉讼请求：支付货款。"));
  const docx = extractTextLocally(docPath, "");
  assert.equal(docx.status, "processed");
  assert.equal(docx.method, "docx-text");
  assert.ok(docx.text.includes("民事起诉状") && docx.text.includes("张三"));
});

function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function buildStoreDocx(text) {
  const enc = new TextEncoder();
  const u16 = n => Buffer.from([n & 255, (n >>> 8) & 255]);
  const u32 = n => Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const paragraphs = text.split("\n").map(line => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`).join("");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`]
  ];
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = enc.encode(name);
    const data = enc.encode(content);
    const crc = crc32(data);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBuf.length), u16(0), Buffer.from(nameBuf), Buffer.from(data)]);
    locals.push(local);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), Buffer.from(nameBuf)]));
    offset += local.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBuf.length), u32(centralStart), u16(0)]);
  return Buffer.concat([...locals, centralBuf, end]);
}
