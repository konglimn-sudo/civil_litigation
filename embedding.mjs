// 衡法 AI 办案台 · 本地语义向量引擎（知识与数据层「支撑语义检索的向量数据库」）。
// 取向与全局一致：零依赖优先、本地优先、模型可选。
//   · 默认（零依赖）：法律领域同义/概念词组 + 加权词袋哈希 → 定长归一化向量，
//     让「拖欠货款」「欠款未付」等不同表述落到同一语义维度，弥补纯字面（FTS/BM25）的同义词缺口；
//     在本机用余弦相似度做稠密召回，与 FTS5 混合（hybrid）后排序。
//   · 可选（稠密模型）：探测到 Python + sentence-transformers（或自定义 HENGFA_EMBED_CMD）时，
//     改用真正的稠密语义向量；任何异常自动回退到本地实现。数据全程不出本机。
//
// 每条向量都带「引擎签名」(model)。引擎切换后旧向量签名失配，启动时的 backfill 会自动重建，
// 保证同一语料库内向量维度/口径一致、可比。
import { spawnSync } from "node:child_process";
import { LEGAL_CONCEPT_GROUPS } from "./legal-domain.mjs"; // 法律概念词组(领域适配层,单一事实来源)。

const LOCAL_DIM = 256;                 // 本地哈希向量维度。
const LOCAL_MODEL = "local-concept-v1"; // 本地引擎签名（口径变更时改版本号即触发重建）。

// FNV-1a 32 位哈希（确定性、零依赖）：把词项稳定映射到向量桶位与符号。
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// 检索分词（与法源 FTS 同口径）：英数字≥2 连续串 + 中文相邻双字 bigram。
function tokenize(text) {
  const normalized = String(text || "").normalize("NFKC").toLowerCase();
  const tokens = [];
  for (const match of normalized.match(/[a-z0-9]{2,}/g) || []) tokens.push(match);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let index = 0; index < chinese.length - 1; index += 1) tokens.push(`${chinese[index]}${chinese[index + 1]}`);
  if (chinese.length === 1) tokens.push(chinese[0]);
  return tokens;
}

// 命中的法律概念组下标（任一组员为子串即命中）。
function matchedConcepts(text) {
  const normalized = String(text || "").toLowerCase();
  const hits = [];
  for (let index = 0; index < LEGAL_CONCEPT_GROUPS.length; index += 1) {
    if (LEGAL_CONCEPT_GROUPS[index].some(term => normalized.includes(term))) hits.push(index);
  }
  return hits;
}

// 本地嵌入：词袋（sublinear TF）+ 概念维度（高权重）→ 哈希到定长向量 → L2 归一化。
function embedLocal(text) {
  const vector = new Float32Array(LOCAL_DIM);
  const counts = new Map();
  for (const token of tokenize(text)) counts.set(token, (counts.get(token) || 0) + 1);
  const add = (term, weight) => {
    const hash = fnv1a(term);
    const bucket = hash % LOCAL_DIM;
    const sign = (hash & 0x100) ? 1 : -1;   // 符号哈希：降低桶位碰撞的方向性偏差。
    vector[bucket] += sign * weight;
  };
  for (const [token, count] of counts) add(token, 1 + Math.log(count)); // sublinear TF。
  for (const concept of matchedConcepts(text)) add(`__concept_${concept}`, 2.6); // 概念维度更重。
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
  return vector;
}

// 余弦相似度（两者均已 L2 归一化时即点积）。维度不一致返回 0。
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index];
  return dot;
}

// Float32Array ↔ SQLite BLOB（小端 4 字节浮点）。
export function vectorToBlob(vector) {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}
export function blobToVector(blob) {
  if (!blob || !blob.length) return null;
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
}

// —— 可选稠密模型加速器（探测一次，固定整库口径）——
const disableDense = process.env.HENGFA_DISABLE_EMBED === "1";
const pythonBin = process.env.HENGFA_PYTHON_BIN || "python3";
const embedCmd = (process.env.HENGFA_EMBED_CMD || "").trim();        // 自定义命令行引擎（stdin 收 JSON 文本数组、stdout 出向量数组）。
const embedModelName = process.env.HENGFA_EMBED_MODEL || "shibing624/text2vec-base-chinese";

let denseEngine = null;            // null=未探测；{ kind, model, dim } 或 false（不可用）。

// 探测 Python sentence-transformers 是否可用（不实际加载模型，仅查 import）。
function pythonEmbedAvailable() {
  try {
    const probe = spawnSync(pythonBin, ["-c", "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('sentence_transformers') else 3)"], { timeout: 8000 });
    return probe.status === 0;
  } catch { return false; }
}

// 决定当前生效的嵌入引擎（首次调用时探测并缓存）。
function resolveEngine() {
  if (denseEngine !== null) return denseEngine;
  if (disableDense) return (denseEngine = false);
  if (embedCmd) { denseEngine = { kind: "cmd", model: `cmd:${embedCmd.split(/\s+/)[0]}`, dim: 0 }; return denseEngine; }
  if (pythonEmbedAvailable()) { denseEngine = { kind: "python", model: `py:${embedModelName}`, dim: 0 }; return denseEngine; }
  return (denseEngine = false);
}

// 调用外部引擎对一批文本编码；返回 number[][] 或 null（失败）。
function denseEmbedBatch(texts) {
  const engine = resolveEngine();
  if (!engine) return null;
  const input = JSON.stringify(texts);
  let result;
  try {
    if (engine.kind === "python") {
      result = spawnSync(pythonBin, [new URL("./scripts/embed.py", import.meta.url).pathname, "--model", embedModelName], { input, encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    } else {
      const parts = embedCmd.split(/\s+/);
      result = spawnSync(parts[0], parts.slice(1), { input, encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    }
  } catch { return null; }
  if (!result || result.status !== 0 || !result.stdout) return null;
  try {
    const vectors = JSON.parse(result.stdout.trim());
    if (!Array.isArray(vectors) || vectors.length !== texts.length) return null;
    return vectors;
  } catch { return null; }
}

// 当前嵌入引擎签名与维度（用于向量入库标记、失配重建与能力探测）。
export function embedderInfo() {
  const engine = resolveEngine();
  if (!engine) return { engine: "local", model: LOCAL_MODEL, dim: LOCAL_DIM, dense: false, localOnly: true };
  return { engine: engine.kind === "python" ? "python-dense" : "cmd-dense", model: engine.model, dim: engine.dim || null, dense: true, localOnly: true };
}

// 批量编码：优先稠密引擎，失败逐条回退本地。返回 [{ vector:Float32Array, model, dim }]。
export function embedBatch(texts) {
  const list = texts.map(text => String(text || ""));
  const engine = resolveEngine();
  if (engine) {
    const dense = denseEmbedBatch(list);
    if (dense) {
      return dense.map(row => {
        const vector = Float32Array.from(row);
        let norm = 0;
        for (const value of vector) norm += value * value;
        norm = Math.sqrt(norm);
        if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
        return { vector, model: engine.model, dim: vector.length };
      });
    }
    // 稠密引擎本次失败：记一次并回退本地（不抛错，保证检索不中断）。
    console.error("[embedding] 稠密引擎不可用，本批回退本地向量");
  }
  return list.map(text => ({ vector: embedLocal(text), model: LOCAL_MODEL, dim: LOCAL_DIM }));
}

// 单条编码（查询用）。
export function embedOne(text) {
  return embedBatch([text])[0];
}
