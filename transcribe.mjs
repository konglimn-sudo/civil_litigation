// 庭审语音转写：本地优先、数据不出本机。
// 参照 ocr.mjs 的「可选加速器 + 零依赖兜底」取向：
//  - 检测到本地引擎(HENGFA_ASR_CMD 自定义命令，或 python + faster-whisper)时离线转写音频；
//  - 没有任何本地引擎时，转写不可用，回退到「手工导入/粘贴庭审笔录」（parseTranscript 结构化）。
// 真正的 ASR 模型不内置（无法零依赖实现中文语音识别），由用户按需在本机安装。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.HENGFA_PYTHON_BIN || "python3";
const ASR_CMD = process.env.HENGFA_ASR_CMD || "";
const ASR_MODEL = process.env.HENGFA_ASR_MODEL || "small";
const AUDIO_FORMATS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".webm"];

let cachedCaps = null;

// 探测本地语音转写能力（结果缓存）。
export function transcriptionCapabilities() {
  if (cachedCaps) return cachedCaps;
  let engine = "manual";
  let available = false;
  if (process.env.HENGFA_DISABLE_ASR !== "1") {
    if (ASR_CMD) {
      engine = "command";
      available = true;
    } else {
      const probe = spawnSync(PYTHON, ["-c", "import faster_whisper"], { timeout: 10000, stdio: "ignore" });
      if (probe.status === 0) {
        engine = "python+faster-whisper";
        available = true;
      }
    }
  }
  cachedCaps = {
    engine,
    available,
    localOnly: true,
    model: available ? ASR_MODEL : "",
    audioFormats: AUDIO_FORMATS,
    note: available ? "本地离线转写可用，音频不出本机" : "未检测到本地语音引擎，可手工导入/粘贴庭审笔录后结构化"
  };
  return cachedCaps;
}

// 秒数 → hh:mm:ss / mm:ss 时间串。
export function toClock(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(Number(totalSeconds))) return "";
  const seconds = Math.max(0, Math.floor(Number(totalSeconds)));
  const pad = value => String(value).padStart(2, "0");
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  return hh ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

// 时间串 "hh:mm:ss(.ms)" / "mm:ss" → 秒；解析不出返回 null。
function parseClock(text) {
  const m = String(text).match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/);
  if (!m) return null;
  const hh = m[1] ? Number(m[1]) : 0;
  return hh * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// 行首可选 [时间] + 说话人 + 中/英文冒号 + 内容；说话人名限 12 字以内以减少误判。
const SPEAKER_RE = /^(?:[【\[]?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[】\]]?\s*)?([^：:]{1,12})[：:]\s*(.+)$/;

// 零依赖解析庭审笔录文本为分段：支持 SRT / WebVTT / 「[时间] 说话人：内容」 / 纯文本段落。
export function parseTranscript(text) {
  const raw = String(text || "").replace(/\r/g, "").trim();
  if (!raw) return [];

  // SRT / VTT：存在 "00:00:01,000 --> 00:00:03,000" 形式的时间轴。
  if (/\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(raw)) {
    const segments = [];
    for (const block of raw.split(/\n{2,}/)) {
      const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
      const cueIndex = lines.findIndex(line => line.includes("-->"));
      if (cueIndex === -1) continue;
      const start = parseClock(lines[cueIndex].split("-->")[0]);
      const body = lines.slice(cueIndex + 1).join(" ").trim();
      if (!body) continue;
      const labeled = body.match(SPEAKER_RE);
      segments.push(labeled
        ? { start, time: toClock(start), speaker: labeled[2].trim(), text: labeled[3].trim() }
        : { start, time: toClock(start), speaker: "", text: body });
    }
    if (segments.length) return segments;
  }

  // 逐行解析（带说话人/时间标签或纯文本段落）。
  const segments = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^WEBVTT/i.test(trimmed) || /^\d+$/.test(trimmed)) continue;
    const labeled = trimmed.match(SPEAKER_RE);
    if (labeled) {
      const start = labeled[1] ? parseClock(labeled[1]) : null;
      segments.push({ start, time: labeled[1] ? toClock(start) : "", speaker: labeled[2].trim(), text: labeled[3].trim() });
    } else {
      segments.push({ start: null, time: "", speaker: "", text: trimmed });
    }
  }
  return segments;
}

// 调用本地引擎转写音频文件；无引擎时返回 manual 状态由调用方提示手工导入。
export function transcribeAudioLocally(filePath) {
  const caps = transcriptionCapabilities();
  if (!caps.available) {
    return { status: "manual", method: "manual", text: "", segments: [], error: "未检测到本地语音引擎" };
  }
  if (ASR_CMD) {
    const result = spawnSync(ASR_CMD, [filePath], { encoding: "utf8", timeout: 1800000, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) {
      return { status: "error", method: "command", text: "", segments: [], error: (result.stderr || "转写命令执行失败").slice(0, 300) };
    }
    const text = String(result.stdout || "").trim();
    if (!text) return { status: "partial", method: "command", text: "", segments: [], error: "未识别到语音内容" };
    return { status: "processed", method: "command", text, segments: parseTranscript(text), error: "" };
  }
  const result = spawnSync(PYTHON, [path.join(moduleRoot, "scripts", "transcribe.py"), filePath], {
    encoding: "utf8",
    timeout: 1800000,
    maxBuffer: 64 * 1024 * 1024
  });
  let data = {};
  try {
    data = JSON.parse((result.stdout || "{}").trim());
  } catch (error) {
    data = { error: (result.stderr || "转写程序输出无效").trim() };
  }
  if (result.status !== 0 || data.error) {
    return { status: "error", method: "python+faster-whisper", text: "", segments: [], error: data.error || result.stderr || "转写失败" };
  }
  const segments = Array.isArray(data.segments) && data.segments.length
    ? data.segments.map(item => ({ start: item.start ?? null, time: toClock(item.start), speaker: "", text: String(item.text || "").trim() })).filter(item => item.text)
    : parseTranscript(data.text || "");
  const text = String(data.text || segments.map(item => item.text).join("\n")).trim();
  if (!text) return { status: "partial", method: "python+faster-whisper", text: "", segments: [], error: "未识别到语音内容" };
  return { status: "processed", method: "python+faster-whisper", text, segments, error: "" };
}
