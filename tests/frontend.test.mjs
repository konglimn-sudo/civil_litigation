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
  currentUser = { id: 'client-1', name: '测试当事人', role: 'client' };
  grantedPermissions = [];
  var __clientCases = renderCases();
  var __clientEvidence = renderEvidence();
  var __clientDocuments = renderDocuments();
  var __clientHearing = renderHearing();
  globalThis.__frontendChecks = {
    localCanCreate: __localCases.includes('新建案件'),
    localPlatform: __localPlatform.includes('安全与可信设置'),
    clientCannotCreate: !__clientCases.includes('新建案件') && !__clientCases.includes('编辑当前案件'),
    clientCannotAddEvidence: !__clientEvidence.includes('添加证据'),
    clientCannotDownload: !__clientDocuments.includes('下载文书'),
    clientCannotDownloadHearing: !__clientHearing.includes('下载提纲'),
    hydrated: hydrateState({ cases: [] }).cases.length === 0
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
