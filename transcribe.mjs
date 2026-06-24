// 庭审语音转写：本地优先、数据不出本机。
// 参照 ocr.mjs 的「可选加速器 + 零依赖兜底」取向：
//  - 检测到本地引擎(HENGFA_ASR_CMD 自定义命令，或 python + faster-whisper)时离线转写音频；
//  - 没有任何本地引擎时，转写不可用，回退到「手工导入/粘贴庭审笔录」（parseTranscript 结构化）。
// 真正的 ASR 模型不内置（无法零依赖实现中文语音识别），由用户按需在本机安装。
//
// HENGFA_ASR_CMD 支持带参数与 {input} 占位,可适配多种本地引擎(命令须把转写文本/字幕打到 stdout)：
//   whisper.cpp:  HENGFA_ASR_CMD="whisper-cli -m models/ggml-large-v3.bin -l zh -nt -f {input}"
//   faster-whisper(自带 CLI): HENGFA_ASR_CMD="faster-whisper {input} --language zh"
//   vosk/sherpa 等:           HENGFA_ASR_CMD="my-asr --wav {input}"
// stdout 为纯文本或 SRT/VTT 均可(由 parseTranscript 自动识别);未写 {input} 时音频路径追加到末尾。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.dirname(fileURLToPath(import.meta.url)); // 本模块所在目录,用于定位 scripts/transcribe.py。
const PYTHON = process.env.HENGFA_PYTHON_BIN || "python3";          // Python 解释器(可经环境变量覆盖)。
const ASR_CMD = process.env.HENGFA_ASR_CMD || "";                   // 自定义命令行引擎(如 whisper.cpp);非空则优先使用。
const ASR_MODEL = process.env.HENGFA_ASR_MODEL || "small";          // faster-whisper 模型规格。
const AUDIO_FORMATS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".webm"]; // 受理的音频扩展名。

let cachedCaps = null; // 能力探测结果缓存(探测涉及子进程,只做一次)。

// 把 HENGFA_ASR_CMD 命令串解析为 { program, args }(支持双引号包裹含空格的参数);
// 命令含 {input} 则替换为音频路径,否则把音频路径追加到参数末尾。纯函数,便于单测。
export function buildAsrCommand(cmdString, filePath) {
  const tokens = String(cmdString).match(/"[^"]*"|\S+/g) || []; // 简易分词:双引号整体保留,其余按空白切。
  const cleaned = tokens.map(token => token.replace(/^"|"$/g, "")); // 去掉包裹的双引号。
  const program = cleaned[0] || "";
  let args = cleaned.slice(1);
  if (args.some(arg => arg.includes("{input}"))) {
    args = args.map(arg => arg.replaceAll("{input}", filePath)); // 占位替换。
  } else {
    args = [...args, filePath];                                  // 无占位则追加路径。
  }
  return { program, args };
}

// 探测本地语音转写能力（结果缓存）。
export function transcriptionCapabilities() {
  if (cachedCaps) return cachedCaps; // 命中缓存直接返回。
  let engine = "manual";   // 默认:无引擎,只能手工导入笔录。
  let available = false;   // 默认:转写不可用。
  if (process.env.HENGFA_DISABLE_ASR !== "1") { // 允许用环境变量强制禁用(测试/隐私)。
    if (ASR_CMD) {
      engine = "command";  // 配了自定义命令即视为可用。
      available = true;
    } else {
      // 否则探测 Python 是否能 import faster_whisper(status===0 表示成功)。
      const probe = spawnSync(PYTHON, ["-c", "import faster_whisper"], { timeout: 10000, stdio: "ignore" });
      if (probe.status === 0) {
        engine = "python+faster-whisper";
        available = true;
      }
    }
  }
  cachedCaps = {
    engine,                                   // 引擎标识:command / python+faster-whisper / manual。
    available,                                // 是否可离线转写音频。
    localOnly: true,                          // 始终本地处理,音频不出本机。
    model: available ? ASR_MODEL : "",        // 可用时回报所用模型名。
    audioFormats: AUDIO_FORMATS,              // 前端据此过滤可转写的文件。
    note: available ? "本地离线转写可用，音频不出本机" : "未检测到本地语音引擎，可手工导入/粘贴庭审笔录后结构化"
  };
  return cachedCaps;
}

// 秒数 → hh:mm:ss / mm:ss 时间串。
export function toClock(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(Number(totalSeconds))) return ""; // 无效输入返回空串。
  const seconds = Math.max(0, Math.floor(Number(totalSeconds))); // 取整且不为负。
  const pad = value => String(value).padStart(2, "0");           // 个位数补零的小工具。
  const hh = Math.floor(seconds / 3600);          // 小时。
  const mm = Math.floor((seconds % 3600) / 60);   // 分钟。
  const ss = seconds % 60;                         // 秒。
  return hh ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`; // 不足 1 小时省略时位。
}

// 时间串 "hh:mm:ss(.ms)" / "mm:ss" → 秒；解析不出返回 null。
function parseClock(text) {
  // 捕获组:1=可选时, 2=分, 3=秒, 4=可选毫秒(忽略)。
  const m = String(text).match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/);
  if (!m) return null;                  // 不匹配时返回 null。
  const hh = m[1] ? Number(m[1]) : 0;   // 没有时位则按 0 小时。
  return hh * 3600 + Number(m[2]) * 60 + Number(m[3]); // 折算成总秒数。
}

// 行首可选 [时间] + 说话人 + 中/英文冒号 + 内容；说话人名限 12 字以内以减少误判。
// 捕获组:1=时间(可选), 2=说话人, 3=正文。
const SPEAKER_RE = /^(?:[【\[]?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[】\]]?\s*)?([^：:]{1,12})[：:]\s*(.+)$/;

// 零依赖解析庭审笔录文本为分段：支持 SRT / WebVTT / 「[时间] 说话人：内容」 / 纯文本段落。
// 返回数组,每段 { start(秒|null), time(时间串), speaker, text }。
export function parseTranscript(text) {
  const raw = String(text || "").replace(/\r/g, "").trim(); // 归一化换行并去首尾空白。
  if (!raw) return []; // 空文本无分段。

  // 分支一 —— SRT / VTT：存在 "00:00:01,000 --> 00:00:03,000" 形式的时间轴。
  if (/\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(raw)) {
    const segments = [];
    for (const block of raw.split(/\n{2,}/)) {            // 字幕以空行分块。
      const lines = block.split("\n").map(line => line.trim()).filter(Boolean); // 块内非空行。
      const cueIndex = lines.findIndex(line => line.includes("-->")); // 找时间轴行。
      if (cueIndex === -1) continue;                      // 没有时间轴的块跳过。
      const start = parseClock(lines[cueIndex].split("-->")[0]); // 取起始时间。
      const body = lines.slice(cueIndex + 1).join(" ").trim();   // 时间轴之后的文本合并为正文。
      if (!body) continue;                                // 空正文跳过。
      const labeled = body.match(SPEAKER_RE);             // 正文里若还带"说话人："则拆出。
      segments.push(labeled
        ? { start, time: toClock(start), speaker: labeled[2].trim(), text: labeled[3].trim() }
        : { start, time: toClock(start), speaker: "", text: body });
    }
    if (segments.length) return segments;                 // 成功解析为字幕则返回;否则落到逐行分支。
  }

  // 分支二 —— 逐行解析（带说话人/时间标签或纯文本段落）。
  const segments = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^WEBVTT/i.test(trimmed) || /^\d+$/.test(trimmed)) continue; // 跳过空行、VTT 头、纯序号行。
    const labeled = trimmed.match(SPEAKER_RE);            // 尝试匹配"[时间]说话人：内容"。
    if (labeled) {
      const start = labeled[1] ? parseClock(labeled[1]) : null; // 有时间标签则解析为秒。
      segments.push({ start, time: labeled[1] ? toClock(start) : "", speaker: labeled[2].trim(), text: labeled[3].trim() });
    } else {
      segments.push({ start: null, time: "", speaker: "", text: trimmed }); // 纯文本段落:无时间无说话人。
    }
  }
  return segments;
}

// 调用本地引擎转写音频文件；无引擎时返回 manual 状态由调用方提示手工导入。
// 统一返回 { status, method, text, segments, error }。
export function transcribeAudioLocally(filePath) {
  const caps = transcriptionCapabilities();
  if (!caps.available) {
    // 无引擎:不报错,而是用 manual 状态告知调用方走手工导入。
    return { status: "manual", method: "manual", text: "", segments: [], error: "未检测到本地语音引擎" };
  }
  if (ASR_CMD) {
    // 分支一 —— 自定义命令行引擎:解析命令(支持参数与 {input}),约定 stdout 输出文本/字幕。
    const { program, args } = buildAsrCommand(ASR_CMD, filePath);
    const method = `command:${path.basename(program) || "asr"}`; // 方法标识带上引擎程序名。
    const result = spawnSync(program, args, { encoding: "utf8", timeout: 1800000, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) {
      // 进程非 0 退出视为失败,截断 stderr 作为错误信息。
      return { status: "error", method, text: "", segments: [], error: (result.stderr || "转写命令执行失败").slice(0, 300) };
    }
    const text = String(result.stdout || "").trim(); // 标准输出即转写文本(纯文本或 SRT/VTT)。
    if (!text) return { status: "partial", method, text: "", segments: [], error: "未识别到语音内容" }; // 空结果。
    return { status: "processed", method, text, segments: parseTranscript(text), error: "" }; // parseTranscript 自动识别格式并分段。
  }
  // 分支二 —— Python + faster-whisper:调用 scripts/transcribe.py,期望其打印 JSON。
  const result = spawnSync(PYTHON, [path.join(moduleRoot, "scripts", "transcribe.py"), filePath], {
    encoding: "utf8",
    timeout: 1800000,            // 长音频可能耗时,给足超时(30 分钟)。
    maxBuffer: 64 * 1024 * 1024  // 放宽 stdout 缓冲上限。
  });
  let data = {};
  try {
    data = JSON.parse((result.stdout || "{}").trim()); // 解析脚本输出的 JSON。
  } catch (error) {
    data = { error: (result.stderr || "转写程序输出无效").trim() }; // 解析失败时用 stderr 作错误。
  }
  if (result.status !== 0 || data.error) {
    // 进程失败或脚本自报错误。
    return { status: "error", method: "python+faster-whisper", text: "", segments: [], error: data.error || result.stderr || "转写失败" };
  }
  // 优先用脚本给出的分段(含时间戳);否则把整段文本再过 parseTranscript。
  const segments = Array.isArray(data.segments) && data.segments.length
    ? data.segments.map(item => ({ start: item.start ?? null, time: toClock(item.start), speaker: "", text: String(item.text || "").trim() })).filter(item => item.text)
    : parseTranscript(data.text || "");
  const text = String(data.text || segments.map(item => item.text).join("\n")).trim(); // 汇总纯文本。
  if (!text) return { status: "partial", method: "python+faster-whisper", text: "", segments: [], error: "未识别到语音内容" }; // 空结果。
  return { status: "processed", method: "python+faster-whisper", text, segments, error: "" }; // 成功。
}
