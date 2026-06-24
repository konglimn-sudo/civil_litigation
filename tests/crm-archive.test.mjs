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
  confirm() { return true; }
};
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { async writeText() {} } }, configurable: true });
global.requestAnimationFrame = callback => callback();
global.fetch = async () => { throw new Error("fetch should not run in file mode"); };

// 本地模式（apiMode=false）下 can() 恒为真，便于直接断言渲染输出。
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8") + `
  var __collab = renderCollaboration();

  // 归档一个案件：应从主列表移除、但可在归档检索中检出。
  var __archivedCase = state.cases.find(item => item.id === 'case-2');
  __archivedCase.archived = true;
  __archivedCase.archivedAt = '2026-01-01';
  var __casesAfterArchive = renderCases();

  archiveQuery = '';
  var __archiveAll = archiveResultsHTML();
  archiveQuery = '李某';
  var __archiveMatch = archiveResultsHTML();
  archiveQuery = 'zzz-不存在的关键词';
  var __archiveNoMatch = archiveResultsHTML();
  archiveQuery = '';

  // 新增客户后客户面板应展示。
  state.clients.push({ id: 'c-test', name: '测试客户XYZ', contact: '', channel: '测试渠道', note: '', caseIds: [] });
  var __clientsPanel = renderClientsPanel();

  globalThis.__crmChecks = {
    hasClientsPanel: __collab.includes('案源 / 客户'),
    hasArchivePanel: __collab.includes('归档检索'),
    showsSeedClient: __collab.includes('张某'),
    archiveExcludedFromMainList: !__casesAfterArchive.includes('李某民间借贷纠纷执行案'),
    archiveAllListsArchived: __archiveAll.includes('李某民间借贷纠纷执行案'),
    archiveQueryMatches: __archiveMatch.includes('李某民间借贷纠纷执行案'),
    archiveQueryFiltersOut: !__archiveNoMatch.includes('李某民间借贷纠纷执行案') && __archiveNoMatch.includes('未匹配到归档案件'),
    newClientShown: __clientsPanel.includes('测试客户XYZ'),
    clientsInState: state.clients.some(item => item.id === 'c-test')
  };
`;
vm.runInThisContext(source, { filename: "app.js" });

test("CRM clients panel and case archive search render correctly", () => {
  const checks = global.__crmChecks;
  assert.equal(checks.hasClientsPanel, true, "协作页应含案源/客户面板");
  assert.equal(checks.hasArchivePanel, true, "协作页应含归档检索面板");
  assert.equal(checks.showsSeedClient, true, "客户面板应展示样例客户");
  assert.equal(checks.archiveExcludedFromMainList, true, "归档案件应从全部案件列表移除");
  assert.equal(checks.archiveAllListsArchived, true, "归档检索默认应列出全部归档案件");
  assert.equal(checks.archiveQueryMatches, true, "按当事人关键词应检出归档案件");
  assert.equal(checks.archiveQueryFiltersOut, true, "无关关键词应过滤掉并提示未匹配");
  assert.equal(checks.newClientShown, true, "新增客户后应在面板展示");
  assert.equal(checks.clientsInState, true, "客户应写入工作区状态");
});
