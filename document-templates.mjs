// 文书模板（服务端共享）：供 Web 应用与 Word/WPS 办公插件复用同一套生成逻辑。
// 纯函数实现，便于单测；与 app.js 客户端模板保持一致，任何一处修改都应同步另一处。
// 生成结果仅为基于已录入信息的草稿，须由办案人员核验事实、请求、金额、管辖、期限与法律依据。

export const templateLabels = {
  complaint: "民事起诉状",
  defense: "民事答辩状",
  evidenceList: "证据目录",
  opinion: "代理词",
  appeal: "民事上诉状",
  execution: "强制执行申请书"
};

// 证据缺口提示（与客户端 evidenceGapNote 对应）：根据证据核验情况追加一段提醒文字。
function evidenceGapNote(caseItem, evidence) {
  const pending = evidence.filter(item => item.status !== "已核验"); // 挑出尚未核验的证据。
  if (!evidence.length) return "\n\n【证据提示】当前未录入证据，请补充证据材料后再行提交。"; // 完全没有证据。
  if (pending.length) return `\n\n【证据提示】以下证据尚未核验：${pending.map(item => item.name).join("、")}，提交前应完成核验。`; // 有未核验证据时点名列出。
  return ""; // 证据齐备且均已核验,不追加提示。
}

// 生成指定类型的文书草稿文本。
// template: 文书类型键(见 templateLabels);caseItem: 案件对象;evidence/assetClues: 该案证据与财产线索。
export function renderDocumentTemplate(template, caseItem, evidence = [], assetClues = []) {
  if (!caseItem) return "请先新建并选择案件。"; // 没有案件无法生成,直接返回提示。
  // 证据概览文本:有证据则逐条编号列出"名称：证明目的",否则给占位提示。
  const evidenceText = evidence.length
    ? evidence.map((item, index) => `${index + 1}. ${item.name}：${item.fact}。`).join("\n")
    : "暂无已录入证据，请补充证据材料。";
  const header = `案件：${caseItem.title}\n案号：${caseItem.caseNo}\n受理法院：${caseItem.court}`; // 多类文书共用的抬头三要素。
  const verify = "\n\n【系统提示】本稿根据已录入信息自动生成。事实、请求、金额、管辖、期限和法律依据须由办案人员核验后使用。"; // 统一附在文末的核验声明。
  const templates = {
    complaint: `民事起诉状\n\n原告：${caseItem.client}\n被告：${caseItem.opposingParty}\n\n诉讼请求\n${caseItem.claims}\n\n事实与理由\n${caseItem.facts}\n\n证据概览\n${evidenceText}\n\n此致\n${caseItem.court}\n\n具状人：${caseItem.client}\n日期：____年__月__日`,
    defense: `民事答辩状\n\n答辩人：${caseItem.client}\n对方当事人：${caseItem.opposingParty}\n\n答辩意见\n一、对对方请求权基础及事实主张逐项回应。\n二、结合合同履行、证据真实性和损失计算提出抗辩。\n三、对程序事项和期限事项进行独立核验。\n\n案件事实摘要\n${caseItem.facts}\n\n拟引用证据\n${evidenceText}\n\n此致\n${caseItem.court}`,
    evidenceList: `证据目录\n\n${header}\n\n${evidence.map((item, index) => `${index + 1}. ${item.name}\n   类型：${item.type}\n   来源：${item.source}\n   证明目的：${item.fact}\n   核验状态：${item.status}`).join("\n\n") || "暂无证据记录。"}\n\n提交人：${caseItem.client}\n日期：____年__月__日`,
    opinion: `代理词\n\n${header}\n\n审判长、审判员：\n受${caseItem.client}委托，现结合庭审和在案证据发表如下代理意见：\n\n一、案件事实与合同履行情况\n${caseItem.facts}\n\n二、争议焦点\n1. 双方权利义务及履行情况如何认定；\n2. 现有证据能否形成完整证据链；\n3. 请求金额及损失计算是否具有事实和法律依据。\n\n三、证据分析\n${evidenceText}\n\n四、代理意见\n请结合经质证的证据依法支持我方有事实与法律依据的主张。`,
    appeal: `民事上诉状\n\n上诉人：${caseItem.client}\n被上诉人：${caseItem.opposingParty}\n\n上诉请求\n请根据一审裁判主文、具体异议和上诉利益补充。\n\n事实与理由\n一、一审事实认定需复核之处：____。\n二、证据采信与证明责任分配需复核之处：____。\n三、法律适用需复核之处：____。\n\n相关案件事实\n${caseItem.facts}\n\n此致\n有管辖权的上级人民法院`,
    execution: `强制执行申请书\n\n申请执行人：${caseItem.client}\n被执行人：${caseItem.opposingParty}\n\n执行依据\n${caseItem.caseNo}\n\n执行请求\n${caseItem.claims}\n\n事实与理由\n相关法律文书已经发生法律效力，被执行人未按期履行确定义务，现申请依法强制执行。\n\n财产线索\n${assetClues.map((item, index) => `${index + 1}. ${item.type}：${item.description}（${item.status}）`).join("\n") || "暂无已录入财产线索。"}\n\n此致\n${caseItem.court}`
  };
  // 仅对依赖证据论证的四类文书追加证据缺口提示;上诉状/执行申请书不需要。
  const gapNote = ["complaint", "defense", "opinion", "evidenceList"].includes(template) ? evidenceGapNote(caseItem, evidence) : "";
  // 取对应模板(未知类型回退到起诉状),拼上证据提示与核验声明后返回。
  return (templates[template] || templates.complaint) + gapNote + verify;
}
