// 衡法 AI 办案台 · Agent 编排与办案启发式（纯函数，零依赖，便于单测）。
// 覆盖设计文档「AI 能力中台：Agent 任务编排（检索—分析—生成—校验自动流）+ 意图识别」
// 以及「案件全生命周期：立案前评估」「智能文书：逻辑校验」中可本地落地的启发式部分。
// 这里只放不依赖 DB / 网络的纯逻辑；编排端点在 server.mjs 内把这些与检索/生成/校验串成自动流。

// —— 意图识别 ——
// 把自然语言输入归类到办案能力，驱动「Agent 自动流」第一步与问答入口的路由建议。
const INTENT_RULES = [
  { intent: "document_draft", route: "documents", label: "智能文书", keywords: ["起诉状", "答辩状", "代理词", "上诉状", "执行申请", "文书", "起草", "写一份", "拟一份", "生成", "模板", "范本"] },
  { intent: "legal_search", route: "search", label: "法律检索", keywords: ["法条", "条文", "规定", "司法解释", "第几条", "法律依据", "检索", "查一下", "如何规定", "怎么规定", "法律规定"] },
  { intent: "evidence", route: "evidence", label: "证据管理", keywords: ["证据", "举证", "质证", "证明", "证据链", "证据目录", "书证", "鉴定"] },
  { intent: "deadline", route: "cases", label: "期限管理", keywords: ["期限", "举证期限", "上诉期限", "答辩期", "开庭", "送达", "几天", "届满", "顺延", "时效到期"] },
  { intent: "strategy", route: "strategy", label: "案情策略", keywords: ["策略", "胜诉", "败诉", "风险", "争议焦点", "类案", "裁判倾向", "调解", "方案", "对策"] },
  { intent: "hearing", route: "hearing", label: "庭审辅助", keywords: ["庭审", "发问", "质证意见", "辩论", "开庭提纲", "笔录", "庭前", "出庭"] },
  { intent: "execution", route: "execution", label: "执行管理", keywords: ["执行", "财产线索", "强制执行", "被执行人", "查控", "终本", "拒不执行"] },
  { intent: "prefiling", route: "strategy", label: "立案前评估", keywords: ["立案", "能不能告", "要不要起诉", "值不值得", "立案前", "评估", "该不该起诉", "可以起诉吗"] }
];

// 识别意图：对各能力的关键词计分，取最高分；并列或零命中归为「法律问答」。
export function classifyIntent(text) {
  const normalized = String(text || "").toLowerCase();
  const scored = INTENT_RULES.map(rule => {
    const hits = rule.keywords.filter(keyword => normalized.includes(keyword.toLowerCase()));
    return { intent: rule.intent, route: rule.route, label: rule.label, score: hits.length, keywords: hits };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  const totalHits = scored.reduce((sum, item) => sum + item.score, 0);
  if (!scored.length) {
    return { intent: "consult", route: "qa", label: "法律问答", confidence: 0.3, keywords: [], candidates: [] };
  }
  const top = scored[0];
  // 置信度：最高项命中占总命中比 × 命中数饱和度（命中越多越自信，封顶 1）。
  const confidence = Number(((top.score / totalHits) * Math.min(1, 0.5 + top.score * 0.25)).toFixed(2));
  return { intent: top.intent, route: top.route, label: top.label, confidence, keywords: top.keywords, candidates: scored.slice(0, 3).map(({ intent, label, score }) => ({ intent, label, score })) };
}

// —— 立案前评估打分 ——
// 中国《诉讼费用交纳办法》财产案件受理费累进分段估算（用于成本/收益参考）。
export function litigationFeeEstimate(amount) {
  const value = Number(amount) || 0;
  if (value <= 0) return 0;
  if (value <= 10000) return 50;
  let fee = 50; // 不超过 1 万元部分，每件 50 元。
  let lower = 10000;
  const tiers = [[100000, 0.025], [200000, 0.02], [500000, 0.015], [1000000, 0.01], [2000000, 0.009], [5000000, 0.008], [10000000, 0.007], [20000000, 0.006], [Infinity, 0.005]];
  for (const [upper, rate] of tiers) {
    if (value <= lower) break;
    fee += (Math.min(value, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(fee);
}

const READINESS_SCORE = { 充分: 100, 可考虑: 75, 需核验: 60, 需补强: 40, 风险: 15 };

// 立案前评估：从案件要素、证据与节点对多维度打分，给出「立案准备度」与建议。
// 仅为办案辅助参考，不构成是否应当起诉的确定性意见。
export function assessPrefiling(caseItem = {}, evidence = [], events = []) {
  const dims = [];
  const D = (key, label, status, note) => dims.push({ key, label, status, score: READINESS_SCORE[status] ?? 50, note });

  // 1. 主体适格。
  if (caseItem.client && caseItem.opposingParty) D("parties", "主体适格", "充分", `原告「${caseItem.client}」、被告「${caseItem.opposingParty}」均已明确。核对被告主体资格与送达地址。`);
  else D("parties", "主体适格", "需补强", "原告或被告信息缺失，需先确定适格当事人与送达信息。");

  // 2. 管辖。
  if (caseItem.court && !/待确定|尚未/.test(caseItem.court)) D("jurisdiction", "管辖", "充分", `拟由「${caseItem.court}」管辖。核对级别/地域管辖与协议管辖条款。`);
  else D("jurisdiction", "管辖", "需补强", "受理法院尚未确定，需依被告住所地/合同履行地或协议管辖确定。");

  // 3. 请求权基础。
  if (caseItem.cause && caseItem.claims) D("claim", "请求权基础", "充分", `案由「${caseItem.cause}」，诉讼请求已录入。确认请求权基础与诉请一一对应。`);
  else D("claim", "请求权基础", "需补强", "案由或诉讼请求不完整，需明确请求权基础与具体诉请。");

  // 4. 证据充分性。
  const verified = evidence.filter(item => item.status === "已核验").length;
  const strong = evidence.filter(item => item.strength === "强").length;
  if (!evidence.length) D("evidence", "证据充分性", "风险", "尚未录入任何证据，难以支撑诉请，建议立案前完成基础取证。");
  else if (verified < Math.ceil(evidence.length / 2) || strong === 0) D("evidence", "证据充分性", "需补强", `共 ${evidence.length} 项证据，已核验 ${verified} 项、强证据 ${strong} 项，建议补强关键待证事实的证据链。`);
  else D("evidence", "证据充分性", "充分", `共 ${evidence.length} 项证据，已核验 ${verified} 项、强证据 ${strong} 项，证据链相对完整。`);

  // 5. 诉讼时效（无可靠数据时保守提示人工核验）。
  D("limitation", "诉讼时效", "需核验", "请核对权利受侵害之日/最后履行期，确认是否在 3 年时效内及有无中止/中断事由。");

  // 6. 标的与成本。
  const amount = Number(caseItem.amount) || 0;
  if (amount > 0) {
    const fee = litigationFeeEstimate(amount);
    D("cost", "标的与成本", "可考虑", `标的额约 ${amount} 元，预估受理费约 ${fee} 元（财产案件累进估算，保全/律师费另计），请做成本收益与回款可行性评估。`);
  } else {
    D("cost", "标的与成本", "需补强", "标的额未录入，无法估算诉讼成本与回款收益，建议先行测算。");
  }

  // 7. 调解可行性。
  D("mediation", "调解可行性", "可考虑", "可评估诉前调解/支付令等替代路径，结合双方关系与回款意愿确定诉讼或调解底线。");

  const score = Math.round(dims.reduce((sum, dim) => sum + dim.score, 0) / dims.length);
  const readiness = score >= 75 ? "较高" : score >= 55 ? "中等" : "偏低";
  const recommendation = score >= 75
    ? "立案准备度较高：可在核验诉讼时效后推进立案。"
    : score >= 55
      ? "立案准备度中等：建议先补强下列事项再立案。"
      : "立案准备度偏低：建议审慎评估，优先补强关键短板或考虑替代路径。";
  const recommendations = dims.filter(dim => dim.status === "需补强" || dim.status === "风险" || dim.status === "需核验").map(dim => `${dim.label}：${dim.note}`);
  return { score, readiness, recommendation, dimensions: dims, recommendations };
}

// —— 文书逻辑校验 ——
// 检查文书内部一致性（诉请明确、当事人称谓、依据齐备、金额/标的、前后表述矛盾、事实支撑诉请、落款）。
// 纯启发式，仅供复核提示，不替代人工审阅。
const CONTRADICTION_PAIRS = [
  [/已(?:付清|结清|清偿|履行完毕)/, /(?:拖欠|未付|未支付|尚欠|欠款)/, "同时出现「已清偿」与「拖欠/未付」，请核对款项状态。"],
  [/已交付|已验收/, /未交付|未收到货/, "同时出现「已交付」与「未交付」，请核对交付事实。"],
  [/合同(?:有效|成立)/, /合同(?:无效|未成立|不成立)/, "同时主张合同「有效」与「无效」，请统一法律评价。"]
];

export function logicCheck(content, caseItem = {}, factTexts = []) {
  const text = String(content || "");
  const findings = [];
  const add = (level, issue, detail) => findings.push({ level, issue, detail });

  // 1. 诉讼请求是否明确。
  if (!/(诉讼|上诉|执行)?请求|请求(?:判令|确认|依法|人民法院)/.test(text)) add("high", "未见明确诉讼请求", "文书中未识别到明确的诉讼/上诉请求，应明确列明请求事项。");

  // 2. 当事人称谓一致。
  if (caseItem.client && !text.includes(caseItem.client)) add("medium", "当事人称谓缺失", `案件原告/委托人「${caseItem.client}」未在文书中出现，请核对主体表述。`);
  if (caseItem.opposingParty && !text.includes(caseItem.opposingParty)) add("medium", "对方当事人缺失", `对方当事人「${caseItem.opposingParty}」未在文书中出现，请核对主体表述。`);
  if (/原告/.test(text) && /上诉人/.test(text)) add("low", "诉讼阶段称谓混用", "文书中同时出现「原告」与「上诉人」，请确认文书类型与阶段是否一致。");

  // 3. 法律依据是否齐备（有诉请却无任何法条/书名号引用）。
  const hasClaim = /请求|此致/.test(text);
  const hasLegal = /《[^》]{2,40}》|第[一二三四五六七八九十百千零〇\d]+条|民法典|诉讼法|司法解释/.test(text);
  if (hasClaim && !hasLegal) add("medium", "缺少法律依据", "文书提出请求但未见明确法条/司法解释依据，建议补充经核验的请求权基础。");

  // 4. 标的额一致性。
  const amounts = [...text.matchAll(/\d[\d,，]*(?:\.\d+)?\s*(?:万元|元)/g)].map(match => match[0]);
  if (Number(caseItem.amount) > 0 && !amounts.length) add("low", "标的额未在正文体现", `案件标的额约 ${caseItem.amount} 元，但正文未见明确金额表述，请核对请求金额。`);
  if (new Set(amounts.map(value => value.replace(/[,，\s]/g, ""))).size >= 4) add("low", "金额表述较多需核对一致", "正文出现多个不同金额，请核对本金、利息、违约金与诉请总额是否一致。");

  // 5. 前后表述矛盾。
  for (const [a, b, detail] of CONTRADICTION_PAIRS) if (a.test(text) && b.test(text)) add("medium", "疑似前后表述矛盾", detail);

  // 6. 诉请关键词是否有事实支撑（诉请提到但正文/材料事实中未见）。
  const body = `${text}\n${factTexts.join("\n")}`;
  for (const term of ["违约金", "利息", "损失", "货款", "定金", "解除"]) {
    if (new RegExp(`请求[^。]*${term}|${term}[^。]*请求`).test(text) && (body.match(new RegExp(term, "g")) || []).length < 2) {
      add("low", "诉请缺事实支撑", `诉讼请求涉及「${term}」，但事实/材料中对应记载偏少，建议补充事实与计算依据。`);
    }
  }

  // 7. 落款完整性。
  if (/此致/.test(text) && !/具状人|上诉人|申请人|答辩人|代理人|日期[:：]/.test(text)) add("low", "落款不完整", "出现「此致」但未见具状人/落款日期，请补全落款信息。");

  return findings;
}
