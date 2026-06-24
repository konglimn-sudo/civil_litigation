import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

class MockElement {
  constructor() {
    this.innerHTML = "";
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.lastChild = { textContent: "" };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  addEventListener() {}
  querySelector() { return new MockElement(); }
  showModal() {}
  close() {}
  append() {}
  select() {}
  remove() {}
  click() {}
  getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; }
}

const selectors = [
  "#app-view", "#global-case-select", "#app-dialog", "#dialog-content", "#toast",
  "#auth-view", "#app-shell", "#login-form", "#login-error", "#logout-button", "#sync-state",
  "#profile-name", "#profile-role", "#profile-avatar", "#top-new-case", "#quick-search"
];
const elements = new Map(selectors.map(selector => [selector, new MockElement()]));

global.document = {
  title: "",
  body: new MockElement(),
  querySelector(selector) { return elements.get(selector) || new MockElement(); },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement() { return new MockElement(); },
  execCommand() { return true; }
};
global.localStorage = { getItem() { return null; }, setItem() {} };
global.window = {
  location: { protocol: "file:" },
  clearTimeout,
  setTimeout,
  scrollTo() {},
  confirm() { return false; }
};
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { async writeText() {} } }, configurable: true });
global.requestAnimationFrame = callback => callback();
global.fetch = async () => { throw new Error("fetch should not run in file mode"); };

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8") + `
  var __localCases = renderCases();
  var __localPlatform = renderPlatform();
  apiMode = true;
  state.activeCaseId = 'case-1';
  // 律师视角：立案前评估入口 + 问答双视角切换。
  currentUser = { id: 'u-l', name: '律师', role: 'lawyer' };
  grantedPermissions = ['export_documents','edit_case','manage_evidence','manage_tasks','create_case'];
  qaAudience = 'lawyer';
  var __lawyerStrategy = renderStrategy();
  var __lawyerDocuments = renderDocuments();
  var __lawyerQA = renderQA();
  // 当事人视角。
  currentUser = { id: 'client-1', name: '测试当事人', role: 'client' };
  grantedPermissions = [];
  var __clientCases = renderCases();
  var __clientEvidence = renderEvidence();
  var __clientDocuments = renderDocuments();
  var __clientHearing = renderHearing();
  var __clientQA = renderQA();
  var __billing = computeBilling('case-1');
  var __collab = renderCollaboration();
  globalThis.__frontendChecks = {
    localCanCreate: __localCases.includes('新建案件'),
    localPlatform: __localPlatform.includes('安全与可信设置'),
    clientCannotCreate: !__clientCases.includes('新建案件') && !__clientCases.includes('编辑当前案件'),
    clientCannotAddEvidence: !__clientEvidence.includes('添加证据'),
    clientCannotDownload: !__clientDocuments.includes('下载文书'),
    clientCannotDownloadHearing: !__clientHearing.includes('下载提纲'),
    hydrated: hydrateState({ cases: [] }).cases.length === 0,
    billingTimeFee: __billing.timeFee,
    billingTotal: __billing.billableTotal,
    billingOutstanding: __billing.outstanding,
    collabHasBilling: __collab.includes('费用与计费'),
    strategyHasAssess: __lawyerStrategy.includes('立案前评估'),
    documentsHasAgentFlow: __lawyerDocuments.includes('智能办案流'),
    lawyerQaHasToggle: __lawyerQA.includes('办案视角') && __lawyerQA.includes('当事人初步答疑'),
    clientQaConsultMode: __clientQA.includes('不构成正式法律意见')
  };
`;
vm.runInThisContext(source, { filename: "app.js" });

test("local fallback and client permission rendering", () => {
  const checks = global.__frontendChecks;
  assert.equal(checks.localCanCreate, true);
  assert.equal(checks.localPlatform, true);
  assert.equal(checks.clientCannotCreate, true);
  assert.equal(checks.clientCannotAddEvidence, true);
  assert.equal(checks.clientCannotDownload, true);
  assert.equal(checks.clientCannotDownloadHearing, true);
  assert.equal(checks.hydrated, true);
});

// 计费测算：case-1 计时制 800/h × 2.5h = 2000 律师费 + 6800 支出 = 8800 应收，已收 5000 → 余额 3800。
test("billing computes fees, expenses, payments and outstanding balance", () => {
  const checks = global.__frontendChecks;
  assert.equal(checks.billingTimeFee, 2000, "工时费 = 2.5h × 800");
  assert.equal(checks.billingTotal, 8800, "应收合计 = 律师费 + 支出");
  assert.equal(checks.billingOutstanding, 3800, "应收余额 = 应收 − 已收");
  assert.equal(checks.collabHasBilling, true, "协作页应渲染费用与计费面板");
});

// 第二批：Agent 流程 / 立案前评估 / 当事人答疑入口 的界面入口。
test("agent flow, prefiling assessment and party-facing Q&A surfaces render", () => {
  const checks = global.__frontendChecks;
  assert.equal(checks.strategyHasAssess, true, "案情策略页应有立案前评估入口");
  assert.equal(checks.documentsHasAgentFlow, true, "智能文书页应有智能办案流入口");
  assert.equal(checks.lawyerQaHasToggle, true, "问答页应有办案/当事人双视角切换");
  assert.equal(checks.clientQaConsultMode, true, "当事人角色问答应锁定为初步答疑并强提示");
});
