import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

class MockElement {
  constructor() {
    this.innerHTML = ""; this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false;
    this.dataset = {}; this.lastChild = { textContent: "" };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  addEventListener() {} querySelector() { return new MockElement(); } showModal() {} close() {}
  append() {} select() {} remove() {} click() {} getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; }
}

const selectors = [
  "#app-view", "#global-case-select", "#app-dialog", "#dialog-content", "#toast",
  "#auth-view", "#app-shell", "#login-form", "#login-error", "#logout-button", "#sync-state",
  "#profile-name", "#profile-role", "#profile-avatar", "#top-new-case", "#quick-search"
];
const elements = new Map(selectors.map(selector => [selector, new MockElement()]));

global.document = {
  title: "", body: new MockElement(),
  querySelector(selector) { return elements.get(selector) || new MockElement(); },
  querySelectorAll() { return []; }, addEventListener() {}, createElement() { return new MockElement(); }, execCommand() { return true; }
};
global.localStorage = { getItem() { return null; }, setItem() {} };
global.window = { location: { protocol: "file:" }, clearTimeout, setTimeout, scrollTo() {}, confirm() { return true; } };
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { async writeText() {} } }, configurable: true });
global.requestAnimationFrame = callback => callback();
global.fetch = async () => { throw new Error("fetch should not run in file mode"); };

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8") + `
  var __typos = proofreadDocument("原告对帐无误，既使如此。。本金为 1000 元与 １０００ 元。");
  var __clean = proofreadDocument("民事起诉状\\n原告：张三\\n此致\\n某某人民法院");
  var __pairs = proofreadDocument("依据《中华人民共和国民法典，应予支持。");
  var __review = reviewDocument("法院做出判决，对帐金额无误。", { client: "甲", opposingParty: "乙", court: "某区人民法院", caseNo: "（2026）示例民初 1 号", amount: 0 });
  globalThis.__proofChecks = {
    catchesTypos: JSON.stringify(__typos).includes("对账") && JSON.stringify(__typos).includes("即使"),
    catchesRepeatPunct: __typos.some(f => f.title.includes("重复标点")),
    catchesDigitMix: __typos.some(f => f.title.includes("数字全半角")),
    cleanHasNoFindings: __clean.length === 0,
    catchesUnpairedBookTitle: __pairs.some(f => f.title.includes("书名号不配对")),
    reviewMergesProofreading: __review.some(f => f.title.includes("错别字"))
  };
`;
vm.runInThisContext(source, { filename: "app.js" });

test("proofreadDocument catches typos and format issues, and feeds reviewDocument", () => {
  const checks = global.__proofChecks;
  assert.equal(checks.catchesTypos, true, "应识别帐→账、既使→即使");
  assert.equal(checks.catchesRepeatPunct, true, "应识别连续重复标点");
  assert.equal(checks.catchesDigitMix, true, "应识别全半角数字混用");
  assert.equal(checks.cleanHasNoFindings, true, "干净文本不应误报");
  assert.equal(checks.catchesUnpairedBookTitle, true, "应识别书名号不配对");
  assert.equal(checks.reviewMergesProofreading, true, "reviewDocument 应合并错别字校验结果");
});
