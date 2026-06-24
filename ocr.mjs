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

const TESSERACT_BIN = process.env.TESSERACT_BIN || process.env.HENGFA_TESSERACT || "tesseract"; // tesseract 可执行文件(可经环境变量覆盖)。
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp"]); // 走 OCR 的图片扩展名。

let cachedEnv = null; // 能力探测缓存(涉及子进程,仅探测一次)。

// 探测本机文字抽取能力:tesseract 是否存在、装了哪些语言包、是否有 pdftoppm(供扫描件栅格化)。
export function localExtractionCapabilities() {
  if (cachedEnv) return cachedEnv; // 命中缓存直接返回。
  const env = { tesseract: false, langs: [], hasChinese: false, pdftoppm: false }; // 默认全不可用。
  try {
    // 用 `tesseract --list-langs` 列出已安装语言包。
    const out = execFileSync(TESSERACT_BIN, ["--list-langs"], { timeout: 8000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    env.langs = out.split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean); // 首行是标题,跳过后取语言列表。
    env.tesseract = true;                                       // 命令成功即说明已安装。
    env.hasChinese = env.langs.some(lang => lang.startsWith("chi")); // 是否含中文包(chi_sim/chi_tra)。
  } catch (_) { env.tesseract = false; }                        // 命令失败=未安装。
  try {
    execFileSync("pdftoppm", ["-v"], { timeout: 5000, stdio: "ignore" }); // 探测 poppler 的 pdftoppm。
    env.pdftoppm = true;                                        // 存在则可把扫描 PDF 栅格化为图片再 OCR。
  } catch (_) { env.pdftoppm = false; }
  cachedEnv = env;
  return env;
}

// 从已装语言包里挑出本项目偏好的组合(简中+繁中+英文),都没有则退而求其次。
function chooseLangs(langs) {
  const wanted = ["chi_sim", "chi_tra", "eng"].filter(lang => langs.includes(lang)); // 命中的偏好语言。
  return wanted.length ? wanted.join("+") : (langs[0] || "eng"); // tesseract 用 "+" 连接多语言;兜底英文。
}

// 对单个图片/页面文件跑 tesseract,返回清理后的纯文本。
function tesseractFile(filePath, lang) {
  return execFileSync(TESSERACT_BIN, [filePath, "stdout", "-l", lang, "--psm", "3"], { // --psm 3=自动分页版面分析。
    timeout: 180000,                  // 单文件最多 3 分钟。
    maxBuffer: 32 * 1024 * 1024,      // 放宽 stdout 缓冲。
    encoding: "utf8"
  }).replace(/\n{3,}/g, "\n\n").trim(); // 压缩多余空行并去首尾空白。
}

// —— 数字版 PDF 文本层提取 ——
// 尝试解压一段字节:先按 zlib(含头),再按 raw deflate(无头);都失败返回 null。
function inflateMaybe(bytes) {
  try { return inflateSync(bytes); } catch (_) { /* 不是 zlib,尝试 raw */ }
  try { return inflateRawSync(bytes); } catch (_) { /* 也不是 deflate */ }
  return null; // 视为未压缩(原样使用)。
}

// 极简 PDF 内容流文本解析:扫描 ( ) 字符串字面量与 Tj/TJ/T* 文本操作符。
function extractStreamText(content) {
  const out = [];          // 收集到的文本片段。
  let i = 0;               // 游标。
  const n = content.length;
  while (i < n) {
    const char = content[i];
    if (char === "(") {            // PDF 字符串以 ( 开始、) 结束,可嵌套。
      let depth = 1;               // 括号深度。
      let str = "";                // 当前字符串内容。
      i += 1;                      // 跳过开括号。
      while (i < n && depth > 0) {
        const c = content[i];
        if (c === "\\") { str += content[i + 1] || ""; i += 2; continue; } // 转义符:取下一字符字面值。
        if (c === "(") depth += 1;                                          // 进入嵌套括号。
        else if (c === ")") { depth -= 1; if (depth === 0) { i += 1; break; } } // 配平到 0 则结束。
        str += c;
        i += 1;
      }
      out.push(str);              // 收下该字符串。
    } else if (char === "T" && (content[i + 1] === "j" || content[i + 1] === "J" || content[i + 1] === "*")) {
      out.push("\n");             // Tj/TJ/T* 视为换行(文本定位/显示操作符)。
      i += 2;
    } else {
      i += 1;                     // 其他字节跳过。
    }
  }
  return out.join("");
}

// 从 PDF 缓冲区提取文本层:遍历每个 stream...endstream,解压后抽取文本操作符内容。
function extractPdfText(buffer) {
  const latin1 = buffer.toString("latin1"); // 以 latin1 读取,保证字节一一对应不丢失。
  const chunks = [];
  const re = /stream\r?\n?([\s\S]*?)\r?\nendstream/g; // 匹配每个内容流体。
  let match;
  while ((match = re.exec(latin1)) !== null) {
    const raw = Buffer.from(match[1], "latin1");       // 流体原始字节。
    const inflated = inflateMaybe(raw);                // 多数流被 FlateDecode 压缩,尝试解压。
    const content = inflated ? inflated.toString("latin1") : match[1]; // 解压成功用解压结果,否则原文。
    if (/\bBT\b|\bTj\b|\bTJ\b/.test(content)) chunks.push(extractStreamText(content)); // 含文本操作符才解析。
  }
  let text = chunks.join("\n");
  if (/ /.test(text)) { // 出现疑似 UTF-16 字节(高位 0x00)时,尝试按 utf16le 重新解码。
    const utf16 = Buffer.from(text, "latin1").toString("utf16le");
    // 哪种解码得到的中文字符更多就用哪种。
    if ((utf16.match(/[一-鿿]/g) || []).length > (text.match(/[一-鿿]/g) || []).length) text = utf16;
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); // 规整空白。
}

// 文本"可读性"评分:可读字符(中英文数字与常见标点)占比,用于判断文本层是否有效。
function textQuality(text) {
  if (!text) return 0;
  const readable = (text.match(/[一-鿿0-9a-zA-Z，。；、：（）]/g) || []).length;
  return readable / text.length; // 越接近 1 越可信。
}

// 扫描件 PDF:用 pdftoppm 栅格化为 PNG,逐页 OCR 后拼接(临时目录用完即删)。
function rasterizeAndOcr(filePath, lang) {
  const dir = mkdtempSync(path.join(tmpdir(), "hengfa-ocr-")); // 建临时工作目录。
  try {
    execFileSync("pdftoppm", ["-r", "200", "-png", filePath, path.join(dir, "page")], { timeout: 180000, stdio: "ignore" }); // 200dpi 转 PNG。
    const pages = readdirSync(dir).filter(name => name.endsWith(".png")).sort(); // 收集生成的页面图。
    const parts = [];
    for (const page of pages.slice(0, 30)) parts.push(tesseractFile(path.join(dir, page), lang)); // 最多 OCR 前 30 页。
    return parts.join("\n\n").trim();
  } finally {
    rmSync(dir, { recursive: true, force: true }); // 无论成败都清理临时目录。
  }
}

// —— DOCX：解析 zip 取 word/document.xml ——
// 不依赖第三方库,直接按 ZIP 格式从中央目录定位并读取指定条目。
function readZipEntry(buffer, wantName) {
  const EOCD = 0x06054b50; // End Of Central Directory 记录的签名。
  let eocd = -1;
  // 从尾部向前找 EOCD(它在文件末尾,前 22 字节为固定头)。
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return null;                       // 不是有效 zip。
  const cdOffset = buffer.readUInt32LE(eocd + 16); // 中央目录起始偏移。
  const count = buffer.readUInt16LE(eocd + 10);    // 条目数量。
  let p = cdOffset;
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) break; // 中央目录条目签名,不符即停止。
    const method = buffer.readUInt16LE(p + 10);    // 压缩方式:0=存储,8=deflate。
    const compSize = buffer.readUInt32LE(p + 20);  // 压缩后大小。
    const nameLen = buffer.readUInt16LE(p + 28);   // 文件名长度。
    const extraLen = buffer.readUInt16LE(p + 30);  // 扩展字段长度。
    const commentLen = buffer.readUInt16LE(p + 32);// 注释长度。
    const localOffset = buffer.readUInt32LE(p + 42); // 对应本地文件头偏移。
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLen); // 条目名。
    if (name === wantName) {                        // 命中目标(word/document.xml)。
      const lhNameLen = buffer.readUInt16LE(localOffset + 26);  // 本地头里的名字长度。
      const lhExtraLen = buffer.readUInt16LE(localOffset + 28); // 本地头里的扩展长度。
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen; // 真正数据起点。
      const data = buffer.subarray(dataStart, dataStart + compSize); // 压缩数据切片。
      if (method === 0) return data;                              // 存储:直接返回。
      if (method === 8) { try { return inflateRawSync(data); } catch (_) { return null; } } // deflate:解压。
      return null;                                                // 其他压缩方式不支持。
    }
    p += 46 + nameLen + extraLen + commentLen;     // 跳到下一条中央目录记录。
  }
  return null; // 未找到目标条目。
}

// 提取 DOCX 正文:取 word/document.xml,把段落/制表/换行标签转成文本,再去标签与解码实体。
function extractDocx(filePath) {
  const xml = readZipEntry(readFileSync(filePath), "word/document.xml"); // 取主文档 XML。
  if (!xml) return "";                                                    // 解析失败/旧 .doc 格式。
  let s = xml.toString("utf8");
  // 先把有语义的标签转为对应空白:制表符、换行、段落结束。
  s = s.replace(/<w:tab\b[^>]*\/?>/g, "\t").replace(/<w:br\b[^>]*\/?>/g, "\n").replace(/<\/w:p>/g, "\n");
  s = s.replace(/<[^>]+>/g, ""); // 去掉其余所有 XML 标签。
  // 解码常见 XML 实体(注意 &amp; 放最后,避免二次解码)。
  s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&");
  return s.replace(/\n{3,}/g, "\n\n").trim(); // 规整空行。
}

// 纯文本解码:优先 UTF-8,出现替换符(�)说明可能是 GB18030,改用之。
function decodeText(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return utf8;                                   // UTF-8 正常。
  try { return new TextDecoder("gb18030").decode(buffer); } catch (_) { return utf8; } // 回退 GB18030。
}

// 主入口：返回服务端可直接落库的结果 { status, text, method, error }。
export function extractTextLocally(filePath, mime = "") {
  const ext = path.extname(filePath).toLowerCase(); // 文件扩展名(小写)。
  const env = localExtractionCapabilities();        // 当前本机能力。
  const lang = chooseLangs(env.langs);              // OCR 使用的语言组合。
  try {
    // —— 图片:走 tesseract OCR ——
    if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
      if (!env.tesseract) return { status: "error", text: "", method: "image", error: "未检测到 tesseract，无法识别图片。" }; // 无 OCR 引擎。
      const text = tesseractFile(filePath, lang);
      if (!text) return { status: "partial", text: "", method: "image-ocr", error: "未识别到文字" }; // 空结果。
      // 有中文包=processed;否则降级 partial 并提示中文可能不准。
      return { status: env.hasChinese ? "processed" : "partial", text, method: "image-ocr", error: env.hasChinese ? "" : "未安装中文识别包（chi_sim），中文识别可能不准确" };
    }
    // —— PDF:先试文本层,质量不足再栅格化 OCR ——
    if (ext === ".pdf" || mime === "application/pdf") {
      const text = extractPdfText(readFileSync(filePath));
      // 文本层够长且可读性达标(≥0.6)即认为是数字版 PDF。
      if (text && textQuality(text) >= 0.6 && text.length >= 24) return { status: "processed", text, method: "pdf-text", error: "" };
      if (env.pdftoppm && env.tesseract) { // 否则若具备栅格化+OCR 能力,按扫描件处理。
        const ocrText = rasterizeAndOcr(filePath, lang);
        if (ocrText) return { status: "processed", text: ocrText, method: "pdf-ocr", error: "" };
        return { status: "partial", text: "", method: "pdf-ocr", error: "未识别到文字" };
      }
      // 既非数字版又无 OCR 条件:返回部分结果并提示如何启用扫描件 OCR。
      return { status: "partial", text, method: "pdf-text", error: "该 PDF 可能为扫描件且未提取到有效文本层。请改用图片（PNG/JPG）上传，或安装 poppler（brew install poppler）以支持扫描 PDF 的 OCR。" };
    }
    // —— DOCX:零依赖解析 OOXML ——
    if (ext === ".docx") {
      const text = extractDocx(filePath);
      if (!text) return { status: "partial", text: "", method: "docx-text", error: "未解析到 DOCX 文本，文件可能损坏或为旧版 .doc 格式" };
      return { status: "processed", text, method: "docx-text", error: "" };
    }
    // —— 纯文本类:UTF-8/GB18030 解码 ——
    if ([".txt", ".md", ".csv", ".json"].includes(ext) || mime.startsWith("text/")) {
      return { status: "processed", text: decodeText(readFileSync(filePath)).trim(), method: "plain-text", error: "" };
    }
    return { status: "error", text: "", method: "", error: `暂不支持的文件类型：${ext || mime || "未知"}` }; // 其他类型不支持。
  } catch (error) {
    // 任何异常(读文件失败、子进程报错等)统一收敛为 error 状态,错误信息截断。
    return { status: "error", text: "", method: ext.replace(".", "") || "unknown", error: String(error.message || error).slice(0, 300) };
  }
}
