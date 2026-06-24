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
  state.activeCaseId = "case-1";
  // 注入一个"判决"节点,触发上诉期限推算。
  state.caseEvents.push({ id: "ev-judgment", caseId: "case-1", date: "2026-06-01", title: "一审判决", type: "判决", status: "已完成", source: "判决书", note: "" });
  var __exec = renderExecution();
  // 无判决节点的案件:面板仍在,但提示待确定送达日。
  state.activeCaseId = "case-3";
  var __execNoJudgment = renderExecution();
  globalThis.__appealChecks = {
    hasPanel: __exec.includes("上诉 / 再审衔接"),
    showsDeadline: __exec.includes("上诉期限约"),
    hasChecklist: __exec.includes("上诉利益"),
    hasGenButton: __exec.includes("goto-appeal-doc"),
    noJudgmentHint: __execNoJudgment.includes("待确定裁判送达日")
  };
`;
vm.runInThisContext(source, { filename: "app.js" });

test("renderExecution includes appeal/retrial panel with computed deadline", () => {
  const checks = global.__appealChecks;
  assert.equal(checks.hasPanel, true, "执行页应含上诉/再审衔接面板");
  assert.equal(checks.showsDeadline, true, "有判决节点时应推算上诉期限");
  assert.equal(checks.hasChecklist, true, "应给出衔接事项清单");
  assert.equal(checks.hasGenButton, true, "应提供生成上诉状入口");
  assert.equal(checks.noJudgmentHint, true, "无判决节点应提示待确定送达日");
});
