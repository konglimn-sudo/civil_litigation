const STORAGE_KEY = "hengfa-civil-litigation-v1";

const stages = ["立案前评估", "立案", "庭前准备", "开庭", "判决/调解", "执行", "上诉/再审"];

const routeMeta = {
  dashboard: ["办案总览", "汇总期限、案件状态、证据风险与团队待办。"],
  cases: ["案件全生命周期", "从立案前评估到执行、上诉与再审，统一管理案件节点。"],
  search: ["智能法律检索", "按自然语言检索样例法源，显示效力层级、时效状态与出处。"],
  documents: ["智能文书", "基于案件事实与证据生成可编辑的办案文书初稿。"],
  evidence: ["证据管理与分析", "归类、编号并关联待证事实，识别证据缺口与质证风险。"],
  strategy: ["案情分析与诉讼策略", "提炼争议焦点、风险因素和诉讼或调解路径。"],
  qa: ["法律智能问答", "回答基于当前样例知识库，并附可核验的依据来源。"],
  hearing: ["庭审辅助", "生成庭前核对清单、发问提纲、质证意见和辩论要点。"],
  execution: ["执行与后续管理", "跟踪执行节点，维护财产线索，并衔接上诉与再审。"],
  collaboration: ["协作与办公支撑", "集中管理团队任务、工时、文书版本与办案动态。"],
  platform: ["平台与安全", "查看技术分层、AI Agent 流程和本地安全配置。"]
};

const templateLabels = {
  complaint: "民事起诉状",
  defense: "民事答辩状",
  evidenceList: "证据目录",
  opinion: "代理词",
  appeal: "民事上诉状",
  execution: "强制执行申请书"
};

const knowledgeBase = [
  {
    id: "kb-1",
    title: "合同履行与违约责任检索指引",
    level: "法律",
    status: "有效性待核验",
    updatedAt: "2026-05-18",
    source: "示例知识库 / 民法典合同编主题索引",
    tags: ["合同", "违约", "损失", "履行"],
    summary: "合同纠纷通常需要依次核验合同成立与效力、当事人履行情况、违约行为、因果关系和损失范围。",
    excerpt: "检索结果为产品样例，应回到国家法律法规数据库或正式出版法源核验具体条文及现行状态。"
  },
  {
    id: "kb-2",
    title: "民事诉讼举证期限与逾期证据管理",
    level: "程序规则",
    status: "有效性待核验",
    updatedAt: "2026-04-26",
    source: "示例知识库 / 民事诉讼证据规则主题索引",
    tags: ["举证", "证据", "期限", "逾期"],
    summary: "办案时应以法院通知和现行程序规则为准，记录举证期限、延期申请、证据交换及逾期提交的原因。",
    excerpt: "系统应在案件时间轴中单独管理举证截止日，并保存期限来源、送达日期和计算过程。"
  },
  {
    id: "kb-3",
    title: "诉讼时效审查清单",
    level: "法律",
    status: "有效性待核验",
    updatedAt: "2026-05-02",
    source: "示例知识库 / 民法典总则编主题索引",
    tags: ["时效", "起算", "中断", "催告"],
    summary: "审查请求权基础、时效期间、起算点以及可能导致中止或中断的事实，并保留催告、承诺还款等材料。",
    excerpt: "时效判断高度依赖事实与证据，产品输出只能作为核对清单，不能替代律师判断。"
  },
  {
    id: "kb-4",
    title: "财产保全与担保材料准备",
    level: "司法解释/程序规则",
    status: "有效性待核验",
    updatedAt: "2026-03-30",
    source: "示例知识库 / 保全程序办案指引",
    tags: ["保全", "财产", "担保", "紧急"],
    summary: "申请保全通常需要明确请求、说明紧迫性、提供财产线索并按受理法院要求准备担保材料。",
    excerpt: "不同法院的材料要求和操作口径可能不同，应以承办法院最新要求为准。"
  },
  {
    id: "kb-5",
    title: "类案检索与裁判观点归纳方法",
    level: "案例/方法",
    status: "持续更新",
    updatedAt: "2026-06-08",
    source: "示例知识库 / 类案检索工作规范",
    tags: ["类案", "案例", "裁判观点", "争议焦点"],
    summary: "优先按请求权基础、核心争点、事实构成和法院层级筛选类案，并区分指导性案例、典型案例与一般裁判文书。",
    excerpt: "类案结论应记录检索范围和筛选标准，避免把个案裁判倾向表述为确定结果。"
  },
  {
    id: "kb-6",
    title: "执行阶段财产线索整理清单",
    level: "实务指引",
    status: "持续更新",
    updatedAt: "2026-05-21",
    source: "示例知识库 / 执行办案工作指引",
    tags: ["执行", "财产线索", "账户", "股权"],
    summary: "可按银行账户、不动产、车辆、股权、到期债权、网络资金和经营收益等类别整理线索及来源。",
    excerpt: "财产线索需记录可核验来源，涉及个人信息处理时应遵守授权、最小必要和安全留痕原则。"
  },
  {
    id: "kb-7",
    title: "电子数据证据审查要点",
    level: "司法解释/证据规则",
    status: "有效性待核验",
    updatedAt: "2026-04-12",
    source: "示例知识库 / 电子数据证据主题索引",
    tags: ["电子数据", "微信", "邮件", "真实性"],
    summary: "审查电子数据的生成、存储、提取和展示过程，保留原始载体、完整上下文、主体身份及时间信息。",
    excerpt: "截图通常需要与原始载体、导出记录或其他证据相互印证，具体证明力由案件事实决定。"
  }
];

function dateFromNow(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function createInitialState() {
  return {
    activeCaseId: "case-1",
    cases: [
      {
        id: "case-1",
        title: "张某与华东建材有限公司买卖合同纠纷",
        client: "张某",
        opposingParty: "华东建材有限公司",
        cause: "买卖合同纠纷",
        court: "某市中级人民法院",
        caseNo: "（2026）示例民初 1024 号",
        stage: "庭前准备",
        amount: 680000,
        openedAt: dateFromNow(-42),
        nextDate: dateFromNow(3),
        nextEvent: "举证期限届满",
        hearingDate: dateFromNow(14),
        claims: "请求支付剩余货款 680,000 元及相应资金占用损失。",
        facts: "双方签订建材采购合同，货物已分批交付并验收，对方支付部分款项后未继续付款。",
        risk: 46
      },
      {
        id: "case-2",
        title: "李某民间借贷纠纷执行案",
        client: "李某",
        opposingParty: "周某",
        cause: "民间借贷纠纷",
        court: "某区人民法院",
        caseNo: "（2026）示例执 318 号",
        stage: "执行",
        amount: 320000,
        openedAt: dateFromNow(-126),
        nextDate: dateFromNow(7),
        nextEvent: "提交补充财产线索",
        hearingDate: "",
        claims: "申请执行本金、利息及生效法律文书确定的其他义务。",
        facts: "判决已经生效，被执行人未在指定期限履行，现已申请强制执行。",
        risk: 62
      },
      {
        id: "case-3",
        title: "海岳科技有限公司服务合同纠纷",
        client: "海岳科技有限公司",
        opposingParty: "云图信息有限公司",
        cause: "服务合同纠纷",
        court: "尚未确定",
        caseNo: "立案前评估",
        stage: "立案前评估",
        amount: 1250000,
        openedAt: dateFromNow(-8),
        nextDate: dateFromNow(10),
        nextEvent: "完成诉讼方案评审",
        hearingDate: "",
        claims: "拟请求支付项目服务费及逾期付款损失。",
        facts: "项目已上线运行，对方以交付范围存在争议为由拒付尾款。",
        risk: 58
      }
    ],
    evidence: [
      { id: "ev-1", caseId: "case-1", no: "证据 1", name: "建材采购合同", type: "书证", fact: "证明合同关系、标的与付款安排", source: "客户原件", strength: "强", risk: "低", status: "已核验", note: "签章完整" },
      { id: "ev-2", caseId: "case-1", no: "证据 2", name: "送货单及验收记录", type: "书证", fact: "证明交付数量和验收情况", source: "客户扫描件", strength: "中", risk: "中", status: "待补强", note: "部分单据签收人身份待核实" },
      { id: "ev-3", caseId: "case-1", no: "证据 3", name: "对账微信记录", type: "电子数据", fact: "证明欠款金额及对方确认", source: "手机导出", strength: "中", risk: "中", status: "待核验", note: "需保留原始载体和完整上下文" },
      { id: "ev-4", caseId: "case-2", no: "证据 1", name: "生效民事判决书", type: "书证", fact: "证明执行依据与履行义务", source: "法院电子送达", strength: "强", risk: "低", status: "已核验", note: "已核验生效状态" },
      { id: "ev-5", caseId: "case-3", no: "证据 1", name: "项目服务合同", type: "书证", fact: "证明服务范围与付款节点", source: "客户原件", strength: "强", risk: "低", status: "已核验", note: "" }
    ],
    tasks: [
      { id: "task-1", caseId: "case-1", title: "核实送货单签收人身份", owner: "王律师", dueDate: dateFromNow(2), priority: "高", done: false },
      { id: "task-2", caseId: "case-1", title: "完成庭前证据目录复核", owner: "谢律师", dueDate: dateFromNow(5), priority: "中", done: false },
      { id: "task-3", caseId: "case-2", title: "整理被执行人股权线索", owner: "陈助理", dueDate: dateFromNow(6), priority: "高", done: false },
      { id: "task-4", caseId: "case-3", title: "访谈项目交付负责人", owner: "谢律师", dueDate: dateFromNow(1), priority: "中", done: true }
    ],
    timeLogs: [
      { id: "time-1", caseId: "case-1", member: "谢律师", hours: 2.5, date: dateFromNow(-1), activity: "证据审查" },
      { id: "time-2", caseId: "case-3", member: "王律师", hours: 1.5, date: dateFromNow(-2), activity: "客户访谈" }
    ],
    assetClues: [
      { id: "clue-1", caseId: "case-2", type: "股权", description: "被执行人持有某商贸公司股权", source: "公开企业信息", status: "待核验", updatedAt: dateFromNow(-2) },
      { id: "clue-2", caseId: "case-2", type: "到期债权", description: "疑似对合作方享有应收账款", source: "客户提供合同", status: "待申请调查", updatedAt: dateFromNow(-1) }
    ],
    documentVersions: [
      { id: "doc-1", caseId: "case-1", name: "证据目录", version: "v2", member: "谢律师", updatedAt: dateFromNow(-1) },
      { id: "doc-2", caseId: "case-1", name: "代理词提纲", version: "v1", member: "王律师", updatedAt: dateFromNow(-2) }
    ],
    caseEvents: [
      { id: "event-1", caseId: "case-1", date: dateFromNow(-42), title: "完成首次客户访谈", type: "会见", status: "已完成", source: "客户委托记录", note: "已整理合同签订、交付与付款时间线。" },
      { id: "event-2", caseId: "case-1", date: dateFromNow(-31), title: "案件立案受理", type: "程序节点", status: "已完成", source: "受理通知书", note: "案号与承办法院已登记。" },
      { id: "event-3", caseId: "case-1", date: dateFromNow(3), title: "举证期限届满", type: "法定/指定期限", status: "待办理", source: "法院举证通知", note: "提交前复核原件、份数与电子数据载体。" },
      { id: "event-4", caseId: "case-1", date: dateFromNow(14), title: "第一次开庭", type: "庭审", status: "待办理", source: "开庭传票", note: "庭前完成发问提纲和质证意见。" },
      { id: "event-5", caseId: "case-2", date: dateFromNow(-18), title: "执行立案", type: "执行", status: "已完成", source: "执行案件受理通知", note: "已完成基础网络查控申请。" },
      { id: "event-6", caseId: "case-2", date: dateFromNow(7), title: "提交补充财产线索", type: "执行期限", status: "待办理", source: "团队计划", note: "重点核验股权与到期债权线索。" },
      { id: "event-7", caseId: "case-3", date: dateFromNow(10), title: "完成诉讼方案评审", type: "内部节点", status: "待办理", source: "团队计划", note: "评估管辖、保全和调解底线。" }
    ],
    auditLogs: [
      { id: "audit-1", action: "文书生成", detail: "生成证据目录 v2", caseId: "case-1", member: "谢律师", createdAt: new Date().toISOString() },
      { id: "audit-2", action: "证据核验", detail: "核验建材采购合同", caseId: "case-1", member: "王律师", createdAt: new Date(Date.now() - 86400000).toISOString() }
    ],
    qaMessages: [
      { role: "assistant", text: "您好。我会优先从当前样例知识库中检索，并在回答后附上依据。请结合具体案情核验正式法源。", citations: [] }
    ],
    clients: [
      { id: "client-1", name: "张某", contact: "138-0000-0001", channel: "老客户转介绍", note: "建材买卖长期客户", caseIds: ["case-1"], createdAt: dateFromNow(-45) },
      { id: "client-2", name: "李某", contact: "139-0000-0002", channel: "线上咨询", note: "民间借贷执行", caseIds: ["case-2"], createdAt: dateFromNow(-130) },
      { id: "client-3", name: "海岳科技有限公司", contact: "021-5000-0003", channel: "合作律所推荐", note: "服务合同尾款争议", caseIds: ["case-3"], createdAt: dateFromNow(-10) }
    ],
    settings: { localDeploy: true, masking: true, audit: true, sourceRequired: true },
    metrics: { documentsGenerated: 2 }
  };
}

function loadState() {
  const fallback = createInitialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.cases)) return fallback;
    return {
      ...fallback,
      ...saved,
      settings: { ...fallback.settings, ...(saved.settings || {}) },
      metrics: { ...fallback.metrics, ...(saved.metrics || {}) }
    };
  } catch (error) {
    return fallback;
  }
}

let state = loadState();
// 初始路由支持 URL hash 深链(如 #cases),便于分享与按页截图。
const initialHash = (typeof location !== "undefined" && location.hash ? location.hash : "").replace(/^#/, "");
let activeRoute = Object.prototype.hasOwnProperty.call(routeMeta, initialHash) ? initialHash : "dashboard";
let selectedTemplate = "complaint";
let documentDraft = "";
let legalQuery = "";
let legalLevel = "全部";
let caseViewMode = "overview";
let evidenceViewMode = "catalog";
let documentReviewResults = [];
let documentFacts = null;
let documentTimeline = [];
let documentVerification = null;
let pendingDeadline = null;
let apiMode = false;
let currentUser = null;
let grantedPermissions = [];
let csrfToken = "";
let serverRevision = 0;
let workspaceUsers = [];
let caseFiles = [];
let ocrCapabilities = null;
let hearingCapabilities = null;
let hearingTranscript = null;
let hearingSummary = null;
let legalSources = [];
let legalRagResults = null;
let legalIncludeLapsed = false;
let citationImpacts = [];
let strategyTendency = null;
let archiveQuery = "";
let notifications = [];
let unreadCount = 0;
let notifPrefs = { leadDays: 7, mutedTypes: [], channels: ["inapp"] };
let webhookLog = { configured: false, pending: 0, failed: 0, log: [] };
const NOTIF_TYPE_LABELS = { legal_expiry: "法源到期", deadline_overdue: "逾期节点", deadline_due: "临近期限", hearing_conflict: "庭期冲突", task_overdue: "逾期任务", task_due: "临近任务" };
const NOTIF_TYPE_ORDER = ["deadline_overdue", "task_overdue", "hearing_conflict", "deadline_due", "task_due", "legal_expiry"];
let locateContext = null;
let replacementResults = [];
let replacementChoice = "";
let replaceQuery = "";
let syncTimer = null;
let syncInFlight = false;
let syncPending = false;

const view = document.querySelector("#app-view");
const caseSelect = document.querySelector("#global-case-select");
const dialog = document.querySelector("#app-dialog");
const dialogContent = document.querySelector("#dialog-content");
const toastElement = document.querySelector("#toast");
const authView = document.querySelector("#auth-view");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");
const syncState = document.querySelector("#sync-state");
const profileName = document.querySelector("#profile-name");
const profileRole = document.querySelector("#profile-role");
const profileAvatar = document.querySelector("#profile-avatar");
const topNewCase = document.querySelector("#top-new-case");

function can(permission) {
  return !apiMode || grantedPermissions.includes(permission);
}

function roleLabel(role) {
  return { admin: "系统管理员", lawyer: "承办律师", assistant: "律师助理", client: "当事人" }[role] || "本地工作区";
}

function hydrateState(remote = {}) {
  const fallback = createInitialState();
  return {
    ...fallback,
    ...remote,
    settings: { ...fallback.settings, ...(remote.settings || {}) },
    metrics: { ...fallback.metrics, ...(remote.metrics || {}) },
    auditLogs: Array.isArray(remote.auditLogs) ? remote.auditLogs : fallback.auditLogs
  };
}

function setSyncState(label, tone = "") {
  syncState.classList.remove("is-syncing", "is-error");
  if (tone) syncState.classList.add(tone);
  syncState.lastChild.textContent = label;
}

function updateIdentity() {
  const name = currentUser?.name || "办案团队";
  profileName.textContent = name;
  profileRole.textContent = apiMode ? roleLabel(currentUser?.role) : "本地演示模式";
  profileAvatar.textContent = name.slice(0, 1) || "衡";
  topNewCase.hidden = !can("create_case");
}

async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `请求失败 (${response.status})`);
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }
  return data;
}

function showLogin(message = "") {
  appShell.hidden = true;
  authView.hidden = false;
  loginError.hidden = !message;
  loginError.textContent = message;
  loginForm.querySelector('input[name="password"]').value = "";
}

function showApp() {
  authView.hidden = true;
  appShell.hidden = false;
  logoutButton.hidden = !apiMode;
  updateIdentity();
  updateNotifBadge();
  setSyncState(apiMode ? "服务端已连接" : "本地数据");
  renderCaseSelect();
  renderPage();
}

async function loadWorkspaceUsers() {
  if (!apiMode || !can("manage_users")) return;
  const data = await apiRequest("/api/users");
  workspaceUsers = data.users || [];
}

async function loadCaseFiles() {
  if (!apiMode) return;
  const [fileData, capabilityData, hearingCaps] = await Promise.all([
    apiRequest("/api/files"),
    ocrCapabilities ? Promise.resolve(ocrCapabilities) : apiRequest("/api/ocr/capabilities"),
    hearingCapabilities ? Promise.resolve(hearingCapabilities) : apiRequest("/api/hearing/capabilities").catch(() => null)
  ]);
  caseFiles = fileData.files || [];
  ocrCapabilities = capabilityData;
  hearingCapabilities = hearingCaps;
}

async function loadLegalSources() {
  if (!apiMode) return;
  const data = await apiRequest("/api/legal/sources");
  legalSources = data.sources || [];
}

// 拉取后台生成的提醒通知(到期预警等),更新顶栏铃铛。
async function loadNotifications() {
  if (!apiMode) { notifications = []; unreadCount = 0; updateNotifBadge(); return; }
  try {
    const data = await apiRequest("/api/notifications");
    notifications = data.notifications || [];
    unreadCount = data.unread || 0;
  } catch (error) {
    notifications = [];
    unreadCount = 0;
  }
  updateNotifBadge();
}

function updateNotifBadge() {
  const button = document.querySelector("#notifications-button");
  const count = document.querySelector("#notif-count");
  if (!button || !count) return;
  button.hidden = !apiMode;
  count.hidden = unreadCount === 0;
  count.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
}

function notifTarget(item) {
  if (item.type === "legal_expiry" && item.meta?.sourceId) return { kind: "source", id: item.meta.sourceId, label: "前往法源" };
  if (["deadline_overdue", "deadline_due", "task_overdue", "task_due"].includes(item.type) && item.meta?.caseId) return { kind: "case", id: item.meta.caseId, label: "前往案件" };
  if (item.type === "hearing_conflict" && Array.isArray(item.meta?.caseIds) && item.meta.caseIds.length) return { kind: "case", id: item.meta.caseIds[0], label: "前往案件" };
  return null;
}

function notifItemHtml(item) {
  const toneFor = level => level === "high" ? "red" : level === "medium" ? "gold" : "teal";
  const target = notifTarget(item);
  const goButton = target ? `<button class="quiet-button" type="button" data-action="notif-go" data-id="${escapeHTML(item.id)}" data-go-kind="${target.kind}" data-go-id="${escapeHTML(target.id)}">${target.label}</button>` : "";
  return `<div class="notif-item ${item.read ? "is-read" : ""}">
    <div class="notif-meta">${badge(item.level === "high" ? "紧急" : item.level === "medium" ? "提醒" : "通知", toneFor(item.level))}<span>${formatDateTime(item.createdAt)}</span>${goButton}${item.read ? "" : `<button class="quiet-button" type="button" data-action="notif-read" data-id="${escapeHTML(item.id)}">标记已读</button>`}</div>
    <strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.detail)}</p>
  </div>`;
}

function notificationsDialog() {
  const present = NOTIF_TYPE_ORDER.filter(type => notifications.some(item => item.type === type));
  const others = [...new Set(notifications.map(item => item.type))].filter(type => !NOTIF_TYPE_ORDER.includes(type));
  const groupsHtml = [...present, ...others].map(type => {
    const items = notifications.filter(item => item.type === type);
    const unread = items.filter(item => !item.read).length;
    return `<details class="notif-group" ${unread ? "open" : ""}>
      <summary>${escapeHTML(NOTIF_TYPE_LABELS[type] || "通知")} · ${items.length} 条${unread ? ` · <span class="notif-group-unread">${unread} 未读</span>` : ""}</summary>
      <div class="notif-list">${items.map(notifItemHtml).join("")}</div>
    </details>`;
  }).join("") || `<div class="empty-state"><strong>暂无提醒</strong>到期、逾期、庭期冲突、任务到期等提醒会由后台定时任务自动生成。</div>`;
  dialogContent.innerHTML = `<div class="dialog-head"><h2>提醒通知${unreadCount ? ` · ${unreadCount} 未读` : ""}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
    <div class="dialog-body">${groupsHtml}</div>
    <div class="dialog-actions"><button class="secondary-button" type="button" data-action="notif-digest">查看日报</button><button class="secondary-button" type="button" data-action="notif-prefs">偏好设置</button>${unreadCount ? `<button class="secondary-button" type="button" data-action="notif-read-all">全部标记已读</button>` : ""}<button class="primary-button" type="button" data-action="close-dialog">关闭</button></div>`;
  dialog.showModal();
}

let lastDigestText = "";

async function digestDialog() {
  let digest = { subject: "", text: "无待处理提醒。", groups: [], total: 0 };
  try {
    const data = await apiRequest("/api/notifications/digest");
    digest = data.digest || digest;
  } catch (error) { showToast(error.message); }
  lastDigestText = digest.text || "";
  const toneFor = level => level === "high" ? "red" : level === "medium" ? "gold" : "teal";
  const body = digest.groups && digest.groups.length
    ? digest.groups.map(group => `<div class="digest-group"><div class="agent-head" style="margin-bottom:5px;"><strong>${escapeHTML(group.label)}</strong>${badge(`${group.items.length} 项`, "blue")}</div>${group.items.map(item => `<div class="digest-line ${item.level}"><span class="dot ${toneFor(item.level)}"></span>${escapeHTML(item.detail)}</div>`).join("")}</div>`).join("")
    : `<div class="empty-state"><strong>暂无待处理提醒</strong>未读提醒清空后日报为空。</div>`;
  dialogContent.innerHTML = `<div class="dialog-head"><h2>提醒日报</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
    <div class="dialog-body">
      <div class="digest-subject">${escapeHTML(digest.subject || "")}</div>
      ${body}
      <div class="disclaimer" style="margin-top:10px;">日报由当前未读提醒按你的偏好汇总;后台定时任务会把每次扫描的多条提醒合并为一封同样格式的报告推送到外部 webhook。</div>
    </div>
    <div class="dialog-actions"><button class="secondary-button" type="button" data-action="copy-digest">复制日报文本</button><button class="primary-button" type="button" data-action="close-dialog">关闭</button></div>`;
  dialog.showModal();
}

async function notifPrefsDialog() {
  try {
    const data = await apiRequest("/api/notifications/prefs");
    notifPrefs = data.prefs || notifPrefs;
  } catch (error) { /* use cached */ }
  const muted = new Set(notifPrefs.mutedTypes || []);
  const channels = new Set(notifPrefs.channels || ["inapp"]);
  const typeRows = Object.entries(NOTIF_TYPE_LABELS).map(([type, label]) => `<label class="pref-check"><input type="checkbox" name="type" value="${type}" ${muted.has(type) ? "" : "checked"}> ${label}</label>`).join("");
  dialogContent.innerHTML = `
    <form id="notif-prefs-form" method="dialog">
      <div class="dialog-head"><h2>提醒偏好</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
      <div class="dialog-body">
        <div class="form-field"><label>临近期限提前提醒天数（1–60）</label><input name="leadDays" type="number" min="1" max="60" value="${notifPrefs.leadDays || 7}"></div>
        <div class="form-field"><label>接收以下提醒类型</label><div class="pref-group">${typeRows}</div></div>
        <div class="form-field"><label>接收渠道</label><div class="pref-group"><label class="pref-check"><input type="checkbox" name="channel" value="inapp" ${channels.has("inapp") ? "checked" : ""}> 站内通知中心</label><label class="pref-check"><input type="checkbox" name="channel" value="webhook" ${channels.has("webhook") ? "checked" : ""}> 外部推送（webhook/邮件）</label></div></div>
        <div class="form-field"><div class="disclaimer">「提前天数」仅影响“临近期限”提醒在你的通知中心是否显示；外部推送需管理员配置 HENGFA_REMINDER_WEBHOOK 后,选中渠道的成员会进入推送收件人名单。</div></div>
      </div>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">取消</button><button class="primary-button" type="submit">保存偏好</button></div>
    </form>`;
  dialog.showModal();
}

async function saveNotifPrefs(form) {
  const leadDays = Number(new FormData(form).get("leadDays")) || 7;
  const checkedTypes = new Set([...form.querySelectorAll('input[name="type"]:checked')].map(input => input.value));
  const mutedTypes = Object.keys(NOTIF_TYPE_LABELS).filter(type => !checkedTypes.has(type));
  const channels = [...form.querySelectorAll('input[name="channel"]:checked')].map(input => input.value);
  try {
    const data = await apiRequest("/api/notifications/prefs", { method: "PUT", body: { leadDays, mutedTypes, channels } });
    notifPrefs = data.prefs || { leadDays, mutedTypes, channels };
    await loadNotifications();
    dialog.close();
    showToast("提醒偏好已保存");
  } catch (error) {
    showToast(error.message);
  }
}

// 拉取 webhook 投递记录(管理员,用于平台页可视化)。
async function loadWebhookLog() {
  if (!apiMode || !can("manage_settings")) return;
  try {
    const data = await apiRequest("/api/notifications/webhook-log");
    webhookLog = { configured: data.configured, pending: data.pending, failed: data.failed, log: data.log || [] };
  } catch (error) { /* keep cached */ }
}

// 反查已生成文书引用了哪些失效法源(用于仪表盘风险提醒)。
async function loadCitationImpacts() {
  if (!apiMode) { citationImpacts = []; return; }
  try {
    const data = await apiRequest("/api/legal/impact");
    citationImpacts = data.impacts || [];
  } catch (error) {
    citationImpacts = [];
  }
}

// 从服务端拉取集中维护的节假日表,覆盖本地兜底(一处更新全员生效)。
async function loadHolidays() {
  if (!apiMode) return;
  try {
    const data = await apiRequest("/api/holidays");
    if (data.calendars && Object.keys(data.calendars).length) holidayCalendars = { ...FALLBACK_HOLIDAYS, ...data.calendars };
  } catch (error) {
    holidayCalendars = FALLBACK_HOLIDAYS;
  }
}

// 调用服务端 FTS5/BM25 检索工作区法源库。
async function runLegalSearch() {
  if (!apiMode) { renderPage(); return; }
  if (!legalQuery.trim()) { legalRagResults = []; renderPage(); return; }
  setSyncState("正在检索", "is-syncing");
  try {
    const data = await apiRequest("/api/legal/search", { method: "POST", body: { query: legalQuery, limit: 8, includeLapsed: legalIncludeLapsed } });
    legalRagResults = data.results || [];
    setSyncState("已同步");
  } catch (error) {
    legalRagResults = [];
    setSyncState("检索失败", "is-error");
    showToast(error.message);
  }
  renderPage();
}

// 调用服务端检索增强问答（抽取式 + 可核验引用）。
async function askLegalQuestion(query) {
  state.qaMessages.push({ role: "user", text: query, citations: [] });
  persist();
  renderPage();
  try {
    const data = await apiRequest("/api/legal/answer", { method: "POST", body: { query } });
    state.qaMessages.push({ role: "assistant", text: data.answer, citations: data.citations || [], generatedBy: data.generatedBy || "extractive" });
  } catch (error) {
    state.qaMessages.push({ role: "assistant", text: `检索失败：${error.message}`, citations: [] });
  }
  persist();
  renderPage();
}

// 案情策略：检索类案并聚合裁判倾向参考。
async function runStrategyTendency() {
  const caseItem = currentCase();
  if (!caseItem) return showToast("请先选择案件");
  if (!apiMode) return showToast("类案检索需登录服务端模式");
  setSyncState("正在检索类案", "is-syncing");
  try {
    strategyTendency = await apiRequest("/api/strategy/tendency", { method: "POST", body: { caseId: caseItem.id } });
    setSyncState("已同步");
    if (!strategyTendency.precedents?.length) showToast("未检索到相似类案样例，可调整案由或事实关键词");
  } catch (error) {
    strategyTendency = null;
    setSyncState("检索失败", "is-error");
    showToast(error.message);
  }
  renderPage();
}

// 庭审语音转写：调用本地引擎转写已上传音频。
async function runTranscribe(fileId) {
  const caseItem = currentCase();
  if (!caseItem) return showToast("请先选择案件");
  if (!fileId) return showToast("请先选择庭审录音文件");
  setSyncState("正在转写录音", "is-syncing");
  try {
    const data = await apiRequest("/api/hearing/transcribe", { method: "POST", body: { caseId: caseItem.id, fileId } });
    if (data.method === "manual") {
      hearingTranscript = null;
      setSyncState("未检测到引擎", "is-error");
      showToast("未检测到本地语音引擎，请改用「导入笔录」手工粘贴庭审笔录");
    } else {
      hearingTranscript = data;
      hearingSummary = null;
      setSyncState("已同步");
      showToast(data.segments?.length ? `转写完成，共 ${data.segments.length} 段` : (data.error || "未识别到语音内容"));
      await loadCaseFiles();
    }
  } catch (error) {
    setSyncState("转写失败", "is-error");
    showToast(error.message);
  }
  renderPage();
}

// 庭审语音转写：将粘贴/导入的笔录文本结构化为分段。
async function runImportTranscript(text) {
  const caseItem = currentCase();
  if (!caseItem) return showToast("请先选择案件");
  if (!text.trim()) return showToast("请粘贴或导入庭审笔录文本");
  setSyncState("正在结构化笔录", "is-syncing");
  try {
    const data = await apiRequest("/api/hearing/transcribe", { method: "POST", body: { caseId: caseItem.id, text } });
    hearingTranscript = data;
    hearingSummary = null;
    setSyncState("已同步");
    showToast(`已结构化 ${data.segments?.length || 0} 段`);
  } catch (error) {
    setSyncState("结构化失败", "is-error");
    showToast(error.message);
  }
  renderPage();
}

// 庭审小结：本地启发式或可选 Claude 生成（仅依据笔录）。
async function runHearingSummary() {
  const caseItem = currentCase();
  if (!caseItem) return showToast("请先选择案件");
  const transcript = hearingTranscript?.text || (hearingTranscript?.segments || []).map(item => `${item.speaker ? item.speaker + "：" : ""}${item.text}`).join("\n");
  if (!transcript?.trim()) return showToast("请先转写或导入庭审笔录");
  setSyncState("正在生成庭审小结", "is-syncing");
  try {
    hearingSummary = await apiRequest("/api/hearing/summary", { method: "POST", body: { caseId: caseItem.id, transcript } });
    setSyncState("已同步");
  } catch (error) {
    hearingSummary = null;
    setSyncState("生成失败", "is-error");
    showToast(error.message);
  }
  renderPage();
}

// 文书 Agent：从案件材料抽取候选事实。
async function runFactExtraction() {
  const caseItem = currentCase();
  if (!caseItem) return showToast("请先选择案件");
  setSyncState("正在抽取事实", "is-syncing");
  try {
    const data = await apiRequest("/api/documents/facts", { method: "POST", body: { caseId: caseItem.id } });
    documentFacts = data.facts || [];
    documentTimeline = data.timeline || [];
    setSyncState("已同步");
    if (!documentFacts.length) showToast(data.filesScanned ? "未抽取到候选事实" : "请先在「证据管理」页上传案件材料");
  } catch (error) {
    setSyncState("抽取失败", "is-error");
    showToast(error.message);
  }
  renderPage();
}

// 文书 Agent：校验文书的法条引用与关键事实依据。
async function runDocumentVerify() {
  const caseItem = currentCase();
  if (!caseItem) return showToast("请先选择案件");
  documentDraft = document.querySelector("#document-editor")?.value || documentDraft;
  setSyncState("正在校验引用", "is-syncing");
  try {
    const data = await apiRequest("/api/documents/verify", { method: "POST", body: { caseId: caseItem.id, content: documentDraft } });
    documentVerification = data;
    documentReviewResults = [];
    recordAudit("文书引用校验", `${templateLabels[selectedTemplate]} · 未核验法条 ${data.unverifiedLegal} · 缺依据事实 ${data.ungroundedFacts}`);
    setSyncState("已同步");
    showToast(`校验完成：未核验法条 ${data.unverifiedLegal} · 缺依据事实 ${data.ungroundedFacts}`);
  } catch (error) {
    setSyncState("校验失败", "is-error");
    showToast(error.message);
  }
  renderPage();
}

async function refreshRemoteState() {
  const data = await apiRequest("/api/bootstrap");
  state = hydrateState(data.state);
  serverRevision = data.revision;
  if (!state.cases.some(item => item.id === state.activeCaseId)) state.activeCaseId = state.cases[0]?.id || "";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderCaseSelect();
  renderPage();
}

async function flushStateSync() {
  if (!apiMode || currentUser?.role === "client" || syncInFlight) return;
  syncInFlight = true;
  syncPending = false;
  setSyncState("正在同步", "is-syncing");
  try {
    const data = await apiRequest("/api/state", { method: "PUT", body: { revision: serverRevision, state } });
    serverRevision = data.revision;
    setSyncState("已同步");
  } catch (error) {
    if (error.code === "REVISION_CONFLICT") {
      setSyncState("数据有更新", "is-error");
      showToast("其他成员已更新数据，正在载入最新版本");
      await refreshRemoteState();
    } else {
      setSyncState("同步失败", "is-error");
      showToast(error.message);
    }
  } finally {
    syncInFlight = false;
    if (syncPending) flushStateSync();
  }
}

function queueStateSync() {
  if (!apiMode || currentUser?.role === "client") return;
  syncPending = true;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(flushStateSync, 250);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueStateSync();
}

function recordAudit(action, detail, caseId = state.activeCaseId) {
  if (!state.settings.audit) return;
  state.auditLogs.unshift({
    id: uid("audit"),
    action,
    detail,
    caseId,
    member: currentUser?.name || "当前用户",
    createdAt: new Date().toISOString()
  });
  state.auditLogs = state.auditLogs.slice(0, 100);
  if (apiMode) apiRequest("/api/audit", { method: "POST", body: { action, detail, caseId } }).catch(() => {});
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? escapeHTML(url.href) : "";
  } catch (error) {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "待确定";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "未知时间";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function daysUntil(value) {
  if (!value) return 9999;
  const target = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function currentCase() {
  return state.cases.find(item => item.id === state.activeCaseId) || state.cases[0];
}

function currentEvidence() {
  const caseItem = currentCase();
  return caseItem ? state.evidence.filter(item => item.caseId === caseItem.id) : [];
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toastElement.classList.remove("is-visible"), 1800);
}

function pageHead(extraActions = "") {
  const [title, subtitle] = routeMeta[activeRoute];
  return `
    <div class="page-head">
      <div class="page-title"><h1>${title}</h1><p>${subtitle}</p></div>
      ${extraActions ? `<div class="page-actions">${extraActions}</div>` : ""}
    </div>`;
}

function badge(text, tone = "") {
  return `<span class="badge ${tone}">${escapeHTML(text)}</span>`;
}

function toneForStatus(value) {
  if (["已核验", "已完成", "有效", "已提交"].includes(value)) return "green";
  if (["待补强", "高", "临近", "待申请调查"].includes(value)) return "red";
  if (["待核验", "中", "持续更新"].includes(value)) return "gold";
  return "teal";
}

function renderCaseSelect() {
  caseSelect.innerHTML = state.cases.filter(item => !item.archived).map(item => `<option value="${item.id}" ${item.id === state.activeCaseId ? "selected" : ""}>${escapeHTML(item.title)}</option>`).join("");
}

function deadlineItems() {
  const events = state.caseEvents
    .filter(item => item.status !== "已完成" && daysUntil(item.date) >= 0)
    .map(item => ({
      caseItem: state.cases.find(caseEntry => caseEntry.id === item.caseId),
      date: item.date,
      label: item.title,
      eventId: item.id
    }))
    .filter(item => item.caseItem);
  const fallback = state.cases
    .filter(caseItem => caseItem.nextDate && !events.some(item => item.caseItem.id === caseItem.id && item.date === caseItem.nextDate))
    .map(caseItem => ({ caseItem, date: caseItem.nextDate, label: caseItem.nextEvent || "案件节点" }));
  return [...events, ...fallback].filter(item => daysUntil(item.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
}

// 跨全部案件的同日庭审冲突(≥2 个案件同日庭审)。
function globalHearingConflicts() {
  const isHearing = item => /庭审|开庭/.test(`${item.type} ${item.title}`);
  const hearings = state.caseEvents.filter(item => item.status !== "已完成" && isHearing(item) && daysUntil(item.date) >= 0);
  const byDate = {};
  hearings.forEach(item => { (byDate[item.date] = byDate[item.date] || []).push(item); });
  return Object.entries(byDate)
    .map(([date, events]) => ({ date, cases: [...new Set(events.map(item => item.caseId))] }))
    .filter(item => item.cases.length >= 2)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function globalOverdueEvents() {
  return state.caseEvents
    .filter(item => item.status !== "已完成" && daysUntil(item.date) < 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 临近到期(60 天内)或已过有效期的法源,提示复核效力。
function expiringSources() {
  return legalSources
    .filter(item => item.validUntil && daysUntil(item.validUntil) <= 60)
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil));
}

function renderGlobalAlerts() {
  const conflicts = globalHearingConflicts();
  const overdue = globalOverdueEvents();
  const impacts = citationImpacts;
  const expiring = can("manage_settings") ? expiringSources() : [];
  if (!conflicts.length && !overdue.length && !impacts.length && !expiring.length) return "";
  const caseTitle = id => state.cases.find(item => item.id === id)?.title || "未知案件";
  return `<section class="panel alert-panel">
    <div class="panel-head"><div><h2>排期与法源风险提醒</h2><p>跨全部在办案件，一屏核对庭期、逾期、失效法源引用与法源到期</p></div>${badge(`${conflicts.length} 冲突 · ${overdue.length} 逾期 · ${impacts.length} 失效引用${expiring.length ? ` · ${expiring.length} 临近到期` : ""}`, conflicts.length || overdue.length || impacts.length || expiring.length ? "red" : "green")}</div>
    <div class="panel-body">
      ${conflicts.length ? `<div class="alert-group"><h3>同日庭期冲突</h3>${conflicts.map(item => `<div class="alert-row"><div><strong>${formatDate(item.date)}</strong><span>${item.cases.length} 个案件同日庭审，无法同时出庭</span></div><div class="alert-cases">${item.cases.map(id => `<button class="quiet-button" type="button" data-action="goto-case" data-id="${id}">${escapeHTML(caseTitle(id))}</button>`).join("")}</div></div>`).join("")}</div>` : ""}
      ${overdue.length ? `<div class="alert-group"><h3>逾期节点</h3>${overdue.slice(0, 8).map(item => `<div class="alert-row"><div><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(caseTitle(item.caseId))} · ${escapeHTML(item.date)} · 已过 ${Math.abs(daysUntil(item.date))} 天</span></div><button class="quiet-button" type="button" data-action="goto-case" data-id="${item.caseId}">查看</button></div>`).join("")}${overdue.length > 8 ? `<div class="source-line" style="margin-top:6px;">…另有 ${overdue.length - 8} 项逾期</div>` : ""}</div>` : ""}
      ${impacts.length ? `<div class="alert-group"><h3>文书引用失效法源</h3>${impacts.map(item => `<div class="alert-row"><div><strong>${escapeHTML(item.document)} ${escapeHTML(item.version)}</strong><span>${escapeHTML(item.caseTitle || "")} · 引用：${item.lapsed.map(law => `《${escapeHTML(law.source)}》（${escapeHTML(law.status)}）`).join("、")}</span></div><div class="alert-cases">${item.documentId ? `<button class="quiet-button" type="button" data-action="locate-citation" data-doc="${escapeHTML(item.documentId)}">定位引用</button>` : ""}<button class="quiet-button" type="button" data-action="goto-case" data-id="${item.caseId}">查看案件</button></div></div>`).join("")}</div>` : ""}
      ${expiring.length ? `<div class="alert-group"><h3>法源临近到期</h3>${expiring.map(item => { const d = daysUntil(item.validUntil); return `<div class="alert-row"><div><strong>${escapeHTML(item.title)}</strong><span>有效期至 ${escapeHTML(item.validUntil)} · ${d < 0 ? `已过期 ${Math.abs(d)} 天` : d === 0 ? "今日到期" : `${d} 天后到期`} · 当前状态「${escapeHTML(item.status)}」</span></div><button class="quiet-button" type="button" data-action="edit-legal-source" data-id="${escapeHTML(item.id)}">复核维护</button></div>`; }).join("")}</div>` : ""}
    </div>
  </section>`;
}

// 在文书内容中高亮引用了失效法源的引用词与所在段落。
function highlightCitations(content, refs) {
  const escapedRefs = [...new Set(refs.filter(Boolean))].map(escapeHTML);
  return String(content).replace(/\r\n?/g, "\n").split("\n").map(line => {
    let html = escapeHTML(line);
    let hit = false;
    for (const ref of escapedRefs) {
      if (ref && html.includes(ref)) { hit = true; html = html.split(ref).join(`<mark>${ref}</mark>`); }
    }
    return `<div class="cite-line ${hit ? "is-hit" : ""}">${html || "&nbsp;"}</div>`;
  }).join("");
}

// 根据失效法源的引用词与标题主题,推荐替换检索关键词。
function suggestReplacementQuery(impact) {
  const terms = new Set();
  for (const law of impact?.lapsed || []) {
    if (law.ref) terms.add(law.ref);
    const concept = String(law.source || "").split(/[（(·。]/)[0].trim();
    if (concept && concept.length >= 2 && concept.length <= 16) terms.add(concept);
  }
  return [...terms].join(" ");
}

async function runReplacementSearch() {
  if (!replaceQuery.trim()) { replacementResults = []; renderLocateDialog(); return; }
  try {
    const data = await apiRequest("/api/legal/search", { method: "POST", body: { query: replaceQuery, limit: 6, includeLapsed: false } });
    replacementResults = data.results || [];
  } catch (error) {
    replacementResults = [];
    showToast(error.message);
  }
  renderLocateDialog();
}

function locateCitationDialog(docId) {
  const impact = citationImpacts.find(item => item.documentId === docId);
  const version = state.documentVersions.find(item => item.id === docId);
  if (!version || !version.content) return showToast("该文书版本未保存正文，无法定位（请重新保存版本）");
  const refs = impact ? [...new Set(impact.lapsed.map(law => law.ref).filter(Boolean))] : [];
  const lawList = impact ? impact.lapsed.map(law => `《${escapeHTML(law.source)}》（${escapeHTML(law.status)}）`).join("、") : "";
  locateContext = { docId, refs, name: version.name, version: version.version, content: version.content, lawList };
  replacementResults = [];
  replacementChoice = "";
  replaceQuery = suggestReplacementQuery(impact);
  renderLocateDialog();
  dialog.showModal();
  if (can("export_documents") && replaceQuery.trim()) runReplacementSearch();
}

function renderLocateDialog() {
  if (!locateContext) return;
  const ctx = locateContext;
  const canReplace = can("export_documents") && ctx.refs.length;
  const replacePanel = canReplace ? `<div class="replace-panel">
    <div class="agent-head" style="margin:12px 0 6px;"><strong>替换依据（已按失效法源主题智能预填，仅检索现行有效法源）</strong>${replacementChoice ? `<span>已选用：《${escapeHTML(replacementChoice)}》</span>` : ""}</div>
    <div class="toolbar" style="padding:0;background:none;border:none;">
      <input id="replace-search" type="search" placeholder="检索替换用的现行有效法源" value="${escapeHTML(replaceQuery)}" />
      <button class="secondary-button" type="button" data-action="replace-search">检索</button>
      ${replacementChoice ? `<button class="primary-button" type="button" data-action="apply-replacement">替换并存为新版本</button>` : ""}
    </div>
    <div class="replace-results">${replacementResults.map(item => `<div class="replace-item"><div><strong>${escapeHTML(item.title)}</strong><span class="source-line">${escapeHTML(item.authority)} · ${escapeHTML(item.status)}</span></div><button class="quiet-button" type="button" data-action="choose-replacement" data-title="${escapeHTML(item.title)}">${replacementChoice === item.title ? "已选" : "选用"}</button></div>`).join("") || `<div class="source-line" style="padding:6px 2px;">输入关键词检索现行有效法源作为替换依据。</div>`}</div>
  </div>` : "";
  dialogContent.innerHTML = `<div class="dialog-head"><h2>引用定位与替换 · ${escapeHTML(ctx.name)} ${escapeHTML(ctx.version)}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
    <div class="dialog-body">
      ${ctx.lawList ? `<div class="disclaimer" style="margin-bottom:10px;">高亮段落引用了失效法源：${ctx.lawList}，请更换为现行有效依据。</div>` : ""}
      <div class="cite-doc">${highlightCitations(ctx.content, ctx.refs)}</div>
      ${replacePanel}
    </div>
    <div class="dialog-actions"><button class="primary-button" type="button" data-action="close-dialog">关闭</button></div>`;
}

function renderDashboard() {
  const deadlines = deadlineItems();
  const urgent = deadlines.filter(item => daysUntil(item.date) <= 7).length;
  const gaps = state.evidence.filter(item => item.status !== "已核验").length;
  const hours = state.timeLogs.reduce((sum, item) => sum + Number(item.hours || 0), 0);
  const timeline = deadlines.slice(0, 6);
  const openTasks = state.tasks.filter(item => !item.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);

  return `
    ${pageHead(`<button class="secondary-button" type="button" data-route="collaboration">查看团队任务</button>`)}
    <div class="metric-grid">
      <article class="metric-card"><div class="metric-label">在办案件</div><div class="metric-value">${state.cases.length}</div><div class="metric-note">覆盖 ${new Set(state.cases.map(item => item.stage)).size} 个流程阶段</div></article>
      <article class="metric-card gold"><div class="metric-label">七日内关键节点</div><div class="metric-value">${urgent}</div><div class="metric-note">期限计算仍需人工核验送达信息</div></article>
      <article class="metric-card red"><div class="metric-label">待核验证据</div><div class="metric-value">${gaps}</div><div class="metric-note">含待补强和真实性待核验材料</div></article>
      <article class="metric-card blue"><div class="metric-label">已记录工时</div><div class="metric-value">${hours.toFixed(1)}</div><div class="metric-note">本地工作区累计小时</div></article>
    </div>
    ${renderGlobalAlerts()}
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head"><div><h2>近期案件节点</h2><p>按日期自动排序</p></div><button class="quiet-button" type="button" data-route="cases">案件台账</button></div>
        <div class="panel-body timeline">
          ${timeline.length ? timeline.map(item => {
            const remaining = daysUntil(item.date);
            return `<div class="timeline-item">
              <div class="timeline-date">${formatDate(item.date)}<br>${remaining === 0 ? "今天" : `${remaining} 天后`}</div>
              <div class="timeline-track"></div>
              <div><div class="timeline-title">${escapeHTML(item.label)}</div><div class="timeline-meta">${escapeHTML(item.caseItem.title)} · ${escapeHTML(item.caseItem.court)}</div></div>
              ${badge(remaining <= 3 ? "紧急" : item.caseItem.stage, remaining <= 3 ? "red" : "teal")}
            </div>`;
          }).join("") : `<div class="empty-state"><strong>暂无近期节点</strong>可在案件中补充下一节点日期。</div>`}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>团队待办</h2><p>${state.tasks.filter(item => !item.done).length} 项未完成</p></div>${can("manage_tasks") ? `<button class="quiet-button" type="button" data-action="add-task">新增</button>` : ""}</div>
        <div class="panel-body">
          <div class="case-list">
            ${openTasks.map(task => `<div class="case-meta" style="padding: 8px 0; border-bottom: 1px solid var(--line);">
              <strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(task.owner)} · ${formatDate(task.dueDate)} · ${escapeHTML(state.cases.find(item => item.id === task.caseId)?.title || "未关联案件")}</span>
            </div>`).join("") || `<div class="empty-state"><strong>待办已清空</strong>团队任务都已完成。</div>`}
          </div>
        </div>
      </section>
    </div>`;
}

function caseEventsFor(caseId) {
  return state.caseEvents.filter(item => item.caseId === caseId).sort((a, b) => a.date.localeCompare(b.date));
}

function renderCaseOverview(caseItem) {
  const evidence = state.evidence.filter(item => item.caseId === caseItem.id);
  const tasks = state.tasks.filter(item => item.caseId === caseItem.id && !item.done);
  const nextEvents = caseEventsFor(caseItem.id).filter(item => item.status !== "已完成" && daysUntil(item.date) >= 0).slice(0, 3);
  return `
    <div class="case-summary-grid">
      <div class="summary-item"><span>委托人</span><strong>${escapeHTML(caseItem.client)}</strong><small>对方：${escapeHTML(caseItem.opposingParty)}</small></div>
      <div class="summary-item"><span>案件标的</span><strong>${money(caseItem.amount)}</strong><small>${escapeHTML(caseItem.cause)}</small></div>
      <div class="summary-item"><span>证据状态</span><strong>${evidence.filter(item => item.status === "已核验").length} / ${evidence.length}</strong><small>已核验 / 总数</small></div>
      <div class="summary-item"><span>团队待办</span><strong>${tasks.length}</strong><small>${tasks.filter(item => daysUntil(item.dueDate) <= 3).length} 项三日内到期</small></div>
    </div>
    <div class="case-brief-grid">
      <section><h3>诉讼请求</h3><p>${escapeHTML(caseItem.claims || "尚未录入")}</p></section>
      <section><h3>基本事实</h3><p>${escapeHTML(caseItem.facts || "尚未录入")}</p></section>
    </div>
    <div class="dossier-next">
      <h3>下一步</h3>
      ${nextEvents.map(item => `<div class="next-row"><div><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.source)} · ${escapeHTML(item.note || "无备注")}</span></div><div>${badge(`${formatDate(item.date)} · ${daysUntil(item.date)} 天`, daysUntil(item.date) <= 3 ? "red" : "gold")}</div></div>`).join("") || `<div class="empty-state"><strong>暂无待办节点</strong>可以新增案件节点或期限。</div>`}
    </div>`;
}

// 分析案件程序时间轴：逾期、临近(三日内)、同日多项待办、跨案庭审冲突。
function timelineAlerts(caseItem) {
  const pending = caseEventsFor(caseItem.id).filter(item => item.status !== "已完成");
  const overdue = pending.filter(item => daysUntil(item.date) < 0);
  const imminent = pending.filter(item => { const d = daysUntil(item.date); return d >= 0 && d <= 3; });
  const dateCount = {};
  pending.forEach(item => { dateCount[item.date] = (dateCount[item.date] || 0) + 1; });
  const sameDay = Object.keys(dateCount).filter(date => dateCount[date] >= 2);
  const isHearing = item => /庭审|开庭/.test(`${item.type} ${item.title}`);
  const crossCase = [];
  for (const date of new Set(pending.filter(isHearing).map(item => item.date))) {
    const clashes = state.caseEvents.filter(item => item.caseId !== caseItem.id && item.status !== "已完成" && item.date === date && isHearing(item));
    if (clashes.length) crossCase.push({ date, cases: [...new Set(clashes.map(item => state.cases.find(c => c.id === item.caseId)?.title || "其他案件"))] });
  }
  return { overdue, imminent, sameDay, crossCase };
}

function renderTimelineAlerts(caseItem) {
  const alerts = timelineAlerts(caseItem);
  const chips = [];
  const names = list => escapeHTML(list.slice(0, 2).map(item => item.title).join("、")) + (list.length > 2 ? "…" : "");
  if (alerts.overdue.length) chips.push(`<span class="alert-chip red">逾期 ${alerts.overdue.length} 项：${names(alerts.overdue)}</span>`);
  if (alerts.imminent.length) chips.push(`<span class="alert-chip gold">三日内 ${alerts.imminent.length} 项：${names(alerts.imminent)}</span>`);
  for (const date of alerts.sameDay) chips.push(`<span class="alert-chip teal">${formatDate(date)} 同日多项待办，注意排期</span>`);
  for (const clash of alerts.crossCase) chips.push(`<span class="alert-chip red">${formatDate(clash.date)} 庭审与《${escapeHTML(clash.cases[0])}》冲突</span>`);
  if (!chips.length) return "";
  return `<div class="timeline-alerts">${chips.join("")}</div>`;
}

function renderCaseTimeline(caseItem) {
  const events = caseEventsFor(caseItem.id);
  return `${renderTimelineAlerts(caseItem)}<div class="case-event-list">
    ${events.map(item => {
      const remaining = daysUntil(item.date);
      const pending = item.status !== "已完成";
      const flag = pending && remaining < 0 ? badge("逾期", "red") : pending && remaining <= 3 ? badge("临近", "gold") : "";
      return `<div class="case-event-row">
      <div class="event-date">${formatDate(item.date)}<span>${remaining >= 0 ? `${remaining} 天后` : `${Math.abs(remaining)} 天前`}</span></div>
      <div class="event-rail"><span class="${item.status === "已完成" ? "is-done" : ""}"></span></div>
      <div class="event-content"><strong>${escapeHTML(item.title)}</strong> ${flag}<p>${escapeHTML(item.note || "无补充说明")}</p><small>${escapeHTML(item.type)} · 来源：${escapeHTML(item.source)}</small></div>
      ${(can("edit_case") || can("manage_tasks")) ? `<button class="quiet-button" type="button" data-action="toggle-event" data-id="${item.id}">${badge(item.status, item.status === "已完成" ? "green" : "gold")}</button>` : badge(item.status, item.status === "已完成" ? "green" : "gold")}
    </div>`;
    }).join("") || `<div class="empty-state"><strong>暂无时间轴</strong>新增第一个案件节点。</div>`}
  </div>`;
}

function renderCaseDeadlines(caseItem) {
  const deadlines = caseEventsFor(caseItem.id).filter(item => item.type.includes("期限") || item.type === "庭审" || item.status !== "已完成");
  return `${renderTimelineAlerts(caseItem)}<div class="data-table-wrap"><table class="data-table deadline-table">
    <thead><tr><th>日期</th><th>期限 / 节点</th><th>来源</th><th>剩余时间</th><th>状态</th></tr></thead>
    <tbody>${deadlines.map(item => {
      const remaining = daysUntil(item.date);
      const timeText = remaining < 0 ? `已过 ${Math.abs(remaining)} 天` : remaining === 0 ? "今天" : `${remaining} 天`;
      return `<tr><td><strong>${escapeHTML(item.date)}</strong></td><td><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.note || "无备注")}</small></td><td>${escapeHTML(item.source)}</td><td>${badge(timeText, item.status === "已完成" ? "green" : remaining <= 3 ? "red" : "gold")}</td><td>${(can("edit_case") || can("manage_tasks")) ? `<button class="quiet-button" type="button" data-action="toggle-event" data-id="${item.id}">${badge(item.status, item.status === "已完成" ? "green" : "teal")}</button>` : badge(item.status, item.status === "已完成" ? "green" : "teal")}</td></tr>`;
    }).join("") || `<tr><td colspan="5"><div class="empty-state"><strong>暂无限期记录</strong>添加法院通知或内部控制节点。</div></td></tr>`}</tbody>
  </table></div>`;
}

// 常见法定/指定期间(以现行规定为准,举证期限由法院指定故可改)。
const DEADLINE_TYPES = [
  { key: "judgment", label: "一审判决（上诉期）", days: 15, title: "上诉期限届满", editable: false },
  { key: "ruling", label: "裁定（上诉期）", days: 10, title: "上诉期限届满", editable: false },
  { key: "defense", label: "起诉状副本（答辩期）", days: 15, title: "答辩期限届满", editable: false },
  { key: "evidence", label: "举证通知（举证期限）", days: 15, title: "举证期限届满", editable: true },
  { key: "appealDefense", label: "上诉状副本（二审答辩期）", days: 15, title: "二审答辩期限届满", editable: false }
];

function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekend(iso) {
  const day = new Date(`${iso}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

// 离线兜底节假日表(仅 file:// 本地演示或服务端不可用时使用)。
// 服务端模式下由 loadHolidays() 用「平台与安全」集中维护的数据覆盖,实现一处更新全员生效。
const FALLBACK_HOLIDAYS = {
  "2025": {
    verified: true,
    holidays: [
      "2025-01-01",
      "2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02", "2025-02-03", "2025-02-04",
      "2025-04-04", "2025-04-05", "2025-04-06",
      "2025-05-01", "2025-05-02", "2025-05-03", "2025-05-04", "2025-05-05",
      "2025-05-31", "2025-06-01", "2025-06-02",
      "2025-10-01", "2025-10-02", "2025-10-03", "2025-10-04", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08"
    ],
    workdays: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"]
  },
  "2026": {
    verified: false,
    holidays: [
      "2026-01-01",
      "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22",
      "2026-04-04", "2026-04-05", "2026-04-06",
      "2026-05-01", "2026-05-02", "2026-05-03",
      "2026-06-19", "2026-06-20", "2026-06-21",
      "2026-09-25", "2026-09-26", "2026-09-27",
      "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"
    ],
    workdays: []
  }
};

// 运行时节假日表:默认离线兜底,服务端模式下由 loadHolidays() 覆盖为集中维护数据。
let holidayCalendars = FALLBACK_HOLIDAYS;

// 末日是否为非工作日:法定节假日为是;调休上班的周末为否;否则按周末判断。
function isNonWorkingDay(iso) {
  const table = holidayCalendars[iso.slice(0, 4)];
  if (table) {
    if (table.workdays.includes(iso)) return false;
    if (table.holidays.includes(iso)) return true;
  }
  return isWeekend(iso);
}

// 期间自送达次日起算 days 日(末日 = 送达日 + days);末日遇周末或法定节假日顺延至下一工作日。
function computeStatutoryDeadline(serviceDate, days) {
  let deadline = addDaysISO(serviceDate, days);
  let shifted = false;
  while (isNonWorkingDay(deadline)) { deadline = addDaysISO(deadline, 1); shifted = true; }
  const table = holidayCalendars[deadline.slice(0, 4)];
  return { deadline, shifted, holidayLoaded: Boolean(table), holidayVerified: Boolean(table?.verified) };
}

function deadlineCalculatorDialog() {
  const options = DEADLINE_TYPES.map(type => `<option value="${type.key}">${type.label}（${type.days} 日）</option>`).join("");
  dialogContent.innerHTML = `
    <div class="dialog-head"><h2>期限推算</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
    <div class="dialog-body">
      <form id="deadline-form" class="form-grid">
        <div class="form-field"><label>送达日期</label><input id="deadline-service-date" type="date" value="${dateFromNow(0)}"></div>
        <div class="form-field"><label>文书类型</label><select id="deadline-type">${options}</select></div>
        <div class="form-field"><label>期间天数（可改）</label><input id="deadline-days" type="number" min="1" max="180" value="15"></div>
      </form>
      <div id="deadline-result" class="deadline-result"></div>
      <div class="disclaimer" style="margin-top:10px;">期间自送达<strong>次日</strong>起算，末日遇周末自动顺延；法定节假日顺延、公告送达等情形须人工核验。</div>
    </div>
    <div class="dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">关闭</button><button class="primary-button" type="button" data-action="write-deadline">写入程序时间轴</button></div>`;
  dialog.showModal();
  renderDeadlineResult();
}

function renderDeadlineResult() {
  const container = document.querySelector("#deadline-result");
  if (!container) return;
  const serviceDate = document.querySelector("#deadline-service-date")?.value;
  const typeKey = document.querySelector("#deadline-type")?.value;
  const days = Number(document.querySelector("#deadline-days")?.value) || 0;
  const type = DEADLINE_TYPES.find(item => item.key === typeKey);
  if (!serviceDate || days <= 0) { container.innerHTML = ""; pendingDeadline = null; return; }
  const { deadline, shifted, holidayLoaded, holidayVerified } = computeStatutoryDeadline(serviceDate, days);
  const remaining = daysUntil(deadline);
  pendingDeadline = { date: deadline, title: type?.title || "期限届满", days, serviceDate };
  const holidayNote = !holidayLoaded ? "；该年度法定节假日未载入，仅按周末顺延" : (!holidayVerified ? "；该年度节假日为示例，请按国务院公告核对" : "");
  container.innerHTML = `<strong>${escapeHTML(type?.title || "期限届满")}：${deadline}</strong>
    <span>自送达次日起算 ${days} 日${shifted ? "（末日遇非工作日已顺延至工作日）" : ""} · 距今 ${remaining >= 0 ? `${remaining} 天` : `已过 ${Math.abs(remaining)} 天`}${holidayNote}</span>`;
}

// 受理/应诉通知送达后，一次推算的法定期间(举证期限由法院指定，可改)。
const BATCH_DEADLINES = [
  { key: "defense", label: "答辩期限（15 日）", title: "答辩期限届满", days: 15 },
  { key: "jurisdiction", label: "管辖权异议（15 日）", title: "管辖权异议期限届满", days: 15 },
  { key: "evidence", label: "举证期限（可改）", title: "举证期限届满", days: 15 }
];

function batchDeadlineDialog() {
  const rows = BATCH_DEADLINES.map(row => `<div class="batch-row">
    <label class="batch-check"><input type="checkbox" id="batch-${row.key}-on" checked> ${row.label}</label>
    <input class="batch-days" type="number" id="batch-${row.key}-days" min="1" max="180" value="${row.days}">
    <span class="batch-date" id="batch-${row.key}-date"></span>
  </div>`).join("");
  dialogContent.innerHTML = `
    <div class="dialog-head"><h2>批量排期（按受理 / 应诉通知）</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
    <div class="dialog-body">
      <div class="form-field"><label>通知送达日期</label><input id="batch-service-date" type="date" value="${dateFromNow(0)}"></div>
      <div class="batch-list">${rows}</div>
      <div class="form-field" style="margin-top:10px;"><label>开庭日期（如已收到传票，可选登记）</label><input id="batch-hearing-date" type="date"></div>
      <div class="disclaimer" style="margin-top:10px;">举证期限由法院指定，请按举证通知核对；期间自送达次日起算并按节假日顺延。开庭日期由法院传票确定，此处仅登记。</div>
    </div>
    <div class="dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">关闭</button><button class="primary-button" type="button" data-action="write-batch">全部写入程序时间轴</button></div>`;
  dialog.showModal();
  renderBatchRows();
}

function renderBatchRows() {
  const service = document.querySelector("#batch-service-date")?.value;
  for (const row of BATCH_DEADLINES) {
    const span = document.querySelector(`#batch-${row.key}-date`);
    if (!span) continue;
    const days = Number(document.querySelector(`#batch-${row.key}-days`)?.value) || 0;
    if (!service || days <= 0) { span.textContent = ""; continue; }
    const { deadline, shifted } = computeStatutoryDeadline(service, days);
    span.textContent = `→ ${deadline}${shifted ? "（顺延）" : ""}`;
  }
}

function renderCases() {
  const active = currentCase();
  const stageIndex = active ? stages.indexOf(active.stage) : 0;
  const actions = [
    (can("edit_case") || can("manage_tasks")) ? `<button class="secondary-button" type="button" data-action="deadline-calc">期限推算</button>` : "",
    (can("edit_case") || can("manage_tasks")) ? `<button class="secondary-button" type="button" data-action="deadline-batch">批量排期</button>` : "",
    can("edit_case") ? `<button class="secondary-button" type="button" data-action="add-case-event">＋ 新增节点</button>` : "",
    can("edit_case") ? `<button class="secondary-button" type="button" data-action="edit-case">编辑当前案件</button>` : "",
    can("create_case") ? `<button class="primary-button" type="button" data-action="new-case">＋ 新建案件</button>` : ""
  ].join("");
  const dossierBody = active
    ? caseViewMode === "timeline" ? renderCaseTimeline(active) : caseViewMode === "deadlines" ? renderCaseDeadlines(active) : renderCaseOverview(active)
    : "";
  return `
    ${pageHead(actions)}
    ${active ? `<div class="stage-strip">${stages.map((stage, index) => `<div class="stage-item ${index < stageIndex ? "is-done" : ""} ${index === stageIndex ? "is-current" : ""}">${escapeHTML(stage)}</div>`).join("")}</div>
      <section class="panel case-dossier">
        <div class="dossier-head">
          <div><div class="dossier-kicker">${escapeHTML(active.caseNo)}</div><h2>${escapeHTML(active.title)}</h2><p>${escapeHTML(active.court)} · 当前阶段 ${escapeHTML(active.stage)}</p></div>
          <div class="segmented" aria-label="案件档案视图">
            <button type="button" class="segment-button ${caseViewMode === "overview" ? "is-active" : ""}" data-action="case-view" data-mode="overview">案情概览</button>
            <button type="button" class="segment-button ${caseViewMode === "timeline" ? "is-active" : ""}" data-action="case-view" data-mode="timeline">时间轴</button>
            <button type="button" class="segment-button ${caseViewMode === "deadlines" ? "is-active" : ""}" data-action="case-view" data-mode="deadlines">期限台账</button>
          </div>
        </div>
        <div class="dossier-body">${dossierBody}</div>
      </section>` : ""}
    <div class="section-label"><h2>全部案件</h2><span>${state.cases.filter(item => !item.archived).length} 件</span></div>
    <div class="case-list">
      ${state.cases.filter(item => !item.archived).map(item => {
        const remaining = daysUntil(item.nextDate);
        return `<article class="case-card">
          <div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.caseNo)} · ${escapeHTML(item.court)}</p></div>
          <div class="case-meta"><strong>${escapeHTML(item.stage)}</strong><span>${escapeHTML(item.cause)}</span></div>
          <div class="case-meta"><strong>${escapeHTML(item.nextEvent)}</strong><span>${formatDate(item.nextDate)} · ${remaining >= 0 ? `${remaining} 天后` : "已到期"}</span></div>
          <div class="risk-cell"><div>${badge(`风险 ${item.risk}`, item.risk >= 60 ? "red" : item.risk >= 45 ? "gold" : "green")}</div><div class="risk-bar"><span style="width:${Math.min(item.risk, 100)}%"></span></div></div>
          <button class="secondary-button" type="button" data-action="set-case" data-id="${item.id}">${item.id === state.activeCaseId ? "当前" : "打开"}</button>
        </article>`;
      }).join("")}
    </div>`;
}

function searchKnowledge(query, level) {
  const normalized = query.trim().toLowerCase();
  return knowledgeBase.filter(item => {
    const matchesLevel = level === "全部" || item.level === level;
    const haystack = `${item.title} ${item.summary} ${item.excerpt} ${item.tags.join(" ")}`.toLowerCase();
    return matchesLevel && (!normalized || haystack.includes(normalized) || [...normalized].filter(char => char.trim()).some(char => haystack.includes(char)));
  });
}

function renderSearch() {
  const levels = ["全部", ...new Set(knowledgeBase.map(item => item.level))];
  const localResults = searchKnowledge(legalQuery, legalLevel);
  const isRag = apiMode;
  const results = isRag ? (legalRagResults || []) : localResults;
  return `
    ${pageHead(can("manage_settings") && apiMode ? `<button class="secondary-button" type="button" data-action="import-legal-json">批量导入 JSON</button><button class="primary-button" type="button" data-action="add-legal-source">＋ 导入正式法源</button>` : "")}
    <section class="panel">
      <div class="toolbar">
        <input id="legal-search-input" type="search" value="${escapeHTML(legalQuery)}" placeholder="输入争议焦点、法条主题或实务问题" aria-label="检索关键词" />
        ${apiMode ? badge(`${legalSources.length} 个正式法源`, legalSources.length ? "green" : "gold") : `<select id="legal-level-filter" aria-label="效力层级">${levels.map(level => `<option ${level === legalLevel ? "selected" : ""}>${escapeHTML(level)}</option>`).join("")}</select>`}
        ${apiMode ? `<label class="search-toggle"><input type="checkbox" id="legal-include-lapsed" ${legalIncludeLapsed ? "checked" : ""}>显示已失效法源</label>` : ""}
        <button class="primary-button" type="button" data-action="run-search">检索</button>
      </div>
      <div class="panel-body">
        <div class="disclaimer" style="margin-bottom:12px;">${apiMode ? `检索默认仅显示现行有效/待核验法源，已自动隐藏已废止、已失效或已修改的法源${legalIncludeLapsed ? "（当前已包含失效法源）" : ""}。引用前仍应核对完整条文与现行效力。` : "当前为离线样例知识库。法条效力与裁判规则必须通过正式法源再次核验。"}</div>
        <div class="search-results">
          ${results.map(item => isRag ? `<article class="search-card">
            <h3>${escapeHTML(item.title)}</h3>
            <p>${escapeHTML(item.content)}</p>
            <div class="source-line">${escapeHTML(item.authority)} · 引用片段 ${escapeHTML(item.chunkId)}${safeExternalUrl(item.sourceUrl) ? ` · <a href="${safeExternalUrl(item.sourceUrl)}" target="_blank" rel="noopener">正式来源</a>` : ""}</div>
            <div class="search-meta">${badge(item.level, "blue")}${badge(item.status, item.status.includes("有效") ? "green" : "gold")}${badge(`相关度 ${item.score}`, "teal")}</div>
          </article>` : `<article class="search-card">
            <h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.summary)}</p>
            <div class="source-line">${escapeHTML(item.source)} · 更新 ${escapeHTML(item.updatedAt)}</div>
            <div class="search-meta">${badge(item.level, "blue")}${badge(item.status, item.status === "持续更新" ? "teal" : "gold")}${item.tags.map(tag => badge(tag)).join("")}</div>
          </article>`).join("") || `<div class="empty-state"><strong>${apiMode && legalRagResults === null ? "开始检索" : "没有匹配结果"}</strong>${apiMode ? (legalRagResults === null ? "输入关键词后点击检索，结果来自工作区法源库（含内置条文级样例语料）。" : "未检索到相关法源，请调整关键词或由管理员导入更多正式法源。") : "尝试缩短关键词或调整检索问题。"}</div>`}
        </div>
      </div>
    </section>
    ${can("manage_settings") && apiMode && legalSources.length ? `<section class="panel" style="margin-top:16px;"><div class="panel-head"><div><h2>法源库</h2><p>效力状态由导入人员负责维护，变更自动留痕</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>法源</th><th>发布机关</th><th>层级</th><th>状态</th><th>索引/变更</th><th>操作</th></tr></thead><tbody>${legalSources.map(source => `<tr><td><strong>${escapeHTML(source.title)}</strong><small>生效 ${escapeHTML(source.effectiveDate || "待核验")} · 更新 ${source.updatedAt ? formatDate(source.updatedAt) : "—"}</small></td><td>${escapeHTML(source.authority)}</td><td>${badge(source.level, "blue")}</td><td>${badge(source.status, source.status.includes("有效") ? "green" : "gold")}</td><td>${source.chunkCount} 片段${source.revisionCount ? ` · ${source.revisionCount} 留痕` : ""}</td><td><div class="table-actions"><button class="quiet-button" type="button" data-action="edit-legal-source" data-id="${source.id}">编辑</button><button class="quiet-button" type="button" data-action="legal-revisions" data-id="${source.id}">变更记录</button><button class="quiet-button" type="button" data-action="delete-legal-source" data-id="${source.id}">删除</button></div></td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
}

// 由证据链矩阵生成「证据缺口与补强提示」，供文书生成直接引用。
function evidenceGapNote(caseItem) {
  const items = state.evidence.filter(item => item.caseId === caseItem?.id);
  if (!items.length) return "\n\n【证据链提示】当前案件尚未录入证据，请补充证据材料并关联待证事实后再行提交。";
  const matrix = evidenceMatrix(items);
  const gaps = matrix.filter(row => row.verified < row.evidence.length || !row.hasStrong);
  if (!gaps.length) return "\n\n【证据链提示】各待证事实证据均已核验且具备较强证明力，提交前仍请交叉复核。";
  const lines = gaps.map((row, index) => `${index + 1}. ${row.fact}：${row.verified}/${row.evidence.length} 已核验${row.hasStrong ? "" : "，缺较强原始证据"}；建议${row.suggestions.join("、")}。`);
  return `\n\n【证据链与补强提示（提交前处理）】\n${lines.join("\n")}`;
}

function generateDocument(template, caseItem) {
  if (!caseItem) return "请先新建并选择案件。";
  const evidence = state.evidence.filter(item => item.caseId === caseItem.id);
  const evidenceText = evidence.length
    ? evidence.map((item, index) => `${index + 1}. ${item.name}：${item.fact}。`).join("\n")
    : "暂无已录入证据，请补充证据材料。";
  const header = `案件：${caseItem.title}\n案号：${caseItem.caseNo}\n受理法院：${caseItem.court}`;
  const verify = "\n\n【系统提示】本稿根据已录入信息自动生成。事实、请求、金额、管辖、期限和法律依据须由办案人员核验后使用。";
  const templates = {
    complaint: `民事起诉状\n\n原告：${caseItem.client}\n被告：${caseItem.opposingParty}\n\n诉讼请求\n${caseItem.claims}\n\n事实与理由\n${caseItem.facts}\n\n证据概览\n${evidenceText}\n\n此致\n${caseItem.court}\n\n具状人：${caseItem.client}\n日期：____年__月__日`,
    defense: `民事答辩状\n\n答辩人：${caseItem.client}\n对方当事人：${caseItem.opposingParty}\n\n答辩意见\n一、对对方请求权基础及事实主张逐项回应。\n二、结合合同履行、证据真实性和损失计算提出抗辩。\n三、对程序事项和期限事项进行独立核验。\n\n案件事实摘要\n${caseItem.facts}\n\n拟引用证据\n${evidenceText}\n\n此致\n${caseItem.court}`,
    evidenceList: `证据目录\n\n${header}\n\n${evidence.map((item, index) => `${index + 1}. ${item.name}\n   类型：${item.type}\n   来源：${item.source}\n   证明目的：${item.fact}\n   核验状态：${item.status}`).join("\n\n") || "暂无证据记录。"}\n\n提交人：${caseItem.client}\n日期：____年__月__日`,
    opinion: `代理词\n\n${header}\n\n审判长、审判员：\n受${caseItem.client}委托，现结合庭审和在案证据发表如下代理意见：\n\n一、案件事实与合同履行情况\n${caseItem.facts}\n\n二、争议焦点\n1. 双方权利义务及履行情况如何认定；\n2. 现有证据能否形成完整证据链；\n3. 请求金额及损失计算是否具有事实和法律依据。\n\n三、证据分析\n${evidenceText}\n\n四、代理意见\n请结合经质证的证据依法支持我方有事实与法律依据的主张。`,
    appeal: `民事上诉状\n\n上诉人：${caseItem.client}\n被上诉人：${caseItem.opposingParty}\n\n上诉请求\n请根据一审裁判主文、具体异议和上诉利益补充。\n\n事实与理由\n一、一审事实认定需复核之处：____。\n二、证据采信与证明责任分配需复核之处：____。\n三、法律适用需复核之处：____。\n\n相关案件事实\n${caseItem.facts}\n\n此致\n有管辖权的上级人民法院`,
    execution: `强制执行申请书\n\n申请执行人：${caseItem.client}\n被执行人：${caseItem.opposingParty}\n\n执行依据\n${caseItem.caseNo}\n\n执行请求\n${caseItem.claims}\n\n事实与理由\n相关法律文书已经发生法律效力，被执行人未按期履行确定义务，现申请依法强制执行。\n\n财产线索\n${state.assetClues.filter(item => item.caseId === caseItem.id).map((item, index) => `${index + 1}. ${item.type}：${item.description}（${item.status}）`).join("\n") || "暂无已录入财产线索。"}\n\n此致\n${caseItem.court}`
  };
  const gapNote = ["complaint", "defense", "opinion", "evidenceList"].includes(template) ? evidenceGapNote(caseItem) : "";
  return (templates[template] || templates.complaint) + gapNote + verify;
}

function reviewDocument(content, caseItem) {
  const findings = [];
  const add = (level, title, detail) => findings.push({ level, title, detail });
  const evidence = state.evidence.filter(item => item.caseId === caseItem?.id);
  const pendingEvidence = evidence.filter(item => item.status !== "已核验");

  if (/_{2,}|待确定|待补充|请根据/.test(content)) add("high", "存在未完成占位内容", "发现空白线、待确定或待补充表述，提交前必须逐项填写。 ");
  if (!caseItem?.client || !caseItem?.opposingParty) add("high", "当事人信息不完整", "委托人或对方当事人缺失，可能影响文书主体信息。 ");
  if (!caseItem?.court || caseItem.court === "待确定") add("high", "受理法院待核验", "请结合管辖依据确认受理法院及文书抬头。 ");
  if (caseItem?.caseNo?.includes("待") || caseItem?.caseNo?.includes("立案前")) add("medium", "案号仍为临时状态", "正式提交或归档时应替换为法院分配的案号。 ");
  if (pendingEvidence.length) add("medium", "文书引用未核验证据", `${pendingEvidence.map(item => item.name).join("、")}尚未完成核验。`);
  if (content.length < 260) add("medium", "文书内容偏短", "建议复核请求、事实、证据分析和结论是否充分展开。 ");
  if (!/依据|法律|民法|诉讼法|司法解释/.test(content)) add("medium", "缺少明确法律依据", "建议补充经正式法源核验的法律依据和引用位置。 ");
  if (caseItem?.amount > 0 && !/[0-9０-９]+[,.，]?[0-9０-９]*\s*元/.test(content)) add("low", "金额表达待复核", "案件有标的额，但正文中未识别到明确的人民币金额表述。 ");
  if (!findings.length) add("pass", "基础审查通过", "未发现明显占位符、主体缺失或未核验证据引用，仍需人工进行事实与法源复核。 ");
  return findings;
}

function renderDocuments() {
  const caseItem = currentCase();
  if (!documentDraft) documentDraft = generateDocument(selectedTemplate, caseItem);
  return `
    ${pageHead()}
    <div class="document-layout">
      <section class="panel">
        <div class="panel-head"><div><h2>文书类型</h2><p>选择模板生成初稿</p></div></div>
        <div class="panel-body template-list">
          ${Object.entries(templateLabels).map(([key, label]) => `<button class="template-button ${selectedTemplate === key ? "is-active" : ""}" type="button" data-action="select-template" data-template="${key}" ${can("export_documents") ? "" : "disabled"}>${label}</button>`).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="toolbar">
          ${badge(caseItem?.stage || "无案件", "teal")}
          <span style="flex:1; color:var(--ink-soft); font-size:11px;">${escapeHTML(caseItem?.title || "请先选择案件")}</span>
          ${apiMode && can("export_documents") ? `<button class="secondary-button" type="button" data-action="extract-facts" title="从案件材料抽取事实">事实抽取</button>` : ""}
          <button class="secondary-button" type="button" data-action="review-document">${apiMode ? "引用校验" : "审查校对"}</button>
          ${can("export_documents") ? `<button class="secondary-button" type="button" data-action="save-version" title="保存当前草稿为版本快照">保存版本</button><button class="secondary-button" type="button" data-action="compare-versions" title="与历史版本逐行对比">版本对比</button><button class="secondary-button" type="button" data-action="copy-document" title="复制文书">复制</button><button class="primary-button" type="button" data-action="download-document" title="导出为 Word 文档">下载 DOCX</button>` : ""}
        </div>
        ${renderFactsPanel()}
        ${documentVerification ? renderVerificationPanel() : (documentReviewResults.length ? `<div class="review-panel">
          <div class="review-head"><strong>审查结果</strong><span>${documentReviewResults.filter(item => item.level !== "pass").length} 项需关注</span></div>
          <div class="review-list">${documentReviewResults.map(item => `<div class="review-item ${item.level}"><span>${item.level === "high" ? "高" : item.level === "medium" ? "中" : item.level === "low" ? "低" : "✓"}</span><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.detail)}</p></div></div>`).join("")}</div>
        </div>` : "")}
        <textarea id="document-editor" class="document-editor" aria-label="文书编辑区">${escapeHTML(documentDraft)}</textarea>
      </section>
    </div>`;
}

function renderFactsPanel() {
  if (!documentFacts) return "";
  if (!documentFacts.length) return `<div class="agent-panel"><div class="agent-head"><strong>事实抽取</strong><span>未从案件材料中抽取到候选事实，请先在「证据管理」页上传案件材料并完成识别。</span></div></div>`;
  const canEditEvents = can("edit_case") || can("manage_tasks");
  const timeline = documentTimeline.length ? `<div class="fact-timeline">
    <div class="agent-head" style="margin-bottom:6px;"><strong>案件时间线（自动排序）</strong><span style="display:flex;align-items:center;gap:8px;">${documentTimeline.length} 个时间节点${canEditEvents ? `<button class="quiet-button" type="button" data-action="timeline-to-events">写入程序时间轴</button>` : ""}</span></div>
    <ol class="timeline-list">${documentTimeline.map(item => `<li><span class="timeline-date">${escapeHTML(item.date)}</span><span>${escapeHTML(item.fact)}</span></li>`).join("")}</ol>
  </div>` : "";
  return `<div class="agent-panel">
    <div class="agent-head"><strong>事实抽取（来自案件材料）</strong><span>${documentFacts.length} 条候选 · 点击「插入」加入草稿，须核验后使用</span></div>
    ${timeline}
    <div class="fact-list">${documentFacts.map((item, index) => `<div class="fact-item">
      <div class="fact-meta">${(item.types || []).map(type => badge(type, "blue")).join("")}${item.date ? badge(item.date, "teal") : ""}<span class="source-line">来源：${escapeHTML(item.source)}</span></div>
      <p>${escapeHTML(item.fact)}</p>
      <button class="quiet-button" type="button" data-action="insert-fact" data-index="${index}">插入草稿</button>
    </div>`).join("")}</div>
  </div>`;
}

function renderVerificationPanel() {
  const v = documentVerification;
  if (!v) return "";
  const legalItem = item => {
    const tone = item.status === "verified" ? "pass" : "high";
    const sign = item.status === "verified" ? "✓" : item.status === "outdated" ? "✗" : "?";
    const msg = item.status === "verified"
      ? `已在法源库匹配：${escapeHTML(item.matched.title)}（${escapeHTML(item.matched.authority)}）`
      : item.status === "outdated"
        ? `⚠ 所引法源已失效：《${escapeHTML(item.matched.title)}》当前状态「${escapeHTML(item.matched.status)}」，请更换为现行有效依据。`
        : "未在法源库检索到匹配，请核验条号或导入正式法源。";
    const btn = item.status === "verified" ? "" : `<button class="quiet-button" type="button" data-action="search-legal-ref" data-ref="${escapeHTML(item.ref)}">去法律检索</button>`;
    return `<div class="review-item ${tone}"><span>${sign}</span><div><strong>法条引用：${escapeHTML(item.ref)}</strong><p>${msg}</p>${btn}</div></div>`;
  };
  return `<div class="review-panel">
    <div class="review-head"><strong>引用与事实校验</strong><span>未核验法条 ${v.unverifiedLegal} · 失效引用 ${v.outdatedLegal || 0} · 缺依据事实 ${v.ungroundedFacts} · 扫描材料 ${v.filesScanned} 份</span></div>
    <div class="review-list">
      ${v.legal.length ? v.legal.map(legalItem).join("") : `<div class="review-item medium"><span>!</span><div><strong>未识别到法条引用</strong><p>建议补充经正式法源核验的法律依据。</p></div></div>`}
      ${v.facts.map(item => `<div class="review-item ${item.status === "grounded" ? "pass" : "medium"}"><span>${item.status === "grounded" ? "✓" : "!"}</span><div><strong>${escapeHTML(item.claim)}</strong><p>${item.status === "grounded" ? `在${item.sourceKind === "evidence" ? "证据" : "材料"}${item.source ? `《${escapeHTML(item.source)}》` : ""}中找到对应记载。` : (v.filesScanned ? "未在已上传案件材料中找到对应记载，请核验或补充。" : "尚未上传案件材料，无法核对事实依据。")}</p>${item.status === "ungrounded" ? `<button class="quiet-button" type="button" data-action="locate-evidence" data-claim="${escapeHTML(item.claim)}">去证据/材料</button>` : ""}</div></div>`).join("")}
    </div>
  </div>`;
}

// 行级 LCS diff：返回 {type: same|add|del, text} 序列。
function diffLines(oldText, newText) {
  const a = String(oldText).split("\n");
  const b = String(newText).split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const rows = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ type: "same", text: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ type: "del", text: a[i] }); i += 1; }
    else { rows.push({ type: "add", text: b[j] }); j += 1; }
  }
  while (i < n) { rows.push({ type: "del", text: a[i] }); i += 1; }
  while (j < m) { rows.push({ type: "add", text: b[j] }); j += 1; }
  return rows;
}

// 把当前文书内容存为一个版本快照（含内容，用于后续对比）。
function snapshotVersion(content) {
  const label = templateLabels[selectedTemplate];
  const previous = state.documentVersions.filter(item => item.caseId === state.activeCaseId && item.name === label).length;
  const version = `v${previous + 1}`;
  state.documentVersions.unshift({
    id: uid("doc"), caseId: state.activeCaseId, name: label, version,
    member: currentUser?.name || "当前用户", updatedAt: dateFromNow(0), content: String(content || "").slice(0, 60000)
  });
  return version;
}

function resolveVersionContent(id) {
  if (id === "__current__") return document.querySelector("#document-editor")?.value || documentDraft;
  return state.documentVersions.find(item => item.id === id)?.content || "";
}

function versionLabel(id) {
  if (id === "__current__") return "当前草稿";
  return state.documentVersions.find(item => item.id === id)?.version || "版本";
}

function renderVersionDiff() {
  const container = document.querySelector("#version-diff");
  if (!container) return;
  const leftId = document.querySelector("#version-left")?.value;
  const rightId = document.querySelector("#version-right")?.value;
  const rows = diffLines(resolveVersionContent(leftId), resolveVersionContent(rightId));
  const added = rows.filter(row => row.type === "add").length;
  const removed = rows.filter(row => row.type === "del").length;
  container.innerHTML = `<div class="diff-summary">基准 ${escapeHTML(versionLabel(leftId))} → 对比 ${escapeHTML(versionLabel(rightId))} · +${added} 行 · −${removed} 行</div>
    <div class="diff-lines">${rows.map(row => `<div class="diff-line ${row.type}"><span class="diff-sign">${row.type === "add" ? "+" : row.type === "del" ? "−" : ""}</span><span>${escapeHTML(row.text) || "&nbsp;"}</span></div>`).join("")}</div>`;
}

function compareVersionsDialog() {
  const label = templateLabels[selectedTemplate];
  const versions = state.documentVersions.filter(item => item.caseId === state.activeCaseId && item.name === label && typeof item.content === "string");
  if (!versions.length) return showToast("暂无已保存版本，先点「保存版本」或「下载 DOCX」生成快照");
  const options = (selectedId, includeCurrent) => `${versions.map(item => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHTML(item.version)} · ${escapeHTML(item.member)} · ${formatDate(item.updatedAt)}</option>`).join("")}${includeCurrent ? `<option value="__current__" ${selectedId === "__current__" ? "selected" : ""}>当前草稿</option>` : ""}`;
  const baseId = versions.length > 1 ? versions[1].id : versions[0].id;
  dialogContent.innerHTML = `
    <div class="dialog-head"><h2>版本对比</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
    <div class="dialog-body">
      <div class="file-detail-meta"><span>${escapeHTML(label)}</span><span>任意两个版本（含当前草稿）逐行对比</span></div>
      <div class="version-pickers">
        <div class="form-field"><label>基准版本（左）</label><select id="version-left">${options(baseId, true)}</select></div>
        <div class="form-field"><label>对比版本（右）</label><select id="version-right">${options("__current__", true)}</select></div>
      </div>
      <div id="version-diff" class="diff-view"></div>
    </div>
    <div class="dialog-actions"><button class="primary-button" type="button" data-action="close-dialog">关闭</button></div>`;
  dialog.showModal();
  renderVersionDiff();
}

function evidenceMatrix(items) {
  const groups = new Map();
  items.forEach(item => {
    const key = item.fact || "未关联待证事实";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([fact, evidence]) => {
    const verified = evidence.filter(item => item.status === "已核验").length;
    const hasStrong = evidence.some(item => item.strength === "强");
    const suggestions = [];
    if (verified < evidence.length) suggestions.push("完成真实性与来源核验");
    if (evidence.length === 1) suggestions.push("寻找独立辅助证据形成印证");
    if (evidence.some(item => item.type === "电子数据")) suggestions.push("保留原始载体与完整上下文");
    if (!hasStrong) suggestions.push("补充证明力更强的原始材料");
    return { fact, evidence, verified, hasStrong, suggestions };
  });
}

function renderEvidenceMatrix(items) {
  const matrix = evidenceMatrix(items);
  return `<div class="data-table-wrap"><table class="data-table evidence-matrix">
    <thead><tr><th>待证事实</th><th>支持材料</th><th>核验覆盖</th><th>证据链评价</th><th>补强动作</th></tr></thead>
    <tbody>${matrix.map(row => `<tr>
      <td><strong>${escapeHTML(row.fact)}</strong></td>
      <td><div class="evidence-links">${row.evidence.map(item => `<span>${escapeHTML(item.no)} · ${escapeHTML(item.name)}</span>`).join("")}</div></td>
      <td>${badge(`${row.verified}/${row.evidence.length} 已核验`, row.verified === row.evidence.length ? "green" : "gold")}</td>
      <td>${badge(row.hasStrong && row.verified === row.evidence.length ? "较完整" : "待补强", row.hasStrong && row.verified === row.evidence.length ? "green" : "red")}</td>
      <td>${row.suggestions.map(item => `<div class="matrix-action">${escapeHTML(item)}</div>`).join("") || `<span class="source-line">提交前交叉复核</span>`}</td>
    </tr>`).join("") || `<tr><td colspan="5"><div class="empty-state"><strong>暂无证据链</strong>添加证据并关联待证事实。</div></td></tr>`}</tbody>
  </table></div>`;
}

function renderCaseFiles() {
  if (!apiMode) return "";
  const files = caseFiles.filter(item => item.caseId === state.activeCaseId);
  const ocrReady = ocrCapabilities?.imageOcr && ocrCapabilities?.pdfAndDocx;
  return `<section class="panel case-files-panel">
    <div class="panel-head"><div><h2>案件材料与 OCR</h2><p>原文件保存在服务端私有目录，文字提取仅在本机执行</p></div><div style="display:flex;align-items:center;gap:8px;">${badge(ocrReady ? "OCR 可用" : "部分提取能力", ocrReady ? "green" : "gold")}${can("manage_evidence") ? `<button class="primary-button" type="button" data-action="upload-file">＋ 上传材料</button>` : ""}</div></div>
    <div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>文件</th><th>识别状态</th><th>提取文字</th><th>完整性校验</th><th>上传时间</th><th>操作</th></tr></thead>
      <tbody>${files.map(file => `<tr>
        <td><strong>${escapeHTML(file.name)}</strong><small>${escapeHTML(file.mimeType)} · ${formatBytes(file.size)}</small></td>
        <td>${badge(file.status === "processed" ? "已提取" : file.status === "partial" ? "需复核" : "处理失败", file.status === "processed" ? "green" : file.status === "partial" ? "gold" : "red")}<br><small>${escapeHTML(file.method || file.error || "等待处理")}</small></td>
        <td>${file.textLength.toLocaleString()} 字</td>
        <td><span class="hash-value" title="${escapeHTML(file.sha256)}">SHA-256 ${escapeHTML(file.sha256.slice(0, 12))}…</span></td>
        <td>${formatDateTime(file.createdAt)}</td>
        <td><div class="table-actions"><button class="quiet-button" type="button" data-action="view-file" data-id="${file.id}">查看</button><button class="quiet-button" type="button" data-action="download-file" data-id="${file.id}">下载</button>${can("manage_evidence") ? `<button class="quiet-button" type="button" data-action="delete-file" data-id="${file.id}">删除</button>` : ""}</div></td>
      </tr>`).join("") || `<tr><td colspan="6"><div class="empty-state"><strong>尚未上传案件材料</strong>支持 PDF、DOCX、图片和文本文件。</div></td></tr>`}</tbody>
    </table></div>
  </section>`;
}

function renderEvidence() {
  const items = currentEvidence();
  const unverified = items.filter(item => item.status !== "已核验").length;
  const highRisk = items.filter(item => item.risk === "高" || item.status === "待补强").length;
  return `
    ${pageHead(can("manage_evidence") ? `<button class="primary-button" type="button" data-action="add-evidence">＋ 添加证据</button>` : "")}
    ${renderCaseFiles()}
    <div class="metric-grid">
      <article class="metric-card"><div class="metric-label">证据总数</div><div class="metric-value">${items.length}</div><div class="metric-note">当前案件证据材料</div></article>
      <article class="metric-card gold"><div class="metric-label">待核验</div><div class="metric-value">${unverified}</div><div class="metric-note">真实性、完整性或来源待确认</div></article>
      <article class="metric-card red"><div class="metric-label">证据缺口</div><div class="metric-value">${highRisk}</div><div class="metric-note">建议优先补强</div></article>
      <article class="metric-card blue"><div class="metric-label">待证事实</div><div class="metric-value">${new Set(items.map(item => item.fact)).size}</div><div class="metric-note">已建立证据关联</div></article>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>${escapeHTML(currentCase()?.title || "当前案件")}</h2><p>${evidenceViewMode === "catalog" ? "点击状态可推进核验" : "按待证事实检查证据链"}</p></div>
        <div class="segmented" aria-label="证据视图">
          <button type="button" class="segment-button ${evidenceViewMode === "catalog" ? "is-active" : ""}" data-action="evidence-view" data-mode="catalog">证据目录</button>
          <button type="button" class="segment-button ${evidenceViewMode === "matrix" ? "is-active" : ""}" data-action="evidence-view" data-mode="matrix">证据链矩阵</button>
        </div>
      </div>
      ${evidenceViewMode === "matrix" ? renderEvidenceMatrix(items) : `<div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>编号 / 名称</th><th>类型与来源</th><th>关联待证事实</th><th>证明力</th><th>风险</th><th>核验状态</th></tr></thead>
          <tbody>
            ${items.map(item => `<tr>
              <td><strong>${escapeHTML(item.no)} · ${escapeHTML(item.name)}</strong><small>${escapeHTML(item.note || "无补充备注")}</small></td>
              <td>${escapeHTML(item.type)}<br><small>${escapeHTML(item.source)}</small></td>
              <td>${escapeHTML(item.fact)}</td>
              <td>${badge(item.strength, item.strength === "强" ? "green" : "gold")}</td>
              <td>${badge(item.risk, item.risk === "高" ? "red" : item.risk === "中" ? "gold" : "green")}</td>
              <td>${can("manage_evidence") ? `<button class="quiet-button" type="button" data-action="cycle-evidence" data-id="${item.id}">${badge(item.status, toneForStatus(item.status))}</button>` : badge(item.status, toneForStatus(item.status))}</td>
            </tr>`).join("") || `<tr><td colspan="6"><div class="empty-state"><strong>暂无证据</strong>添加材料并关联待证事实。</div></td></tr>`}
          </tbody>
        </table>
      </div>`}
    </section>`;
}

function calculateStrategy(caseItem, evidence) {
  const gaps = evidence.filter(item => item.status !== "已核验");
  const weak = evidence.filter(item => item.strength !== "强");
  const urgent = daysUntil(caseItem.nextDate) <= 7;
  const score = Math.max(18, Math.min(88, Math.round(28 + gaps.length * 9 + weak.length * 5 + (urgent ? 8 : 0) + (evidence.length < 2 ? 12 : 0))));
  return {
    score,
    level: score >= 65 ? "较高" : score >= 45 ? "中等" : "可控",
    disputes: [
      `${caseItem.cause}项下权利义务与实际履行情况如何认定`,
      `现有证据能否证明“${caseItem.claims.slice(0, 26)}${caseItem.claims.length > 26 ? "..." : ""}”`,
      "请求金额、损失范围及计算依据是否充分"
    ],
    gaps: gaps.length ? gaps.map(item => `${item.name}：${item.note || item.status}`) : ["当前证据均已标记核验，仍应在提交前进行交叉复核"],
    actions: score >= 65
      ? ["优先补强关键证据并保留原始载体", "评估保全或调解方案，控制程序与回款风险", "按争议焦点重新组织事实时间线"]
      : ["围绕请求权基础整理证据链", "完成类案检索并记录筛选口径", "庭前同步诉讼与调解底线"]
  };
}

function outcomeTone(outcome) {
  return outcome === "支持" ? "green" : outcome === "驳回" ? "red" : "gold";
}

// 类案检索与裁判倾向面板（服务端模式）。
function renderTendencyPanel() {
  if (!apiMode) return "";
  const head = `<div class="panel-head"><div><h2>类案与裁判倾向</h2><p>样例裁判要旨检索 · 仅供参考</p></div><button class="secondary-button" type="button" data-action="strategy-tendency">检索类案</button></div>`;
  if (!strategyTendency) {
    return `<section class="panel"><div class="panel-head"><div><h2>类案与裁判倾向</h2><p>样例裁判要旨检索 · 仅供参考</p></div><button class="primary-button" type="button" data-action="strategy-tendency">检索类案</button></div><div class="panel-body"><div class="empty-state"><strong>尚未检索类案</strong>点击「检索类案」按当前案由与事实召回相似裁判要旨，聚合裁判倾向参考。</div></div></section>`;
  }
  const { tendency, precedents, summary, summaryBy } = strategyTendency;
  const sourceBadge = summaryBy?.startsWith("claude") ? badge("Claude 综述 · 仅依据类案片段", "teal") : badge("本地启发式聚合 · 未经模型生成", "gold");
  const bar = tendency.total
    ? `<div class="risk-bar" style="display:flex; overflow:hidden;">
        <span style="width:${tendency.supportPct}%; background:var(--green);" title="支持 ${tendency.supportPct}%"></span>
        <span style="width:${tendency.partialPct}%; background:var(--gold);" title="部分支持 ${tendency.partialPct}%"></span>
        <span style="width:${tendency.dismissPct}%; background:var(--red);" title="驳回 ${tendency.dismissPct}%"></span>
      </div>
      <p class="source-line" style="margin-top:10px;">支持 ${tendency.support} · 部分支持 ${tendency.partial} · 驳回 ${tendency.dismiss}（共 ${tendency.total} 件样例类案）</p>`
    : "";
  const list = precedents.map(item => `<div style="padding:10px 0; border-bottom:1px solid var(--line);">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;"><strong style="font-size:13px;">${escapeHTML(item.title)}</strong>${badge(item.outcome, outcomeTone(item.outcome))}</div>
      <p class="source-line" style="margin:6px 0 4px;">${escapeHTML(item.cause)} · ${escapeHTML(item.court)}${item.year ? ` · ${escapeHTML(item.year)}` : ""}</p>
      <p style="font-size:12px; color:var(--muted); margin:0;">${escapeHTML(item.gist.slice(0, 140))}${item.gist.length > 140 ? "…" : ""}</p>
    </div>`).join("") || `<div class="empty-state"><strong>未检索到相似类案样例</strong>可调整案由或事实关键词后重试。</div>`;
  return `<section class="panel">
    ${head}
    <div class="panel-body">
      ${bar}
      <p style="font-size:13px; line-height:1.7; margin:12px 0;">${escapeHTML(summary)}</p>
      <div style="margin-bottom:10px;">${sourceBadge}</div>
      ${list}
      <div class="disclaimer" style="margin-top:14px;">裁判倾向基于样例类案统计，仅供参考，不代表胜败概率或确定性结论；正式类案须回到中国裁判文书网核验。</div>
    </div>
  </section>`;
}

function renderStrategy() {
  const caseItem = currentCase();
  if (!caseItem) return `${pageHead()}<div class="empty-state"><strong>暂无案件</strong>请先新建案件。</div>`;
  const evidence = currentEvidence();
  const result = calculateStrategy(caseItem, evidence);
  const searchButton = apiMode
    ? `<button class="secondary-button" type="button" data-action="strategy-tendency">检索类案</button>`
    : `<button class="secondary-button" type="button" data-route="search">检索类案</button>`;
  return `
    ${pageHead(`${searchButton}<button class="primary-button" type="button" data-route="documents">生成策略文书</button>`)}
    <div class="insight-grid">
      <article class="insight-card"><h3>综合风险参考</h3><div class="risk-score"><strong>${result.score}</strong><span>/ 100 · ${result.level}</span></div><div class="risk-bar"><span style="width:${result.score}%; background:${result.score >= 65 ? "var(--red)" : "var(--gold)"}"></span></div><p class="source-line" style="margin-top:12px;">由证据完整度、节点紧迫性和案件录入情况计算</p></article>
      <article class="insight-card"><h3>争议焦点</h3><ul>${result.disputes.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></article>
      <article class="insight-card"><h3>证据缺口</h3><ul>${result.gaps.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></article>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>路径建议</h2><p>${escapeHTML(caseItem.title)}</p></div>${badge("AI 参考", "gold")}</div>
      <div class="panel-body">
        <div class="workflow">${result.actions.map((item, index) => `<div class="workflow-step"><strong>步骤 ${index + 1}</strong><span>${escapeHTML(item)}</span></div>`).join("")}<div class="workflow-step"><strong>持续校验</strong><span>每次补充证据或节点变化后重新评估策略。</span></div></div>
        <div class="disclaimer" style="margin-top:14px;">风险分值和路径建议仅用于辅助办案，不是胜败概率或确定性法律意见。</div>
      </div>
    </section>
    ${renderTendencyPanel()}`;
}

function answerQuestion(query) {
  const matches = searchKnowledge(query, "全部").slice(0, 3);
  const caseItem = currentCase();
  const lead = matches[0]?.summary || "当前样例知识库未找到直接匹配，建议拆分为请求权基础、程序节点、证据和救济路径继续检索。";
  const answer = `初步检索意见：\n${lead}\n\n结合当前案件“${caseItem?.title || "未选择案件"}”，建议先核对：\n1. 关键事实和请求权基础是否一致；\n2. 证明责任对应的证据是否完整、真实且可提交；\n3. 诉讼期限、举证期限和法院通知是否已登记；\n4. 结论引用是否能回溯到现行正式法源。\n\n以上仅为办案辅助，请由专业人员结合完整材料复核。`;
  return { answer, citations: matches.map(item => item.id) };
}

function renderQA() {
  return `
    ${pageHead()}
    <div class="qa-shell">
      <div class="qa-history">
        ${state.qaMessages.map(message => `<div class="message ${message.role}">${escapeHTML(message.text)}${message.role === "assistant" && message.generatedBy ? `<div class="answer-source">${message.generatedBy.startsWith("claude") ? badge("Claude 生成 · 仅依据检索片段", "teal") : badge("检索摘录 · 未经模型生成", "gold")}</div>` : ""}${message.citations?.length ? `<div class="citation-list">${message.citations.map(citation => {
          if (typeof citation === "object") return `<span class="citation">依据：${escapeHTML(citation.title)} · ${escapeHTML(citation.authority)} · ${escapeHTML(citation.status)}${safeExternalUrl(citation.sourceUrl) ? ` · <a href="${safeExternalUrl(citation.sourceUrl)}" target="_blank" rel="noopener">正式来源</a>` : ""}</span>`;
          const item = knowledgeBase.find(entry => entry.id === citation);
          return item ? `<span class="citation">依据：${escapeHTML(item.title)} · ${escapeHTML(item.source)}</span>` : "";
        }).join("")}</div>` : ""}</div>`).join("")}
      </div>
      <div class="qa-input">
        <textarea id="qa-question" placeholder="围绕当前案件提问，例如：电子证据应重点核验什么？" aria-label="法律问题"></textarea>
        <button class="primary-button" type="button" data-action="ask-question">发送</button>
      </div>
    </div>`;
}

function hearingOutline(caseItem) {
  const evidence = state.evidence.filter(item => item.caseId === caseItem.id);
  return `庭审辅助提纲\n\n案件：${caseItem.title}\n案号：${caseItem.caseNo}\n开庭时间：${caseItem.hearingDate || "待确定"}\n\n一、庭前核对\n1. 核对诉讼请求、事实理由与最新证据目录是否一致。\n2. 核对当事人身份、授权材料、原件和电子数据原始载体。\n3. 核对法院通知、举证期限及送达情况。\n\n二、争议焦点\n1. ${caseItem.cause}项下合同义务及履行情况。\n2. 违约或责任事实能否由现有证据证明。\n3. 请求金额及损失计算是否充分。\n\n三、发问提纲\n1. 请对方说明合同签订、履行和对账过程。\n2. 请对方确认关键文件、签章或电子账号主体。\n3. 请对方说明未履行或提出异议的具体时间与依据。\n\n四、质证要点\n${evidence.map((item, index) => `${index + 1}. ${item.name}：核对真实性、合法性、关联性；关注${item.note || "与待证事实的对应关系"}。`).join("\n") || "暂无证据，请先建立证据目录。"}\n\n五、辩论要点\n围绕请求权基础、证明责任、证据链完整性、损失范围和程序事项展开。\n\n【提示】本提纲仅供庭前准备，需结合庭审进展动态调整。`;
}

function renderHearing() {
  const caseItem = currentCase();
  if (!caseItem) return `${pageHead()}<div class="empty-state"><strong>暂无案件</strong>请先新建案件。</div>`;
  return `
    ${pageHead(can("export_documents") ? `<button class="secondary-button" type="button" data-action="copy-hearing">复制提纲</button><button class="primary-button" type="button" data-action="download-hearing">下载 DOCX</button>` : "")}
    <div class="split-layout">
      <section class="panel">
        <div class="panel-head"><div><h2>庭前状态</h2><p>${formatDate(caseItem.hearingDate)}</p></div>${badge(caseItem.stage, "teal")}</div>
        <div class="panel-body">
          <div class="case-list">
            ${[
              ["诉讼请求与答辩", true],
              ["证据目录及原件", currentEvidence().every(item => item.status === "已核验")],
              ["发问提纲", true],
              ["质证意见", currentEvidence().length > 0],
              ["代理词要点", false]
            ].map(([label, done]) => `<div style="display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--line);"><span style="font-size:12px;">${label}</span>${badge(done ? "已准备" : "待完善", done ? "green" : "gold")}</div>`).join("")}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>智能生成提纲</h2><p>基于当前案件与证据目录</p></div></div>
        <textarea id="hearing-editor" class="document-editor" style="min-height:520px;">${escapeHTML(hearingOutline(caseItem))}</textarea>
      </section>
    </div>
    ${renderTranscriptionPanel(caseItem)}`;
}

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".webm"];

// 庭审语音转写面板（服务端模式）：本地引擎转写音频或手工导入笔录，结构化为分段并可选生成小结。
function renderTranscriptionPanel(caseItem) {
  if (!apiMode) return `<section class="panel" style="margin-top:16px;"><div class="panel-head"><div><h2>庭审语音转写</h2><p>本地离线转写 · 数据不出本机</p></div></div><div class="panel-body"><div class="empty-state"><strong>需登录服务端模式</strong>本地演示模式下不提供语音转写与笔录结构化。</div></div></section>`;
  const caps = hearingCapabilities;
  const engineBadge = caps?.available ? badge(`本地引擎：${caps.engine}`, "green") : badge("未检测到本地引擎 · 可手工导入笔录", "gold");
  const audioFiles = caseFiles.filter(item => item.caseId === caseItem.id && AUDIO_EXTENSIONS.some(ext => (item.name || "").toLowerCase().endsWith(ext)));
  const transcribeBlock = caps?.available
    ? `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
        <select id="transcribe-file" style="flex:1; min-width:200px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:inherit;">
          ${audioFiles.map(item => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join("") || `<option value="">（当前案件暂无录音文件，请先在「证据管理」上传）</option>`}
        </select>
        <button class="primary-button" type="button" data-action="transcribe-audio" ${audioFiles.length ? "" : "disabled"}>转写录音</button>
      </div>`
    : `<div class="disclaimer" style="margin:0 0 12px;">未检测到本地语音引擎。可安装 faster-whisper 或配置 <code>HENGFA_ASR_CMD</code> 后离线转写；当前可直接在下方手工导入庭审笔录。</div>`;
  const segments = hearingTranscript?.segments || [];
  const segmentsBlock = segments.length
    ? `<div style="max-height:360px; overflow:auto; margin-top:6px;">${segments.map(item => `<div style="padding:8px 0; border-bottom:1px solid var(--line);">
        <div class="case-meta" style="margin-bottom:2px;">${item.time ? badge(item.time, "teal") : ""}${item.speaker ? `<strong>${escapeHTML(item.speaker)}</strong>` : ""}</div>
        <span style="font-size:13px;">${escapeHTML(item.text)}</span>
      </div>`).join("")}</div>
      <div style="margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">${badge(`${segments.length} 段`, "blue")}${hearingTranscript?.method ? badge(`来源：${hearingTranscript.method === "import" ? "导入笔录" : hearingTranscript.method}`, "gold") : ""}<button class="secondary-button" type="button" data-action="hearing-summary">生成庭审小结</button></div>`
    : `<div class="empty-state" style="margin-top:6px;"><strong>暂无笔录</strong>转写录音或导入笔录后在此显示分段。</div>`;
  const summaryBlock = hearingSummary
    ? `<div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--line);">
        <div style="margin-bottom:8px;">${hearingSummary.summaryBy?.startsWith("claude") ? badge("Claude 生成 · 仅依据笔录", "teal") : badge("本地启发式摘录 · 未经模型生成", "gold")}</div>
        <p style="font-size:13px; line-height:1.7; white-space:pre-wrap; margin:0;">${escapeHTML(hearingSummary.summary)}</p>
      </div>`
    : "";
  return `<section class="panel" style="margin-top:16px;">
    <div class="panel-head"><div><h2>庭审语音转写</h2><p>本地离线转写 · 数据不出本机</p></div>${engineBadge}</div>
    <div class="panel-body">
      ${transcribeBlock}
      <details>
        <summary style="cursor:pointer; font-size:13px; color:var(--muted); margin-bottom:8px;">手工导入庭审笔录（支持 SRT / VTT /「说话人：内容」/ 纯文本）</summary>
        <textarea id="transcript-import" placeholder="粘贴庭审笔录文本，例如：\n审判长：现在开庭。\n原告代理人：对该证据真实性无异议。" style="width:100%; min-height:120px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:inherit;"></textarea>
        <div style="margin-top:8px;"><button class="secondary-button" type="button" data-action="import-transcript">结构化导入</button></div>
      </details>
      ${segmentsBlock}
      ${summaryBlock}
      <div class="disclaimer" style="margin-top:14px;">转写与小结仅为庭后整理辅助，须结合完整笔录与录音核验；音频与笔录均在本机处理（小结如启用 Claude 才会发送笔录文本）。</div>
    </div>
  </section>`;
}

function renderExecution() {
  const caseItem = currentCase();
  const clues = caseItem ? state.assetClues.filter(item => item.caseId === caseItem.id) : [];
  const executionIndex = caseItem?.stage === "执行" ? 2 : caseItem?.stage === "判决/调解" ? 1 : 0;
  const executionSteps = ["执行材料准备", "执行立案", "网络查控", "线索核验", "处置与回款", "结案/终本跟踪"];
  return `
    ${pageHead(can("manage_evidence") ? `<button class="primary-button" type="button" data-action="add-clue">＋ 添加财产线索</button>` : "")}
    <div class="stage-strip" style="grid-template-columns:repeat(6,minmax(110px,1fr));">${executionSteps.map((step, index) => `<div class="stage-item ${index < executionIndex ? "is-done" : ""} ${index === executionIndex ? "is-current" : ""}">${step}</div>`).join("")}</div>
    <section class="panel">
      <div class="panel-head"><div><h2>财产线索台账</h2><p>${escapeHTML(caseItem?.title || "未选择案件")}</p></div>${badge(`${clues.length} 条线索`, "blue")}</div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>类型</th><th>线索描述</th><th>来源</th><th>状态</th><th>更新日期</th></tr></thead>
        <tbody>${clues.map(item => `<tr><td>${badge(item.type, "teal")}</td><td>${escapeHTML(item.description)}</td><td>${escapeHTML(item.source)}</td><td>${badge(item.status, toneForStatus(item.status))}</td><td>${formatDate(item.updatedAt)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state"><strong>暂无财产线索</strong>可录入账户、不动产、车辆、股权或到期债权等信息。</div></td></tr>`}</tbody>
      </table></div>
    </section>`;
}

// 案源 / 客户管理面板（工作区级，存于同步状态）。
function renderClientsPanel() {
  const clients = state.clients || [];
  const canEdit = can("manage_tasks");
  const cols = canEdit ? 6 : 5;
  return `<section class="panel" style="margin-top:16px;">
    <div class="panel-head"><div><h2>案源 / 客户</h2><p>客户与案源渠道管理 · ${clients.length} 位</p></div>${canEdit ? `<button class="primary-button" type="button" data-action="add-client">＋ 新增客户</button>` : ""}</div>
    <div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>客户</th><th>联系方式</th><th>案源渠道</th><th>关联案件</th><th>备注</th>${canEdit ? "<th>操作</th>" : ""}</tr></thead>
      <tbody>${clients.map(item => {
        const linked = (item.caseIds || []).map(caseId => state.cases.find(caseEntry => caseEntry.id === caseId)?.title).filter(Boolean);
        return `<tr><td><strong>${escapeHTML(item.name)}</strong></td><td>${escapeHTML(item.contact || "—")}</td><td>${item.channel ? badge(item.channel, "teal") : "—"}</td><td>${linked.length ? escapeHTML(linked.join("、")) : badge(`${(item.caseIds || []).length} 件`, "blue")}</td><td>${escapeHTML(item.note || "")}</td>${canEdit ? `<td><button class="quiet-button" type="button" data-action="edit-client" data-id="${item.id}">编辑</button><button class="quiet-button" type="button" data-action="delete-client" data-id="${item.id}">删除</button></td>` : ""}</tr>`;
      }).join("") || `<tr><td colspan="${cols}"><div class="empty-state"><strong>暂无客户</strong>登记案源与客户信息便于跟进与归档检索。</div></td></tr>`}</tbody>
    </table></div>
  </section>`;
}

// 归档案件检索结果列表（独立函数，便于按关键词即时刷新而不丢失输入焦点）。
function archiveResultsHTML() {
  const archived = state.cases.filter(item => item.archived);
  const query = archiveQuery.trim().toLowerCase();
  const matched = query
    ? archived.filter(item => `${item.title} ${item.caseNo} ${item.client} ${item.cause} ${item.facts || ""}`.toLowerCase().includes(query))
    : archived;
  return matched.map(item => `<div style="display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid var(--line);">
      <div class="case-meta"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.caseNo)} · ${escapeHTML(item.client)} · ${escapeHTML(item.cause)}${item.archivedAt ? ` · 归档于 ${formatDate(item.archivedAt)}` : ""}</span></div>
      <div style="display:flex; gap:8px;"><button class="quiet-button" type="button" data-action="set-case" data-id="${item.id}">打开</button>${can("edit_case") ? `<button class="quiet-button" type="button" data-action="toggle-archive" data-id="${item.id}">取消归档</button>` : ""}</div>
    </div>`).join("") || `<div class="empty-state"><strong>${archived.length ? "未匹配到归档案件" : "暂无归档案件"}</strong>${archived.length ? "调整检索关键词后重试。" : "在本页头部点击「归档当前案件」即可归档。"}</div>`;
}

// 归档检索面板（工作区级）。
function renderArchivePanel() {
  const archivedCount = state.cases.filter(item => item.archived).length;
  return `<section class="panel" style="margin-top:16px;">
    <div class="panel-head"><div><h2>归档检索</h2><p>已归档案件 ${archivedCount} 件</p></div></div>
    <div class="panel-body">
      <input id="archive-search" type="search" value="${escapeHTML(archiveQuery)}" placeholder="按案件名称 / 案号 / 当事人 / 案由检索归档案件" aria-label="归档检索" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:inherit;">
      <div id="archive-results" style="margin-top:12px;">${archiveResultsHTML()}</div>
    </div>
  </section>`;
}

function renderCollaboration() {
  const caseItem = currentCase();
  const tasks = state.tasks.filter(item => item.caseId === caseItem?.id);
  const timeLogs = state.timeLogs.filter(item => item.caseId === caseItem?.id);
  const versions = state.documentVersions.filter(item => item.caseId === caseItem?.id);
  const totalHours = timeLogs.reduce((sum, item) => sum + Number(item.hours), 0);
  const actions = [
    caseItem && can("edit_case") ? `<button class="secondary-button" type="button" data-action="toggle-archive" data-id="${caseItem.id}">${caseItem.archived ? "取消归档" : "归档当前案件"}</button>` : "",
    can("manage_tasks") ? `<button class="secondary-button" type="button" data-action="add-time">登记工时</button>` : "",
    can("manage_tasks") ? `<button class="primary-button" type="button" data-action="add-task">＋ 新建任务</button>` : ""
  ].join("");
  return `
    ${pageHead(actions)}
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head"><div><h2>案件任务</h2><p>${tasks.filter(item => !item.done).length} 项未完成</p></div></div>
        <div class="data-table-wrap"><table class="data-table">
          <thead><tr><th>任务</th><th>负责人</th><th>截止日期</th><th>优先级</th><th>状态</th></tr></thead>
          <tbody>${tasks.map(task => `<tr><td><strong>${escapeHTML(task.title)}</strong></td><td>${escapeHTML(task.owner)}</td><td>${formatDate(task.dueDate)}</td><td>${badge(task.priority, task.priority === "高" ? "red" : "gold")}</td><td>${can("manage_tasks") ? `<button class="quiet-button" type="button" data-action="toggle-task" data-id="${task.id}">${badge(task.done ? "已完成" : "处理中", task.done ? "green" : "teal")}</button>` : badge(task.done ? "已完成" : "处理中", task.done ? "green" : "teal")}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state"><strong>暂无任务</strong>为当前案件创建协作任务。</div></td></tr>`}</tbody>
        </table></div>
      </section>
      <div style="display:grid; gap:16px; align-content:start;">
        <section class="panel">
          <div class="panel-head"><div><h2>工时记录</h2><p>累计 ${totalHours.toFixed(1)} 小时</p></div></div>
          <div class="panel-body">${timeLogs.map(item => `<div style="display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid var(--line);"><div class="case-meta"><strong>${escapeHTML(item.activity)}</strong><span>${escapeHTML(item.member)} · ${formatDate(item.date)}</span></div><strong>${Number(item.hours).toFixed(1)}h</strong></div>`).join("") || `<div class="empty-state"><strong>暂无工时</strong>登记团队办案投入。</div>`}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h2>文书版本</h2><p>最近修改记录</p></div></div>
          <div class="panel-body">${versions.map(item => `<div style="display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid var(--line);"><div class="case-meta"><strong>${escapeHTML(item.name)} ${escapeHTML(item.version)}</strong><span>${escapeHTML(item.member)} · ${formatDate(item.updatedAt)}</span></div>${badge("已留痕", "blue")}</div>`).join("") || `<div class="empty-state"><strong>暂无版本</strong>下载文书后会生成版本记录。</div>`}</div>
        </section>
      </div>
    </div>
    ${renderClientsPanel()}
    ${renderArchivePanel()}`;
}

function renderPlatform() {
  const layers = [
    ["01", "用户交互层", "Web 工作台、桌面端、移动端、Word/WPS 插件与对话入口", "Web + Word/WPS 插件"],
    ["02", "应用服务层", "案件、文书、权限协作、工时计费与业务 API", "本地服务模拟"],
    ["03", "AI 能力中台", "法律模型、RAG 检索、Agent 编排、意图识别与结果校验", "Claude 基座可选接入"],
    ["04", "知识与数据层", "法条、司法解释、案例、案件档案与向量索引", "样例知识库"],
    ["05", "基础设施层", "身份认证、存储、日志审计、加密与私有化部署", "本地存储"],
  ];
  const platformActions = [
    apiMode ? `<button class="secondary-button" type="button" data-action="change-password">修改密码</button>` : "",
    can("manage_users") ? `<button class="primary-button" type="button" data-action="add-user">＋ 新增成员</button>` : ""
  ].join("");
  return `
    ${pageHead(platformActions)}
    <section class="panel" style="margin-bottom:16px;">
      <div class="panel-head"><div><h2>五层技术架构</h2><p>按产品概要映射当前 MVP</p></div></div>
      <div class="panel-body architecture">${layers.map((item, index) => `<div class="architecture-layer"><div class="layer-number">${item[0]}</div><h3>${item[1]}</h3><p>${item[2]}</p>${badge(item[3], index === 2 ? "gold" : "teal")}</div>`).join("")}</div>
    </section>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head"><div><h2>Agent 办案流程</h2><p>检索 - 分析 - 生成 - 校验</p></div></div>
        <div class="panel-body"><div class="workflow">
          <div class="workflow-step"><strong>1. 意图识别</strong><span>识别案件、文书、检索与证据任务。</span></div>
          <div class="workflow-step"><strong>2. 知识检索</strong><span>按时效与层级召回正式法源和案例。</span></div>
          <div class="workflow-step"><strong>3. 内容生成</strong><span>结合案件权限范围内的事实与材料。</span></div>
          <div class="workflow-step"><strong>4. 引用校验</strong><span>核对出处、时效、逻辑与敏感信息。</span></div>
        </div></div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>安全与可信设置</h2><p>设置保存在当前浏览器</p></div></div>
        <div class="panel-body">
          ${[
            ["localDeploy", "本地化数据存储", "案件数据不离开当前浏览器"],
            ["masking", "敏感信息脱敏", "外部模型调用前隐藏身份字段"],
            ["audit", "操作审计留痕", "记录关键生成与导出动作"],
            ["sourceRequired", "回答强制附来源", "无可靠出处时提示人工核验"]
          ].map(([key, label, note]) => `<label style="display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--line);"><input type="checkbox" data-setting="${key}" ${state.settings[key] ? "checked" : ""} ${can("manage_settings") ? "" : "disabled"}><span class="case-meta" style="flex:1;"><strong>${label}</strong><span>${note}</span></span></label>`).join("")}
        </div>
      </section>
    </div>
    ${can("manage_users") ? `<section class="panel" style="margin-top:16px;">
      <div class="panel-head"><div><h2>成员与权限</h2><p>角色决定工作区数据和操作范围</p></div>${badge(`${workspaceUsers.length} 名成员`, "blue")}</div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>成员</th><th>角色</th><th>状态</th><th>案件范围</th><th>最近登录</th><th>操作</th></tr></thead>
        <tbody>${workspaceUsers.map(user => `<tr><td><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(user.email)}</small></td><td>${badge(roleLabel(user.role), user.role === "admin" ? "red" : user.role === "lawyer" ? "teal" : "blue")}</td><td>${badge(user.status === "active" ? "正常" : "已停用", user.status === "active" ? "green" : "red")}</td><td>${user.role === "client" ? `${user.caseIds.length} 个授权案件` : "工作区全部案件"}</td><td>${user.lastLogin ? formatDateTime(user.lastLogin) : "尚未登录"}</td><td><button class="quiet-button" type="button" data-action="edit-user" data-id="${user.id}">编辑</button></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty-state"><strong>暂无成员数据</strong>刷新页面后重试。</div></td></tr>`}</tbody>
      </table></div>
    </section>` : ""}
    ${can("manage_settings") && apiMode ? `<section class="panel" style="margin-top:16px;">
      <div class="panel-head"><div><h2>节假日维护</h2><p>用于期限顺延，集中维护、全员登录即生效</p></div><button class="primary-button" type="button" data-action="add-holiday-year">＋ 新增年度</button></div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>年度</th><th>状态</th><th>放假日</th><th>调休上班日</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>${Object.keys(holidayCalendars).sort().map(year => { const cal = holidayCalendars[year]; return `<tr><td><strong>${escapeHTML(year)}</strong></td><td>${badge(cal.verified ? "已核验" : "待核验", cal.verified ? "green" : "gold")}</td><td>${cal.holidays.length} 天</td><td>${cal.workdays.length} 天</td><td>${cal.updatedAt ? formatDateTime(cal.updatedAt) : "内置默认"}</td><td><button class="quiet-button" type="button" data-action="edit-holiday" data-year="${escapeHTML(year)}">编辑</button></td></tr>`; }).join("") || `<tr><td colspan="6"><div class="empty-state"><strong>暂无节假日数据</strong>点击「新增年度」录入。</div></td></tr>`}</tbody>
      </table></div>
    </section>` : ""}
    ${can("manage_settings") && apiMode ? `<section class="panel" style="margin-top:16px;">
      <div class="panel-head"><div><h2>外部推送投递记录</h2><p>提醒日报 webhook 的投递状态、重试与失败留痕</p></div><div style="display:flex;align-items:center;gap:8px;">${badge(webhookLog.configured ? "已配置 webhook" : "未配置 webhook", webhookLog.configured ? "green" : "gold")}${badge(`待发 ${webhookLog.pending} · 失败 ${webhookLog.failed}`, webhookLog.failed ? "red" : webhookLog.pending ? "gold" : "teal")}<button class="quiet-button" type="button" data-action="refresh-webhook-log">刷新</button>${webhookLog.pending ? `<button class="secondary-button" type="button" data-action="retry-webhook">重试待发</button>` : ""}</div></div>
      ${webhookLog.configured ? "" : `<div class="disclaimer" style="margin:0 16px 12px;">尚未配置 <code>HENGFA_REMINDER_WEBHOOK</code>，提醒仅在站内通知中心展示。配置后日报将自动推送到外部并在此留痕。</div>`}
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>创建时间</th><th>状态</th><th>尝试次数</th><th>失败原因</th><th>最近更新</th></tr></thead>
        <tbody>${webhookLog.log.map(item => `<tr><td>${formatDateTime(item.created_at)}</td><td>${badge(item.status === "sent" ? "已投递" : item.status === "failed" ? "失败" : "待发", item.status === "sent" ? "green" : item.status === "failed" ? "red" : "gold")}</td><td>${item.attempts}</td><td>${escapeHTML(item.last_error || "—")}</td><td>${item.updated_at ? formatDateTime(item.updated_at) : "—"}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state"><strong>暂无投递记录</strong>有提醒生成且配置 webhook 后会在此显示。</div></td></tr>`}</tbody>
      </table></div>
    </section>` : ""}
    ${can("view_audit") ? `<section class="panel" style="margin-top:16px;">
      <div class="panel-head"><div><h2>操作审计</h2><p>保留最近 100 条关键操作</p></div>${badge(`${state.auditLogs.length} 条`, "blue")}</div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>时间</th><th>操作</th><th>内容</th><th>案件</th><th>成员</th></tr></thead>
        <tbody>${state.auditLogs.slice(0, 10).map(item => `<tr><td>${formatDateTime(item.createdAt)}</td><td>${badge(item.action, "teal")}</td><td>${escapeHTML(item.detail)}</td><td>${escapeHTML(state.cases.find(caseItem => caseItem.id === item.caseId)?.title || "全局")}</td><td>${escapeHTML(item.member)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state"><strong>暂无审计记录</strong>关键生成、导出和状态变更会显示在这里。</div></td></tr>`}</tbody>
      </table></div>
    </section>` : ""}
    ${can("manage_settings") ? `<div style="margin-top:16px; text-align:right;"><button class="danger-button" type="button" data-action="reset-demo">重置演示数据</button></div>` : ""}`;
}

const renderers = {
  dashboard: renderDashboard,
  cases: renderCases,
  search: renderSearch,
  documents: renderDocuments,
  evidence: renderEvidence,
  strategy: renderStrategy,
  qa: renderQA,
  hearing: renderHearing,
  execution: renderExecution,
  collaboration: renderCollaboration,
  platform: renderPlatform
};

function renderPage() {
  document.querySelectorAll("[data-route]").forEach(button => button.classList.toggle("is-active", button.dataset.route === activeRoute && button.classList.contains("nav-item")));
  view.innerHTML = (renderers[activeRoute] || renderDashboard)();
  document.title = `${routeMeta[activeRoute][0]} · 衡法 AI 办案台`;
  if (activeRoute === "qa") requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
}

async function initializeApp() {
  // Capacitor(安卓本地演示)或非 http(file://)环境下直接进入本地演示模式,不连后端。
  if (window.Capacitor || !/^https?:$/.test(window.location.protocol)) {
    apiMode = false;
    currentUser = null;
    grantedPermissions = [];
    showApp();
    return;
  }
  try {
    const session = await apiRequest("/api/session");
    apiMode = true;
    currentUser = session.user;
    csrfToken = session.csrfToken;
    grantedPermissions = session.permissions || [];
    const bootstrap = await apiRequest("/api/bootstrap");
    const hasServerState = Object.prototype.hasOwnProperty.call(bootstrap.state || {}, "cases");
    state = hasServerState ? hydrateState(bootstrap.state) : loadState();
    serverRevision = bootstrap.revision;
    if (!state.cases.some(item => item.id === state.activeCaseId)) state.activeCaseId = state.cases[0]?.id || "";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    await loadCaseFiles();
    await loadLegalSources();
    await loadHolidays();
    await loadCitationImpacts();
    await loadNotifications();
    await loadWebhookLog();
    if (can("manage_users")) await loadWorkspaceUsers();
    showApp();
    if (!hasServerState) persist();
  } catch (error) {
    if (error.status === 401) {
      apiMode = true;
      currentUser = null;
      grantedPermissions = [];
      showLogin();
      return;
    }
    apiMode = false;
    currentUser = null;
    grantedPermissions = [];
    showApp();
    showToast("后端未连接，已切换到本地演示模式");
  }
}

function openDialog(title, body, formId, submitLabel = "保存") {
  dialogContent.innerHTML = `
    <form id="${formId}" method="dialog">
      <div class="dialog-head"><h2>${title}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
      <div class="dialog-body">${body}</div>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">取消</button><button class="primary-button" type="submit">${submitLabel}</button></div>
    </form>`;
  dialog.showModal();
}

function caseForm(caseItem = {}) {
  openDialog(caseItem.id ? "编辑案件" : "新建案件", `
    <input type="hidden" name="id" value="${escapeHTML(caseItem.id || "")}">
    <div class="form-grid">
      <div class="form-field full"><label>案件名称</label><input name="title" required value="${escapeHTML(caseItem.title || "")}" placeholder="当事人 + 案由"></div>
      <div class="form-field"><label>委托人</label><input name="client" required value="${escapeHTML(caseItem.client || "")}"></div>
      <div class="form-field"><label>对方当事人</label><input name="opposingParty" required value="${escapeHTML(caseItem.opposingParty || "")}"></div>
      <div class="form-field"><label>案由</label><input name="cause" required value="${escapeHTML(caseItem.cause || "")}"></div>
      <div class="form-field"><label>当前阶段</label><select name="stage">${stages.map(stage => `<option ${caseItem.stage === stage ? "selected" : ""}>${stage}</option>`).join("")}</select></div>
      <div class="form-field"><label>受理法院</label><input name="court" value="${escapeHTML(caseItem.court || "")}"></div>
      <div class="form-field"><label>案号</label><input name="caseNo" value="${escapeHTML(caseItem.caseNo || "")}"></div>
      <div class="form-field"><label>标的额</label><input name="amount" type="number" min="0" value="${escapeHTML(caseItem.amount || "")}"></div>
      <div class="form-field"><label>下一节点日期</label><input name="nextDate" type="date" value="${escapeHTML(caseItem.nextDate || dateFromNow(7))}"></div>
      <div class="form-field"><label>开庭日期</label><input name="hearingDate" type="date" value="${escapeHTML(caseItem.hearingDate || "")}"></div>
      <div class="form-field full"><label>下一关键节点</label><input name="nextEvent" value="${escapeHTML(caseItem.nextEvent || "材料准备截止")}"></div>
      <div class="form-field full"><label>诉讼请求</label><textarea name="claims">${escapeHTML(caseItem.claims || "")}</textarea></div>
      <div class="form-field full"><label>基本事实</label><textarea name="facts">${escapeHTML(caseItem.facts || "")}</textarea></div>
    </div>`, "case-form");
}

function caseEventForm() {
  openDialog("新增案件节点", `
    <div class="form-grid">
      <div class="form-field"><label>日期</label><input name="date" type="date" required value="${dateFromNow(3)}"></div>
      <div class="form-field"><label>节点类型</label><select name="type"><option>法定/指定期限</option><option>程序节点</option><option>庭审</option><option>会见</option><option>执行</option><option>内部节点</option></select></div>
      <div class="form-field full"><label>节点名称</label><input name="title" required placeholder="例如：提交答辩状截止"></div>
      <div class="form-field"><label>状态</label><select name="status"><option>待办理</option><option>已完成</option></select></div>
      <div class="form-field"><label>期限来源</label><input name="source" required placeholder="例如：法院通知 / 团队计划"></div>
      <div class="form-field full"><label>办理说明</label><textarea name="note" placeholder="材料要求、计算依据或下一步动作"></textarea></div>
      <div class="form-field full"><div class="form-note">期限日期应依据送达信息、法院通知和现行规则由办案人员复核。</div></div>
    </div>`, "case-event-form");
}

function evidenceForm() {
  const nextNo = currentEvidence().length + 1;
  openDialog("添加证据", `
    <div class="form-grid">
      <div class="form-field"><label>编号</label><input name="no" required value="证据 ${nextNo}"></div>
      <div class="form-field"><label>证据名称</label><input name="name" required></div>
      <div class="form-field"><label>证据类型</label><select name="type"><option>书证</option><option>电子数据</option><option>视听资料</option><option>证人证言</option><option>鉴定意见</option><option>勘验笔录</option><option>其他</option></select></div>
      <div class="form-field"><label>来源</label><input name="source" required></div>
      <div class="form-field full"><label>关联待证事实</label><textarea name="fact" required></textarea></div>
      <div class="form-field"><label>证明力参考</label><select name="strength"><option>中</option><option>强</option><option>弱</option></select></div>
      <div class="form-field"><label>风险</label><select name="risk"><option>中</option><option>低</option><option>高</option></select></div>
      <div class="form-field full"><label>核验备注</label><textarea name="note" placeholder="例如：需核对原件、主体身份或完整上下文"></textarea></div>
    </div>`, "evidence-form");
}

function fileUploadForm() {
  openDialog("上传案件材料", `
    <div class="form-grid">
      <div class="form-field full"><label>选择文件</label><input id="case-file-input" name="files" type="file" multiple required accept=".pdf,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp"></div>
      <div class="form-field full"><div class="disclaimer">文件仅保存到当前服务端私有目录。单个文件不超过 25 MB；扫描 PDF 和图片会调用本机中文 OCR。</div></div>
    </div>`, "file-upload-form", "上传并识别");
}

async function saveFileUpload(form) {
  const files = [...form.querySelector("#case-file-input").files];
  if (!files.length) return showToast("请选择需要上传的案件材料");
  try {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} 超过 25 MB`);
      showToast(`正在处理：${file.name}`);
      const response = await fetch(`/api/files?caseId=${encodeURIComponent(state.activeCaseId)}&name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-CSRF-Token": csrfToken },
        body: file
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `${file.name} 上传失败`);
    }
    await loadCaseFiles();
    dialog.close();
    renderPage();
    showToast(`${files.length} 个文件已上传并完成文字提取`);
  } catch (error) {
    showToast(error.message);
  }
}

function showFileDetail(file) {
  dialogContent.innerHTML = `
    <div class="dialog-head"><h2>${escapeHTML(file.name)}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
    <div class="dialog-body">
      <div class="file-detail-meta">${badge(file.status === "processed" ? "已提取" : file.status === "partial" ? "需复核" : "处理失败", file.status === "processed" ? "green" : file.status === "partial" ? "gold" : "red")}${badge(file.method || "无提取方式", "blue")}<span>${formatBytes(file.size)}</span><span>${file.textLength.toLocaleString()} 字</span></div>
      ${file.error ? `<div class="disclaimer" style="margin:12px 0;">${escapeHTML(file.error)}</div>` : ""}
      <label class="file-text-label">提取文字</label>
      <textarea class="file-text-preview" readonly>${escapeHTML(file.extractedText || "未识别到文字")}</textarea>
      <div class="source-line" style="margin-top:10px;">SHA-256：${escapeHTML(file.sha256)}</div>
    </div>
    <div class="dialog-actions"><button class="secondary-button" type="button" data-action="download-file" data-id="${file.id}">下载原文件</button>${can("manage_evidence") ? `<button class="secondary-button" type="button" data-action="reprocess-file" data-id="${file.id}">重新 OCR</button>` : ""}<button class="primary-button" type="button" data-action="close-dialog">关闭</button></div>`;
  dialog.showModal();
}

function downloadCaseFile(fileId) {
  const link = document.createElement("a");
  link.href = `/api/files/${encodeURIComponent(fileId)}/download`;
  link.click();
}

function taskForm() {
  openDialog("新建团队任务", `
    <div class="form-grid">
      <div class="form-field full"><label>任务内容</label><input name="title" required></div>
      <div class="form-field"><label>负责人</label><input name="owner" required value="谢律师"></div>
      <div class="form-field"><label>截止日期</label><input name="dueDate" type="date" required value="${dateFromNow(3)}"></div>
      <div class="form-field"><label>优先级</label><select name="priority"><option>中</option><option>高</option><option>低</option></select></div>
      <div class="form-field"><label>关联案件</label><select name="caseId">${state.cases.map(item => `<option value="${item.id}" ${item.id === state.activeCaseId ? "selected" : ""}>${escapeHTML(item.title)}</option>`).join("")}</select></div>
    </div>`, "task-form");
}

function timeForm() {
  openDialog("登记工时", `
    <div class="form-grid">
      <div class="form-field"><label>成员</label><input name="member" required value="谢律师"></div>
      <div class="form-field"><label>小时</label><input name="hours" type="number" min="0.1" step="0.1" required value="1.0"></div>
      <div class="form-field"><label>日期</label><input name="date" type="date" required value="${dateFromNow(0)}"></div>
      <div class="form-field"><label>工作事项</label><input name="activity" required placeholder="例如：证据审查"></div>
    </div>`, "time-form");
}

function clientForm(client = {}) {
  openDialog(client.id ? "编辑客户" : "新增客户", `
    <input type="hidden" name="id" value="${escapeHTML(client.id || "")}">
    <div class="form-grid">
      <div class="form-field"><label>客户名称</label><input name="name" required value="${escapeHTML(client.name || "")}"></div>
      <div class="form-field"><label>联系方式</label><input name="contact" value="${escapeHTML(client.contact || "")}" placeholder="电话 / 邮箱"></div>
      <div class="form-field full"><label>案源渠道</label><input name="channel" value="${escapeHTML(client.channel || "")}" placeholder="如：老客户转介绍 / 线上咨询 / 合作律所推荐"></div>
      <div class="form-field full"><label>关联案件（可多选）</label><select name="caseIds" multiple size="3">${state.cases.map(item => `<option value="${item.id}" ${(client.caseIds || []).includes(item.id) ? "selected" : ""}>${escapeHTML(item.title)}</option>`).join("")}</select></div>
      <div class="form-field full"><label>备注</label><textarea name="note">${escapeHTML(client.note || "")}</textarea></div>
    </div>`, "client-form");
}

function clueForm() {
  openDialog("添加财产线索", `
    <div class="form-grid">
      <div class="form-field"><label>线索类型</label><select name="type"><option>银行账户</option><option>不动产</option><option>车辆</option><option>股权</option><option>到期债权</option><option>网络资金</option><option>其他</option></select></div>
      <div class="form-field"><label>来源</label><input name="source" required></div>
      <div class="form-field full"><label>线索描述</label><textarea name="description" required></textarea></div>
      <div class="form-field"><label>状态</label><select name="status"><option>待核验</option><option>待申请调查</option><option>已提交</option></select></div>
    </div>`, "clue-form");
}

function userForm(user = {}) {
  const selectedCases = new Set(user.caseIds || []);
  openDialog(user.id ? "编辑成员权限" : "新增工作区成员", `
    <input type="hidden" name="id" value="${escapeHTML(user.id || "")}">
    <div class="form-grid">
      <div class="form-field"><label>姓名</label><input name="name" required value="${escapeHTML(user.name || "")}"></div>
      <div class="form-field"><label>角色</label><select name="role">
        ${[["lawyer", "承办律师"], ["assistant", "律师助理"], ["client", "当事人"], ["admin", "系统管理员"]].map(([value, label]) => `<option value="${value}" ${user.role === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></div>
      <div class="form-field full"><label>邮箱</label><input name="email" type="email" required value="${escapeHTML(user.email || "")}" ${user.id ? "readonly" : ""}></div>
      ${user.id ? `<div class="form-field full"><label>账号状态</label><select name="status"><option value="active" ${user.status === "active" ? "selected" : ""}>正常</option><option value="disabled" ${user.status === "disabled" ? "selected" : ""}>停用</option></select></div>` : `<div class="form-field full"><label>初始密码</label><input name="password" type="password" minlength="10" required autocomplete="new-password"><div class="form-note">至少 10 个字符，建议首次登录后立即修改。</div></div>`}
      <div class="form-field full"><label>当事人可见案件</label><div class="case-access-list">
        ${state.cases.map(caseItem => `<label><input type="checkbox" name="caseIds" value="${caseItem.id}" ${selectedCases.has(caseItem.id) ? "checked" : ""}><span>${escapeHTML(caseItem.title)}</span></label>`).join("") || `<span class="form-note">当前没有可分配案件。</span>`}
      </div><div class="form-note">仅“当事人”角色按此范围隔离；内部成员默认访问整个工作区。</div></div>
    </div>`, "user-form", user.id ? "保存权限" : "创建成员");
}

function changePasswordForm() {
  openDialog("修改登录密码", `
    <div class="form-grid">
      <div class="form-field full"><label>当前密码</label><input name="currentPassword" type="password" required autocomplete="current-password"></div>
      <div class="form-field full"><label>新密码</label><input name="newPassword" type="password" minlength="10" required autocomplete="new-password"></div>
      <div class="form-field full"><label>确认新密码</label><input name="confirmPassword" type="password" minlength="10" required autocomplete="new-password"></div>
    </div>`, "password-form", "更新密码");
}

function legalSourceForm() {
  openDialog("导入正式法源", `
    <div class="form-grid">
      <div class="form-field full"><label>法源名称</label><input name="title" required placeholder="法律、司法解释或指导性案例名称"></div>
      <div class="form-field"><label>发布机关</label><input name="authority" required placeholder="例如：全国人大常委会"></div>
      <div class="form-field"><label>效力层级</label><select name="level"><option>法律</option><option>司法解释</option><option>行政法规</option><option>指导性案例</option><option>典型案例</option><option>其他</option></select></div>
      <div class="form-field"><label>效力状态</label><select name="status"><option>现行有效</option><option>尚未生效</option><option>已失效</option><option>待核验</option></select></div>
      <div class="form-field"><label>生效日期</label><input name="effectiveDate" type="date"></div>
      <div class="form-field"><label>有效期至（可选）</label><input name="validUntil" type="date"></div>
      <div class="form-field full"><label>正式来源 URL</label><input name="sourceUrl" type="url" placeholder="https://..."></div>
      <div class="form-field full"><label>经核验的法源正文</label><textarea name="text" required style="min-height:220px;" placeholder="粘贴完整正式文本，系统会自动分段建立检索索引"></textarea></div>
      <div class="form-field full"><div class="disclaimer">请仅导入来自国家法律法规数据库、人民法院等权威渠道的文本，并准确维护效力状态。</div></div>
    </div>`, "legal-source-form", "入库并建立索引");
}

function holidayForm(year = "") {
  const cal = (year && holidayCalendars[year]) || { verified: false, holidays: [], workdays: [] };
  openDialog(year ? `编辑 ${year} 年节假日` : "新增年度节假日", `
    <div class="form-grid">
      <div class="form-field"><label>年度</label><input name="year" value="${escapeHTML(year)}" ${year ? "readonly" : "required placeholder=\"如 2027\""} pattern="\\d{4}"></div>
      <div class="form-field"><label>核验状态</label><label class="batch-check" style="margin-top:8px;"><input type="checkbox" name="verified" ${cal.verified ? "checked" : ""}> 已按国务院公告核验</label></div>
      <div class="form-field full"><label>放假日（每行一个，YYYY-MM-DD）</label><textarea name="holidays" style="min-height:150px;">${escapeHTML(cal.holidays.join("\n"))}</textarea></div>
      <div class="form-field full"><label>调休上班日（周末须上班的日期，每行一个）</label><textarea name="workdays" style="min-height:80px;">${escapeHTML(cal.workdays.join("\n"))}</textarea></div>
      <div class="form-field full"><div class="disclaimer">节假日由国务院每年公告并含调休，请以官方公告为准；保存后全体成员下次进入即生效。</div></div>
    </div>`, "holiday-form", "保存并下发");
}

async function saveHoliday(form) {
  const data = formDataObject(form);
  const year = String(data.year || "").trim();
  if (!/^\d{4}$/.test(year)) return showToast("请填写 4 位年度，例如 2027");
  const parseList = text => String(text || "").split("\n").map(item => item.trim()).filter(Boolean);
  try {
    await apiRequest(`/api/holidays/${year}`, { method: "PUT", body: { verified: Boolean(data.verified), holidays: parseList(data.holidays), workdays: parseList(data.workdays) } });
    await loadHolidays();
    dialog.close();
    renderPage();
    showToast(`${year} 年节假日已保存，全员生效`);
  } catch (error) {
    showToast(error.message);
  }
}

function formDataObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function saveUser(form) {
  const data = formDataObject(form);
  const payload = { ...data, caseIds: new FormData(form).getAll("caseIds") };
  try {
    if (data.id) await apiRequest(`/api/users/${encodeURIComponent(data.id)}`, { method: "PATCH", body: payload });
    else await apiRequest("/api/users", { method: "POST", body: payload });
    dialog.close();
    await loadWorkspaceUsers();
    renderPage();
    showToast(data.id ? "成员权限已更新" : "成员账号已创建");
  } catch (error) {
    showToast(error.message);
  }
}

async function savePassword(form) {
  const data = formDataObject(form);
  if (data.newPassword !== data.confirmPassword) return showToast("两次输入的新密码不一致");
  try {
    await apiRequest("/api/auth/change-password", { method: "POST", body: data });
    dialog.close();
    showToast("密码已更新，其他会话已退出");
  } catch (error) {
    showToast(error.message);
  }
}

async function saveLegalSource(form) {
  const data = formDataObject(form);
  try {
    await apiRequest("/api/legal/sources", { method: "POST", body: data });
    await loadLegalSources();
    legalRagResults = null;
    dialog.close();
    renderPage();
    showToast("正式法源已入库并建立检索索引");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteLegalSource(id) {
  if (!id || !window.confirm("确定从法源库删除该法源及其检索索引吗？")) return;
  try {
    await apiRequest(`/api/legal/sources/${encodeURIComponent(id)}`, { method: "DELETE", body: {} });
    await loadLegalSources();
    legalRagResults = null;
    renderPage();
    showToast("法源已删除");
  } catch (error) {
    showToast(error.message);
  }
}

function legalSourceEditForm(source) {
  if (!source) return;
  const statuses = ["现行有效", "尚未生效", "已修改", "已废止", "待核验"];
  const known = statuses.includes(source.status);
  openDialog(`编辑法源 · ${escapeHTML(String(source.title).slice(0, 16))}`, `
    <input type="hidden" name="id" value="${escapeHTML(source.id)}">
    <div class="form-grid">
      <div class="form-field full"><label>名称</label><input name="title" value="${escapeHTML(source.title)}" required></div>
      <div class="form-field"><label>效力状态</label><select name="status">${statuses.map(item => `<option ${item === source.status ? "selected" : ""}>${item}</option>`).join("")}${known ? "" : `<option selected>${escapeHTML(source.status)}</option>`}</select></div>
      <div class="form-field"><label>生效日期</label><input name="effectiveDate" type="date" value="${escapeHTML(source.effectiveDate || "")}"></div>
      <div class="form-field"><label>有效期至（可选，到期前提醒复核）</label><input name="validUntil" type="date" value="${escapeHTML(source.validUntil || "")}"></div>
      <div class="form-field"><label>发布机关</label><input name="authority" value="${escapeHTML(source.authority || "")}"></div>
      <div class="form-field"><label>效力层级</label><input name="level" value="${escapeHTML(source.level || "")}"></div>
      <div class="form-field full"><label>来源链接</label><input name="sourceUrl" type="url" value="${escapeHTML(source.sourceUrl || "")}"></div>
      <div class="form-field full"><div class="disclaimer">修改效力状态等字段将自动记录变更留痕（谁、何时、由何值改为何值）；正文内容如需修改请删除后重新导入。</div></div>
    </div>`, "legal-edit-form", "保存变更");
}

async function saveLegalEdit(form) {
  const data = formDataObject(form);
  try {
    const result = await apiRequest(`/api/legal/sources/${encodeURIComponent(data.id)}`, { method: "PATCH", body: { title: data.title, status: data.status, effectiveDate: data.effectiveDate, validUntil: data.validUntil, authority: data.authority, level: data.level, sourceUrl: data.sourceUrl } });
    await loadLegalSources();
    await loadCitationImpacts();
    legalRagResults = null;
    dialog.close();
    renderPage();
    const impactNote = citationImpacts.length ? `，注意 ${citationImpacts.length} 份文书引用了失效法源` : "";
    showToast(result.changes ? `已保存 ${result.changes} 项变更并留痕${impactNote}` : "未检测到字段变更");
  } catch (error) {
    showToast(error.message);
  }
}

async function showLegalRevisions(id) {
  try {
    const data = await apiRequest(`/api/legal/sources/${encodeURIComponent(id)}/revisions`);
    const rows = (data.revisions || []).map(item => `<div class="rev-row">
      <div class="rev-meta">${badge(item.field, "teal")}<span>${escapeHTML(item.member)} · ${formatDateTime(item.changedAt)}</span></div>
      <div class="rev-change">${item.oldValue ? `<span class="rev-old">${escapeHTML(item.oldValue)}</span> → ` : ""}<span class="rev-new">${escapeHTML(item.newValue || "（空）")}</span></div>
    </div>`).join("") || `<div class="empty-state"><strong>暂无变更记录</strong>该法源尚未发生字段变更。</div>`;
    dialogContent.innerHTML = `<div class="dialog-head"><h2>变更记录 · ${escapeHTML(data.title || "")}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></div>
      <div class="dialog-body"><div class="rev-list">${rows}</div></div>
      <div class="dialog-actions"><button class="primary-button" type="button" data-action="close-dialog">关闭</button></div>`;
    dialog.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

// 批量导入法源 JSON（如 scripts/fetch_flk.mjs 抓取的官方法源结果）。
function importLegalJson() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const sources = Array.isArray(parsed) ? parsed : parsed.sources;
      if (!Array.isArray(sources) || !sources.length) return showToast("JSON 需为 sources 数组（或顶层数组）");
      const result = await apiRequest("/api/legal/import", { method: "POST", body: { sources } });
      await loadLegalSources();
      legalRagResults = null;
      renderPage();
      showToast(`已导入 ${result.imported} 条法源（${result.chunks} 个检索片段，跳过 ${result.skipped}）`);
    } catch (error) {
      showToast(error.code === "IMPORT_EMPTY" ? "没有可导入的法源" : `导入失败：${error.message}`);
    }
  });
  input.click();
}

function saveCase(form) {
  const data = formDataObject(form);
  const existing = state.cases.find(item => item.id === data.id);
  const item = {
    id: existing?.id || uid("case"),
    title: data.title,
    client: data.client,
    opposingParty: data.opposingParty,
    cause: data.cause,
    court: data.court || "待确定",
    caseNo: data.caseNo || "待立案",
    stage: data.stage,
    amount: Number(data.amount || 0),
    openedAt: existing?.openedAt || dateFromNow(0),
    nextDate: data.nextDate,
    nextEvent: data.nextEvent,
    hearingDate: data.hearingDate || "",
    claims: data.claims,
    facts: data.facts,
    risk: existing?.risk || 50
  };
  if (existing) Object.assign(existing, item); else state.cases.unshift(item);
  state.activeCaseId = item.id;
  documentDraft = "";
  recordAudit(existing ? "案件更新" : "案件创建", item.title, item.id);
  persist();
  dialog.close();
  renderCaseSelect();
  activeRoute = "cases";
  renderPage();
  showToast(existing ? "案件已更新" : "案件已创建");
}

function saveCaseEvent(form) {
  const data = formDataObject(form);
  state.caseEvents.push({ id: uid("event"), caseId: state.activeCaseId, ...data });
  recordAudit("节点新增", `${data.title} · ${data.date}`);
  persist();
  dialog.close();
  caseViewMode = data.type.includes("期限") || data.type === "庭审" ? "deadlines" : "timeline";
  renderPage();
  showToast("案件节点已保存");
}

function saveEvidence(form) {
  const data = formDataObject(form);
  state.evidence.push({ id: uid("ev"), caseId: state.activeCaseId, ...data, status: "待核验" });
  recordAudit("证据新增", data.name);
  persist();
  dialog.close();
  renderPage();
  showToast("证据已加入目录");
}

function saveTask(form) {
  const data = formDataObject(form);
  state.tasks.push({ id: uid("task"), ...data, done: false });
  recordAudit("任务创建", data.title, data.caseId);
  persist();
  dialog.close();
  renderPage();
  showToast("团队任务已创建");
}

function saveTime(form) {
  const data = formDataObject(form);
  state.timeLogs.push({ id: uid("time"), caseId: state.activeCaseId, ...data, hours: Number(data.hours) });
  persist();
  dialog.close();
  renderPage();
  showToast("工时已登记");
}

function saveClue(form) {
  const data = formDataObject(form);
  state.assetClues.push({ id: uid("clue"), caseId: state.activeCaseId, ...data, updatedAt: dateFromNow(0) });
  recordAudit("财产线索新增", `${data.type} · ${data.description}`);
  persist();
  dialog.close();
  renderPage();
  showToast("财产线索已保存");
}

function saveClient(form) {
  const data = formDataObject(form);
  const caseIds = new FormData(form).getAll("caseIds");
  const fields = { name: data.name, contact: data.contact || "", channel: data.channel || "", note: data.note || "", caseIds };
  state.clients = state.clients || [];
  if (data.id) {
    const existing = state.clients.find(item => item.id === data.id);
    if (existing) Object.assign(existing, fields);
  } else {
    state.clients.push({ id: uid("client"), ...fields, createdAt: dateFromNow(0) });
  }
  recordAudit(data.id ? "客户更新" : "客户新增", data.name);
  persist();
  dialog.close();
  renderPage();
  showToast("客户信息已保存");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  showToast("内容已复制");
}

// —— 零依赖客户端 DOCX 生成（ZIP/STORE + CRC32 + OOXML，Word/WPS 可直接打开）——
function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function concatBytes(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let pos = 0;
  for (const part of parts) { out.set(part, pos); pos += part.length; }
  return out;
}

function zipStore(entries) {
  const encoder = new TextEncoder();
  const u16 = n => new Uint8Array([n & 255, (n >>> 8) & 255]);
  const u32 = n => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const locals = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = concatBytes([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    central.push(concatBytes([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const block of central) centralSize += block.length;
  const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(centralSize), u32(centralStart), u16(0)]);
  return concatBytes([...locals, ...central, end]);
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function docxParagraph(text, heading = false) {
  if (!text) return "<w:p/>";
  const pPr = heading ? `<w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="160"/></w:pPr>` : "";
  const rPr = heading ? `<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>` : "";
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildDocx(title, bodyText) {
  const lines = String(bodyText || "").replace(/\r\n?/g, "\n").split("\n");
  const paragraphs = [docxParagraph(title || lines[0] || "文书", true)];
  const start = lines[0] && lines[0].trim() === String(title || "").trim() ? 1 : 0;
  for (let i = start; i < lines.length; i += 1) paragraphs.push(docxParagraph(lines[i].replace(/\t/g, "    ")));
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const encoder = new TextEncoder();
  const zip = zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rels) },
    { name: "word/document.xml", data: encoder.encode(documentXml) }
  ]);
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function downloadDocx(filename, title, bodyText) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(buildDocx(title, bodyText));
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

document.addEventListener("click", async event => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    activeRoute = routeButton.dataset.route;
    renderPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const actionPermissions = {
    "new-case": "create_case",
    "edit-case": "edit_case",
    "add-evidence": "manage_evidence",
    "upload-file": "manage_evidence",
    "delete-file": "manage_evidence",
    "reprocess-file": "manage_evidence",
    "cycle-evidence": "manage_evidence",
    "add-clue": "manage_evidence",
    "add-task": "manage_tasks",
    "add-time": "manage_tasks",
    "toggle-task": "manage_tasks",
    "add-client": "manage_tasks",
    "edit-client": "manage_tasks",
    "delete-client": "manage_tasks",
    "toggle-archive": "edit_case",
    "select-template": "export_documents",
    "refresh-document": "export_documents",
    "copy-document": "export_documents",
    "download-document": "export_documents",
    "save-version": "export_documents",
    "compare-versions": "export_documents",
    "extract-facts": "export_documents",
    "transcribe-audio": "export_documents",
    "import-transcript": "export_documents",
    "hearing-summary": "export_documents",
    "copy-hearing": "export_documents",
    "download-hearing": "export_documents",
    "add-user": "manage_users",
    "edit-user": "manage_users",
    "add-holiday-year": "manage_settings",
    "edit-holiday": "manage_settings",
    "edit-legal-source": "manage_settings",
    "legal-revisions": "manage_settings",
    "reset-demo": "manage_settings"
  };
  const requiredPermission = actionPermissions[action];
  if (requiredPermission && !can(requiredPermission)) return showToast("当前角色无权执行此操作");
  if (["add-case-event", "toggle-event"].includes(action) && !can("edit_case") && !can("manage_tasks")) return showToast("当前角色无权修改案件节点");
  if (action === "new-case") caseForm();
  if (action === "edit-case") caseForm(currentCase());
  if (action === "add-case-event") caseEventForm();
  if (action === "deadline-calc") {
    if (!can("edit_case") && !can("manage_tasks")) return showToast("当前角色无权修改案件节点");
    if (!currentCase()) return showToast("请先选择案件");
    deadlineCalculatorDialog();
  }
  if (action === "write-deadline") {
    if (!can("edit_case") && !can("manage_tasks")) return showToast("当前角色无权修改案件节点");
    if (!pendingDeadline) return showToast("请先选择送达日期与文书类型");
    state.caseEvents.push({
      id: uid("event"), caseId: state.activeCaseId, date: pendingDeadline.date, title: pendingDeadline.title,
      type: "法定/指定期限", status: daysUntil(pendingDeadline.date) < 0 ? "已完成" : "待办理",
      source: `按送达日期 ${pendingDeadline.serviceDate} 推算`, note: `自送达次日起算 ${pendingDeadline.days} 日`
    });
    recordAudit("期限推算写入", `${pendingDeadline.title} · ${pendingDeadline.date}`);
    pendingDeadline = null;
    persist();
    dialog.close();
    caseViewMode = "deadlines";
    renderPage();
    showToast("期限已写入程序时间轴");
  }
  if (action === "deadline-batch") {
    if (!can("edit_case") && !can("manage_tasks")) return showToast("当前角色无权修改案件节点");
    if (!currentCase()) return showToast("请先选择案件");
    batchDeadlineDialog();
  }
  if (action === "write-batch") {
    if (!can("edit_case") && !can("manage_tasks")) return showToast("当前角色无权修改案件节点");
    const service = document.querySelector("#batch-service-date")?.value;
    if (!service) return showToast("请填写通知送达日期");
    const caseId = state.activeCaseId;
    const existing = new Set(state.caseEvents.filter(item => item.caseId === caseId).map(item => `${item.date}|${item.title}`));
    let added = 0;
    for (const row of BATCH_DEADLINES) {
      if (!document.querySelector(`#batch-${row.key}-on`)?.checked) continue;
      const days = Number(document.querySelector(`#batch-${row.key}-days`)?.value) || 0;
      if (days <= 0) continue;
      const { deadline } = computeStatutoryDeadline(service, days);
      const key = `${deadline}|${row.title}`;
      if (existing.has(key)) continue;
      state.caseEvents.push({ id: uid("event"), caseId, date: deadline, title: row.title, type: "法定/指定期限", status: daysUntil(deadline) < 0 ? "已完成" : "待办理", source: `按通知送达 ${service} 推算`, note: `自送达次日起算 ${days} 日` });
      existing.add(key);
      added += 1;
    }
    const hearing = document.querySelector("#batch-hearing-date")?.value;
    if (hearing && !existing.has(`${hearing}|第一次开庭`)) {
      state.caseEvents.push({ id: uid("event"), caseId, date: hearing, title: "第一次开庭", type: "庭审", status: daysUntil(hearing) < 0 ? "已完成" : "待办理", source: "开庭传票", note: "庭前完成发问提纲与质证意见" });
      added += 1;
    }
    if (!added) return showToast("没有可写入的期限（或均已存在）");
    recordAudit("批量期限推算", `写入 ${added} 个节点`);
    persist();
    dialog.close();
    caseViewMode = "deadlines";
    renderPage();
    showToast(`已批量写入 ${added} 个节点`);
  }
  if (action === "close-dialog") dialog.close();
  if (action === "add-evidence") evidenceForm();
  if (action === "upload-file") fileUploadForm();
  if (action === "add-task") taskForm();
  if (action === "add-time") timeForm();
  if (action === "add-clue") clueForm();
  if (action === "add-client") clientForm();
  if (action === "edit-client") clientForm((state.clients || []).find(item => item.id === button.dataset.id));
  if (action === "delete-client") {
    state.clients = (state.clients || []).filter(item => item.id !== button.dataset.id);
    persist();
    renderPage();
    showToast("客户已删除");
  }
  if (action === "toggle-archive") {
    const target = state.cases.find(item => item.id === button.dataset.id);
    if (target) {
      target.archived = !target.archived;
      target.archivedAt = target.archived ? dateFromNow(0) : "";
      if (target.archived && state.activeCaseId === target.id) {
        state.activeCaseId = state.cases.find(item => !item.archived)?.id || target.id;
      }
      recordAudit(target.archived ? "案件归档" : "取消归档", target.title, target.id);
      persist();
      renderCaseSelect();
      renderPage();
      showToast(target.archived ? "案件已归档" : "已取消归档");
    }
  }
  if (action === "add-user") userForm();
  if (action === "edit-user") {
    const user = workspaceUsers.find(item => item.id === button.dataset.id);
    if (user) userForm(user);
  }
  if (action === "change-password") changePasswordForm();
  if (action === "add-holiday-year") holidayForm();
  if (action === "edit-holiday") holidayForm(button.dataset.year);
  if (action === "add-legal-source") legalSourceForm();
  if (action === "import-legal-json") importLegalJson();
  if (action === "delete-legal-source") deleteLegalSource(button.dataset.id);
  if (action === "edit-legal-source") legalSourceEditForm(legalSources.find(item => item.id === button.dataset.id));
  if (action === "legal-revisions") showLegalRevisions(button.dataset.id);
  if (action === "view-file") {
    try {
      const data = await apiRequest(`/api/files/${encodeURIComponent(button.dataset.id)}`);
      showFileDetail(data.file);
    } catch (error) {
      showToast(error.message);
    }
  }
  if (action === "download-file") downloadCaseFile(button.dataset.id);
  if (action === "delete-file") {
    const file = caseFiles.find(item => item.id === button.dataset.id);
    if (window.confirm(`确定删除“${file?.name || "该文件"}”及其 OCR 结果吗？`)) {
      try {
        await apiRequest(`/api/files/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE", body: {} });
        await loadCaseFiles();
        dialog.close();
        renderPage();
        showToast("案件材料已删除");
      } catch (error) {
        showToast(error.message);
      }
    }
  }
  if (action === "reprocess-file") {
    try {
      const data = await apiRequest(`/api/files/${encodeURIComponent(button.dataset.id)}/reprocess`, { method: "POST", body: {} });
      await loadCaseFiles();
      showFileDetail(data.file);
      showToast("文字提取已重新完成");
    } catch (error) {
      showToast(error.message);
    }
  }
  if (action === "set-case") {
    state.activeCaseId = button.dataset.id;
    documentDraft = "";
    documentReviewResults = [];
    documentFacts = null;
    documentVerification = null;
    strategyTendency = null;
    hearingTranscript = null;
    hearingSummary = null;
    persist();
    renderCaseSelect();
    renderPage();
  }
  if (action === "goto-case") {
    state.activeCaseId = button.dataset.id;
    caseViewMode = "timeline";
    activeRoute = "cases";
    documentDraft = "";
    documentReviewResults = [];
    documentFacts = null;
    documentVerification = null;
    strategyTendency = null;
    hearingTranscript = null;
    hearingSummary = null;
    persist();
    renderCaseSelect();
    renderPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (action === "case-view") {
    caseViewMode = button.dataset.mode;
    renderPage();
  }
  if (action === "toggle-event") {
    const item = state.caseEvents.find(entry => entry.id === button.dataset.id);
    if (item) {
      item.status = item.status === "已完成" ? "待办理" : "已完成";
      recordAudit("节点状态", `${item.title} · ${item.status}`, item.caseId);
      persist();
      renderPage();
    }
  }
  if (action === "run-search") {
    legalQuery = document.querySelector("#legal-search-input")?.value || "";
    legalLevel = document.querySelector("#legal-level-filter")?.value || "全部";
    legalIncludeLapsed = document.querySelector("#legal-include-lapsed")?.checked || false;
    if (apiMode) runLegalSearch();
    else renderPage();
  }
  if (action === "select-template") {
    selectedTemplate = button.dataset.template;
    documentDraft = generateDocument(selectedTemplate, currentCase());
    documentReviewResults = [];
    documentVerification = null;
    state.metrics.documentsGenerated += 1;
    recordAudit("文书生成", templateLabels[selectedTemplate]);
    persist();
    renderPage();
  }
  if (action === "refresh-document") {
    documentDraft = generateDocument(selectedTemplate, currentCase());
    documentReviewResults = [];
    documentVerification = null;
    state.metrics.documentsGenerated += 1;
    recordAudit("文书重新生成", templateLabels[selectedTemplate]);
    persist();
    renderPage();
    showToast("文书已重新生成");
  }
  if (action === "extract-facts") runFactExtraction();
  if (action === "strategy-tendency") runStrategyTendency();
  if (action === "transcribe-audio") runTranscribe(document.querySelector("#transcribe-file")?.value || "");
  if (action === "import-transcript") runImportTranscript(document.querySelector("#transcript-import")?.value || "");
  if (action === "hearing-summary") runHearingSummary();
  if (action === "timeline-to-events") {
    if (!can("edit_case") && !can("manage_tasks")) return showToast("当前角色无权修改案件节点");
    const caseId = state.activeCaseId;
    const existing = new Set(state.caseEvents.filter(item => item.caseId === caseId).map(item => `${item.date}|${item.note}`));
    let added = 0;
    for (const item of documentTimeline) {
      const key = `${item.date}|${item.fact}`;
      if (existing.has(key)) continue;
      state.caseEvents.push({
        id: uid("event"), caseId, date: item.date, title: item.fact.slice(0, 30),
        type: "事实抽取", status: daysUntil(item.date) < 0 ? "已完成" : "待办理",
        source: item.source || "案件材料", note: item.fact
      });
      existing.add(key);
      added += 1;
    }
    if (!added) return showToast("时间线节点均已在程序时间轴中");
    recordAudit("时间线写入", `${added} 个事实节点写入程序时间轴`, caseId);
    persist();
    renderPage();
    showToast(`已写入 ${added} 个时间节点，可在「案件管理」时间轴查看`);
  }
  if (action === "insert-fact") {
    const fact = documentFacts?.[Number(button.dataset.index)]?.fact;
    const editor = document.querySelector("#document-editor");
    if (fact && editor) {
      const pos = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
      editor.value = `${editor.value.slice(0, pos)}${fact}\n${editor.value.slice(pos)}`;
      documentDraft = editor.value;
      documentReviewResults = [];
      documentVerification = null;
      editor.focus();
      showToast("已插入事实，请核验");
    }
  }
  if (action === "review-document") {
    documentDraft = document.querySelector("#document-editor")?.value || documentDraft;
    if (apiMode) {
      runDocumentVerify();
    } else {
      documentReviewResults = reviewDocument(documentDraft, currentCase());
      documentVerification = null;
      recordAudit("文书审查", `${templateLabels[selectedTemplate]} · ${documentReviewResults.filter(item => item.level !== "pass").length} 项提示`);
      persist();
      renderPage();
      showToast("文书审查已完成");
    }
  }
  if (action === "copy-document") copyText(document.querySelector("#document-editor")?.value || "");
  if (action === "download-document") {
    const content = document.querySelector("#document-editor")?.value || "";
    const label = templateLabels[selectedTemplate];
    downloadDocx(`${label}-${currentCase()?.client || "案件"}.docx`, label, content);
    const version = snapshotVersion(content);
    recordAudit("文书导出", `${label} · ${version} · DOCX`);
    persist();
    loadCitationImpacts();
    showToast(`文书已导出为 DOCX 并记录 ${version}`);
  }
  if (action === "save-version") {
    const content = document.querySelector("#document-editor")?.value || documentDraft;
    const version = snapshotVersion(content);
    recordAudit("文书版本", `${templateLabels[selectedTemplate]} · ${version}`);
    persist();
    loadCitationImpacts();
    renderPage();
    showToast(`已保存版本 ${version}`);
  }
  if (action === "compare-versions") compareVersionsDialog();
  if (action === "search-legal-ref") {
    if (dialog.open) dialog.close();
    legalQuery = button.dataset.ref || "";
    legalRagResults = null;
    legalIncludeLapsed = false;
    activeRoute = "search";
    if (apiMode) runLegalSearch();
    else renderPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (action === "locate-citation") locateCitationDialog(button.dataset.doc);
  if (action === "notif-read") {
    try { await apiRequest(`/api/notifications/${encodeURIComponent(button.dataset.id)}/read`, { method: "POST", body: {} }); } catch (error) { /* ignore */ }
    await loadNotifications();
    notificationsDialog();
  }
  if (action === "notif-read-all") {
    try { await apiRequest("/api/notifications/read-all", { method: "POST", body: {} }); } catch (error) { /* ignore */ }
    await loadNotifications();
    notificationsDialog();
  }
  if (action === "notif-go") {
    const kind = button.dataset.goKind;
    const targetId = button.dataset.goId;
    if (button.dataset.id) { try { await apiRequest(`/api/notifications/${encodeURIComponent(button.dataset.id)}/read`, { method: "POST", body: {} }); } catch (error) { /* ignore */ } }
    dialog.close();
    if (kind === "case" && targetId && state.cases.some(item => item.id === targetId)) {
      state.activeCaseId = targetId;
      caseViewMode = "timeline";
      activeRoute = "cases";
      documentDraft = "";
      documentReviewResults = [];
      documentFacts = null;
      documentVerification = null;
      persist();
      renderCaseSelect();
    } else if (kind === "source") {
      activeRoute = "search";
    }
    await loadNotifications();
    renderPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (kind === "source" && targetId && can("manage_settings")) {
      const source = legalSources.find(item => item.id === targetId);
      if (source) legalSourceEditForm(source);
      else showToast("该法源可能已被删除");
    }
  }
  if (action === "notif-prefs") notifPrefsDialog();
  if (action === "notif-digest") digestDialog();
  if (action === "refresh-webhook-log") {
    await loadWebhookLog();
    renderPage();
    showToast("投递记录已刷新");
  }
  if (action === "retry-webhook") {
    try {
      const result = await apiRequest("/api/notifications/webhook-retry", { method: "POST", body: {} });
      await loadWebhookLog();
      renderPage();
      showToast(`重试完成：待发 ${result.pending} · 失败 ${result.failed}`);
    } catch (error) {
      showToast(error.message);
    }
  }
  if (action === "copy-digest") copyText(lastDigestText || "无待处理提醒。");
  if (action === "replace-search") {
    replaceQuery = document.querySelector("#replace-search")?.value || "";
    runReplacementSearch();
  }
  if (action === "choose-replacement") {
    replacementChoice = button.dataset.title || "";
    renderLocateDialog();
  }
  if (action === "apply-replacement") {
    if (!locateContext || !replacementChoice) return showToast("请先检索并选用替换法源");
    const version = state.documentVersions.find(item => item.id === locateContext.docId);
    if (!version) return showToast("文书版本不存在");
    let content = version.content;
    for (const ref of locateContext.refs) content = content.split(ref).join(replacementChoice);
    const previous = state.documentVersions.filter(item => item.caseId === version.caseId && item.name === version.name).length;
    const newVersion = `v${previous + 1}`;
    state.documentVersions.unshift({ id: uid("doc"), caseId: version.caseId, name: version.name, version: newVersion, member: currentUser?.name || "当前用户", updatedAt: dateFromNow(0), content });
    recordAudit("失效引用替换", `${version.name} · ${newVersion} · 以《${replacementChoice}》替换`, version.caseId);
    state.activeCaseId = version.caseId;
    const key = Object.entries(templateLabels).find(([, label]) => label === version.name)?.[0];
    if (key) { selectedTemplate = key; documentDraft = content; documentReviewResults = []; documentVerification = null; documentFacts = null; activeRoute = "documents"; }
    persist();
    dialog.close();
    await loadCitationImpacts();
    renderCaseSelect();
    renderPage();
    showToast(`已替换并存为 ${newVersion}${key ? "，已载入文书编辑区复核" : ""}`);
  }
  if (action === "locate-evidence") {
    activeRoute = "evidence";
    evidenceViewMode = "catalog";
    renderPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`请为「${button.dataset.claim || "该事实"}」补充证据或上传案件材料`);
  }
  if (action === "cycle-evidence") {
    const item = state.evidence.find(entry => entry.id === button.dataset.id);
    const statusList = ["待核验", "待补强", "已核验"];
    if (item) {
      item.status = statusList[(statusList.indexOf(item.status) + 1) % statusList.length];
      recordAudit("证据状态", `${item.name} · ${item.status}`, item.caseId);
    }
    persist();
    renderPage();
  }
  if (action === "evidence-view") {
    evidenceViewMode = button.dataset.mode;
    renderPage();
  }
  if (action === "ask-question") {
    const input = document.querySelector("#qa-question");
    const query = input?.value.trim();
    if (!query) return showToast("请输入需要检索的问题");
    if (apiMode) {
      askLegalQuestion(query);
    } else {
      const result = answerQuestion(query);
      state.qaMessages.push({ role: "user", text: query, citations: [] }, { role: "assistant", text: result.answer, citations: result.citations });
      persist();
      renderPage();
    }
  }
  if (action === "copy-hearing") copyText(document.querySelector("#hearing-editor")?.value || "");
  if (action === "download-hearing") {
    downloadDocx(`庭审提纲-${currentCase()?.client || "案件"}.docx`, "庭审辅助提纲", document.querySelector("#hearing-editor")?.value || "");
    showToast("庭审提纲已导出为 DOCX");
  }
  if (action === "toggle-task") {
    const task = state.tasks.find(item => item.id === button.dataset.id);
    if (task) task.done = !task.done;
    persist();
    renderPage();
  }
  if (action === "reset-demo") {
    const confirmed = window.confirm("确定重置所有本地演示数据吗？");
    if (confirmed) {
      state = createInitialState();
      persist();
      documentDraft = "";
      renderCaseSelect();
      renderPage();
      showToast("演示数据已重置");
    }
  }
});

document.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.id === "user-form") saveUser(event.target);
  if (event.target.id === "password-form") savePassword(event.target);
  if (event.target.id === "legal-source-form") saveLegalSource(event.target);
  if (event.target.id === "legal-edit-form") saveLegalEdit(event.target);
  if (event.target.id === "notif-prefs-form") saveNotifPrefs(event.target);
  if (event.target.id === "holiday-form") saveHoliday(event.target);
  if (event.target.id === "file-upload-form") saveFileUpload(event.target);
  if (event.target.id === "case-form") saveCase(event.target);
  if (event.target.id === "case-event-form") saveCaseEvent(event.target);
  if (event.target.id === "evidence-form") saveEvidence(event.target);
  if (event.target.id === "task-form") saveTask(event.target);
  if (event.target.id === "time-form") saveTime(event.target);
  if (event.target.id === "clue-form") saveClue(event.target);
  if (event.target.id === "client-form") saveClient(event.target);
});

document.addEventListener("input", event => {
  if (event.target.id === "document-editor") {
    documentDraft = event.target.value;
    documentReviewResults = [];
    documentVerification = null;
    document.querySelector(".review-panel")?.remove();
  }
  if (event.target.id === "deadline-service-date" || event.target.id === "deadline-days") renderDeadlineResult();
  if (event.target.id === "batch-service-date" || /^batch-\w+-days$/.test(event.target.id)) renderBatchRows();
  if (event.target.id === "archive-search") {
    archiveQuery = event.target.value;
    const container = document.querySelector("#archive-results");
    if (container) container.innerHTML = archiveResultsHTML();
  }
});

document.addEventListener("change", event => {
  if (event.target === caseSelect) {
    state.activeCaseId = event.target.value;
    documentDraft = "";
    documentReviewResults = [];
    documentFacts = null;
    documentVerification = null;
    strategyTendency = null;
    hearingTranscript = null;
    hearingSummary = null;
    persist();
    renderPage();
  }
  if (event.target.id === "version-left" || event.target.id === "version-right") renderVersionDiff();
  if (event.target.id === "deadline-type") {
    const type = DEADLINE_TYPES.find(item => item.key === event.target.value);
    const daysInput = document.querySelector("#deadline-days");
    if (type && daysInput) daysInput.value = type.days;
    renderDeadlineResult();
  }
  if (event.target.dataset.setting) {
    if (!can("manage_settings")) {
      event.target.checked = !event.target.checked;
      return showToast("当前角色无权修改安全设置");
    }
    state.settings[event.target.dataset.setting] = event.target.checked;
    persist();
    showToast("设置已保存");
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.id === "legal-search-input") {
    event.preventDefault();
    legalQuery = event.target.value;
    legalLevel = document.querySelector("#legal-level-filter")?.value || "全部";
    renderPage();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && event.target.id === "qa-question") {
    document.querySelector('[data-action="ask-question"]')?.click();
  }
});

document.querySelector("#quick-search").addEventListener("click", () => {
  activeRoute = "search";
  renderPage();
});

document.querySelector("#notifications-button").addEventListener("click", () => {
  if (apiMode) notificationsDialog();
});

window.addEventListener?.("hashchange", () => {
  const route = (location.hash || "").replace(/^#/, "");
  if (Object.prototype.hasOwnProperty.call(routeMeta, route) && route !== activeRoute) {
    activeRoute = route;
    renderPage();
  }
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const data = formDataObject(loginForm);
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  loginError.hidden = true;
  try {
    const session = await apiRequest("/api/auth/login", { method: "POST", body: data });
    apiMode = true;
    currentUser = session.user;
    csrfToken = session.csrfToken;
    grantedPermissions = session.permissions || [];
    await initializeApp();
  } catch (error) {
    showLogin(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await flushStateSync();
    await apiRequest("/api/auth/logout", { method: "POST", body: {} });
  } catch (error) {
    // The local session is cleared even if the server is already unavailable.
  }
  currentUser = null;
  grantedPermissions = [];
  csrfToken = "";
  showLogin();
});

dialog.addEventListener("click", event => {
  const rect = dialog.getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  if (outside) dialog.close();
});

initializeApp();
