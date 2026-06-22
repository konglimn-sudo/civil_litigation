// 零依赖的本地文字抽取兜底（当未安装 Python+PyMuPDF 时使用）：
//  - 图片：调用系统 tesseract（中文识别包 chi_sim/chi_tra + eng）。
//  - 数字版 PDF：纯 JS 提取文本层；扫描件在装有 poppler 的 pdftoppm 时栅格化后 OCR。
//  - DOCX：解析 OOXML 压缩包（zip + inflate word/document.xml），无需第三方库。
//  - txt/md/csv/json：按 UTF-8 / GB18030 解码。
// 返回 { status: 'processed'|'partial'|'error', text, method, error }，与服务端 case_files 状态一致。

import { execFileSync } from "node:child_process";
import { inflateSync, inflateRawSync } from "node:zlib";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TESSERACT_BIN = process.env.TESSERACT_BIN || process.env.HENGFA_TESSERACT || "tesseract";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp"]);

let cachedEnv = null;

export function localExtractionCapabilities() {
  if (cachedEnv) return cachedEnv;
  const env = { tesseract: false, langs: [], hasChinese: false, pdftoppm: false };
  try {
    const out = execFileSync(TESSERACT_BIN, ["--list-langs"], { timeout: 8000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    env.langs = out.split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean);
    env.tesseract = true;
    env.hasChinese = env.langs.some(lang => lang.startsWith("chi"));
  } catch (_) { env.tesseract = false; }
  try {
    execFileSync("pdftoppm", ["-v"], { timeout: 5000, stdio: "ignore" });
    env.pdftoppm = true;
  } catch (_) { env.pdftoppm = false; }
  cachedEnv = env;
  return env;
}

function chooseLangs(langs) {
  const wanted = ["chi_sim", "chi_tra", "eng"].filter(lang => langs.includes(lang));
  return wanted.length ? wanted.join("+") : (langs[0] || "eng");
}

function tesseractFile(filePath, lang) {
  return execFileSync(TESSERACT_BIN, [filePath, "stdout", "-l", lang, "--psm", "3"], {
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
    encoding: "utf8"
  }).replace(/\n{3,}/g, "\n\n").trim();
}

// —— 数字版 PDF 文本层提取 ——
function inflateMaybe(bytes) {
  try { return inflateSync(bytes); } catch (_) { /* try raw */ }
  try { return inflateRawSync(bytes); } catch (_) { /* not deflate */ }
  return null;
}

function extractStreamText(content) {
  const out = [];
  let i = 0;
  const n = content.length;
  while (i < n) {
    const char = content[i];
    if (char === "(") {
      let depth = 1;
      let str = "";
      i += 1;
      while (i < n && depth > 0) {
        const c = content[i];
        if (c === "\\") { str += content[i + 1] || ""; i += 2; continue; }
        if (c === "(") depth += 1;
        else if (c === ")") { depth -= 1; if (depth === 0) { i += 1; break; } }
        str += c;
        i += 1;
      }
      out.push(str);
    } else if (char === "T" && (content[i + 1] === "j" || content[i + 1] === "J" || content[i + 1] === "*")) {
      out.push("\n");
      i += 2;
    } else {
      i += 1;
    }
  }
  return out.join("");
}

function extractPdfText(buffer) {
  const latin1 = buffer.toString("latin1");
  const chunks = [];
  const re = /stream\r?\n?([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(latin1)) !== null) {
    const raw = Buffer.from(match[1], "latin1");
    const inflated = inflateMaybe(raw);
    const content = inflated ? inflated.toString("latin1") : match[1];
    if (/\bBT\b|\bTj\b|\bTJ\b/.test(content)) chunks.push(extractStreamText(content));
  }
  let text = chunks.join("\n");
  if (/ /.test(text)) {
    const utf16 = Buffer.from(text, "latin1").toString("utf16le");
    if ((utf16.match(/[一-鿿]/g) || []).length > (text.match(/[一-鿿]/g) || []).length) text = utf16;
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function textQuality(text) {
  if (!text) return 0;
  const readable = (text.match(/[一-鿿0-9a-zA-Z，。；、：（）]/g) || []).length;
  return readable / text.length;
}

function rasterizeAndOcr(filePath, lang) {
  const dir = mkdtempSync(path.join(tmpdir(), "hengfa-ocr-"));
  try {
    execFileSync("pdftoppm", ["-r", "200", "-png", filePath, path.join(dir, "page")], { timeout: 180000, stdio: "ignore" });
    const pages = readdirSync(dir).filter(name => name.endsWith(".png")).sort();
    const parts = [];
    for (const page of pages.slice(0, 30)) parts.push(tesseractFile(path.join(dir, page), lang));
    return parts.join("\n\n").trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// —— DOCX：解析 zip 取 word/document.xml ——
function readZipEntry(buffer, wantName) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);
  let p = cdOffset;
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(p + 10);
    const compSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wantName) {
      const lhNameLen = buffer.readUInt16LE(localOffset + 26);
      const lhExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compSize);
      if (method === 0) return data;
      if (method === 8) { try { return inflateRawSync(data); } catch (_) { return null; } }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function extractDocx(filePath) {
  const xml = readZipEntry(readFileSync(filePath), "word/document.xml");
  if (!xml) return "";
  let s = xml.toString("utf8");
  s = s.replace(/<w:tab\b[^>]*\/?>/g, "\t").replace(/<w:br\b[^>]*\/?>/g, "\n").replace(/<\/w:p>/g, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function decodeText(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("gb18030").decode(buffer); } catch (_) { return utf8; }
}

// 主入口：返回服务端可直接落库的结果。
export function extractTextLocally(filePath, mime = "") {
  const ext = path.extname(filePath).toLowerCase();
  const env = localExtractionCapabilities();
  const lang = chooseLangs(env.langs);
  try {
    if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
      if (!env.tesseract) return { status: "error", text: "", method: "image", error: "未检测到 tesseract，无法识别图片。" };
      const text = tesseractFile(filePath, lang);
      if (!text) return { status: "partial", text: "", method: "image-ocr", error: "未识别到文字" };
      return { status: env.hasChinese ? "processed" : "partial", text, method: "image-ocr", error: env.hasChinese ? "" : "未安装中文识别包（chi_sim），中文识别可能不准确" };
    }
    if (ext === ".pdf" || mime === "application/pdf") {
      const text = extractPdfText(readFileSync(filePath));
      if (text && textQuality(text) >= 0.6 && text.length >= 24) return { status: "processed", text, method: "pdf-text", error: "" };
      if (env.pdftoppm && env.tesseract) {
        const ocrText = rasterizeAndOcr(filePath, lang);
        if (ocrText) return { status: "processed", text: ocrText, method: "pdf-ocr", error: "" };
        return { status: "partial", text: "", method: "pdf-ocr", error: "未识别到文字" };
      }
      return { status: "partial", text, method: "pdf-text", error: "该 PDF 可能为扫描件且未提取到有效文本层。请改用图片（PNG/JPG）上传，或安装 poppler（brew install poppler）以支持扫描 PDF 的 OCR。" };
    }
    if (ext === ".docx") {
      const text = extractDocx(filePath);
      if (!text) return { status: "partial", text: "", method: "docx-text", error: "未解析到 DOCX 文本，文件可能损坏或为旧版 .doc 格式" };
      return { status: "processed", text, method: "docx-text", error: "" };
    }
    if ([".txt", ".md", ".csv", ".json"].includes(ext) || mime.startsWith("text/")) {
      return { status: "processed", text: decodeText(readFileSync(filePath)).trim(), method: "plain-text", error: "" };
    }
    return { status: "error", text: "", method: "", error: `暂不支持的文件类型：${ext || mime || "未知"}` };
  } catch (error) {
    return { status: "error", text: "", method: ext.replace(".", "") || "unknown", error: String(error.message || error).slice(0, 300) };
  }
}
