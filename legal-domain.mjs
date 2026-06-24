// 衡法 AI 办案台 · 法律领域适配层（知识与提示）。
// 对应设计文档「AI 能力中台：大语言模型（基座模型 + 法律领域微调）」中可在本地、零依赖落地的部分：
//   · DOMAIN_SYSTEM —— 领域系统提示：统一约束所有生成式调用的「中国民事诉讼语境、依据强制、
//     术语规范、效力时效优先、不臆造条号」，相当于把领域知识固化进每次推理的前置指令；
//   · LEGAL_GLOSSARY —— 法律术语词典：俗称/近义 → 规范术语 + 要点，既按需注入提示（纠正口语化表述、
//     统一术语），也用于本地启发式归一；
//   · LEGAL_CONCEPT_GROUPS —— 法律概念词组：同义异形归并，驱动本地语义向量检索（embedding.mjs 复用）。
//
// 说明：真正的「权重级微调」需离线训练与私有模型托管，超出零依赖本地应用的范围；本模块以
//   提示工程 + 术语/概念词典实现可落地、可核查的领域适配，并通过 HENGFA_LLM_MODEL 预留接入
//   「已微调法律模型」的入口、HENGFA_DOMAIN_PROFILE 预留自定义领域画像（JSON）覆盖默认知识。
import { existsSync, readFileSync } from "node:fs";

// 领域系统提示（所有 Claude 生成式调用统一前置）。
const DEFAULT_DOMAIN_SYSTEM = [
  "你是服务于中国民事诉讼实务的法律 AI 助理，工作语境为中国大陆现行法（民法典、民事诉讼法及相关司法解释）。",
  "始终遵循：",
  "1. 依据强制——只能依据本次提供的【检索片段/案件材料/庭审发言】作答，不得引用未提供的法条、案例或数字，不得臆造条号；信息不足须明确说明并建议核验正式法源。",
  "2. 术语规范——使用规范法律术语（如「拖欠货款」而非「赖账」、「诉讼时效」而非「过期」），口语化表述应在回答中对应到规范术语。",
  "3. 效力与时效优先——涉及法条时关注效力层级与时效状态，提示已废止/失效内容不得作为依据。",
  "4. 审慎结论——预测性内容（裁判倾向、风险）一律标注为参考，不输出胜败概率或确定性意见。",
  "5. 可核验——结论附依据出处，结尾提示由办案人员回到正式法源/裁判文书核验。"
].join("\n");

// 法律术语词典：把口语/近义表述归一到规范术语，并附实务要点。
const DEFAULT_GLOSSARY = [
  { aliases: ["欠钱", "欠账", "赖账", "拖欠款", "不给钱", "货款未付"], canonical: "拖欠货款 / 欠款（债务未清偿）", note: "主张时区分本金、利息与违约金，并核对对账与催告证据。" },
  { aliases: ["打官司", "告他", "起诉"], canonical: "提起民事诉讼", note: "注意诉讼时效、管辖与诉讼请求的明确性。" },
  { aliases: ["毁约", "违反合同", "没按合同来"], canonical: "违约", note: "区分根本违约与一般违约，对应继续履行、赔偿损失或解除。" },
  { aliases: ["退货退款", "不想要了", "解约"], canonical: "合同解除", note: "区分法定解除与约定解除，注意解除通知与到达。" },
  { aliases: ["过期", "超过时间", "时间到了不能告"], canonical: "诉讼时效届满", note: "一般 3 年，注意中止/中断事由与起算点。" },
  { aliases: ["押金不退", "定金"], canonical: "定金 / 押金", note: "定金适用定金罚则（双倍返还/不予返还），与押金、订金区分。" },
  { aliases: ["利息", "资金占用", "迟延利息"], canonical: "逾期利息 / 资金占用费", note: "约定优先，未约定按 LPR 等口径，避免与违约金重复主张。" },
  { aliases: ["查封", "冻结", "扣押", "保全"], canonical: "财产保全", note: "区分诉前/诉中保全，一般需提供担保。" },
  { aliases: ["申请执行", "强制执行", "执行"], canonical: "强制执行", note: "以生效法律文书为执行依据，注意申请执行时效。" },
  { aliases: ["谁举证", "举证"], canonical: "举证责任", note: "一般「谁主张谁举证」，注意举证期限与证据交换。" },
  { aliases: ["担保", "保证", "连带"], canonical: "保证 / 担保责任", note: "区分一般保证与连带责任保证，注意保证期间。" },
  { aliases: ["调解", "和解"], canonical: "调解 / 和解", note: "可诉前、诉中或庭外进行，调解书经签收生效。" }
];

// 法律概念词组：组内任一词命中即归并到同一语义维度（语义检索复用，弥补字面同义词缺口）。
const DEFAULT_CONCEPT_GROUPS = [
  ["欠款", "拖欠", "未付款", "未支付", "货款未付", "尾款", "应付未付", "拖欠货款", "欠条", "欠付"],
  ["违约", "违反约定", "未按约定", "不履行", "未履行", "履行不能", "拒不履行", "迟延履行", "逾期履行"],
  ["合同解除", "解除合同", "终止合同", "合同终止", "解约", "退货退款"],
  ["诉讼时效", "时效期间", "时效届满", "超过时效", "时效中断"],
  ["损失赔偿", "赔偿损失", "损害赔偿", "可得利益损失", "赔偿责任", "实际损失"],
  ["举证责任", "证明责任", "谁主张谁举证", "举证不能", "证明标准"],
  ["管辖", "管辖权", "管辖异议", "移送管辖", "协议管辖", "级别管辖", "地域管辖"],
  ["财产保全", "诉前保全", "诉讼保全", "查封", "冻结", "扣押", "保全担保"],
  ["强制执行", "执行立案", "申请执行", "执行依据", "财产线索", "终本"],
  ["利息", "逾期利息", "资金占用费", "迟延履行利息", "违约金", "罚息"],
  ["定金", "定金罚则", "双倍返还"],
  ["担保", "保证", "保证责任", "抵押", "质押", "连带责任", "保证期间"],
  ["不当得利", "返还财产", "返还义务"],
  ["代位权", "撤销权", "债权人撤销", "债的保全"],
  ["买卖合同", "购销合同", "采购合同", "供货合同", "建材采购"],
  ["借款合同", "民间借贷", "借贷关系", "借条", "借款"],
  ["租赁合同", "房屋租赁", "租金", "押金"],
  ["建设工程", "工程款", "施工合同", "工程价款", "竣工验收"],
  ["劳动争议", "劳动合同", "经济补偿", "工资", "加班费", "解除劳动关系"],
  ["不安抗辩", "先履行抗辩", "同时履行抗辩", "履行抗辩"],
  ["善意取得", "物权变动", "所有权", "占有"],
  ["调解", "和解", "庭外和解", "调解协议", "调解书"],
  ["上诉", "二审", "上诉期限", "上诉状"],
  ["再审", "审判监督", "申请再审", "抗诉"],
  ["送达", "公告送达", "留置送达", "电子送达", "签收"],
  ["鉴定", "司法鉴定", "评估", "笔迹鉴定", "鉴定意见"]
];

// 载入领域画像：默认内置，HENGFA_DOMAIN_PROFILE 指向 JSON 时可覆盖 system / 追加 glossary、concepts。
function loadProfile() {
  const base = { system: DEFAULT_DOMAIN_SYSTEM, glossary: DEFAULT_GLOSSARY, conceptGroups: DEFAULT_CONCEPT_GROUPS, source: "builtin" };
  const file = (process.env.HENGFA_DOMAIN_PROFILE || "").trim();
  if (!file || !existsSync(file)) return base;
  try {
    const custom = JSON.parse(readFileSync(file, "utf8"));
    return {
      system: typeof custom.system === "string" && custom.system.trim() ? custom.system : base.system,
      glossary: Array.isArray(custom.glossary) ? base.glossary.concat(custom.glossary) : base.glossary,
      conceptGroups: Array.isArray(custom.conceptGroups) ? base.conceptGroups.concat(custom.conceptGroups) : base.conceptGroups,
      source: file
    };
  } catch (error) {
    console.error("[legal-domain] 自定义领域画像解析失败，使用内置画像:", error.message);
    return base;
  }
}

const profile = loadProfile();

export const DOMAIN_SYSTEM = profile.system;
export const LEGAL_GLOSSARY = profile.glossary;
export const LEGAL_CONCEPT_GROUPS = profile.conceptGroups;

// 领域画像元信息（能力探测用）。
export function domainProfileInfo() {
  return { source: profile.source, glossaryTerms: LEGAL_GLOSSARY.length, conceptGroups: LEGAL_CONCEPT_GROUPS.length };
}

// 命中文本的术语词典提示（最多 limit 条），用于按需注入提示、避免冗长。
export function glossaryHint(text, limit = 6) {
  const normalized = String(text || "").toLowerCase();
  const hits = [];
  for (const entry of LEGAL_GLOSSARY) {
    if (entry.aliases.some(alias => normalized.includes(alias.toLowerCase())) || normalized.includes(entry.canonical.toLowerCase())) {
      hits.push(`「${entry.canonical}」：${entry.note}`);
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

// 组合领域系统提示 + 任务系统提示（+ 可选术语提示），形成最终下发给基座模型的 system。
export function applyDomain(taskSystem = "", hintText = "") {
  const hints = hintText ? glossaryHint(hintText) : [];
  const glossaryBlock = hints.length ? `\n\n【术语规范提示（按问题命中）】\n${hints.join("\n")}` : "";
  return `${DOMAIN_SYSTEM}\n\n【本次任务】\n${taskSystem}${glossaryBlock}`;
}
