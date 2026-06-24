// 衡法 Word/WPS 文书助手任务窗格：登录衡法服务端（同源），调用既有 REST API，
// 把生成文书 / 带依据的问答插入到光标处，并校验选中文本。Office.js 不可用时回退到剪贴板。
"use strict";

let csrfToken = "";
let officeReady = false;
let officeHost = "";
let cases = [];

const $ = id => document.getElementById(id);

if (typeof Office !== "undefined" && Office.onReady) {
  Office.onReady(info => { officeReady = true; officeHost = info.host || ""; });
}

async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(path, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `请求失败 (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function show(pane) {
  $("login-pane").hidden = pane !== "login";
  $("main-pane").hidden = pane !== "main";
}

function selectedCaseId() {
  return $("case-select").value || "";
}

// 把文本插入到 Word/WPS 光标处；非 Office 环境回退到剪贴板。
async function insertIntoDocument(text) {
  if (officeReady && typeof Word !== "undefined") {
    await Word.run(async context => {
      const range = context.document.getSelection();
      range.insertText(text, Word.InsertLocation.replace);
      await context.sync();
    });
    return true;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("未检测到 Word 环境，已复制到剪贴板");
  } catch (_) {
    toast("未检测到 Word 环境，且复制失败");
  }
  return false;
}

async function getSelectionText() {
  if (!(officeReady && typeof Word !== "undefined")) return "";
  return Word.run(async context => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    return selection.text || "";
  });
}

async function refreshSession() {
  try {
    const session = await api("/api/session");
    csrfToken = session.csrfToken || "";
    $("who").textContent = session.user ? `${session.user.name}（${session.user.role}）` : "";
    await loadCases();
    show("main");
  } catch (_) {
    show("login");
  }
}

async function loadCases() {
  const bootstrap = await api("/api/bootstrap");
  cases = (bootstrap.state?.cases || []).filter(item => !item.archived);
  const select = $("case-select");
  select.innerHTML = cases.map(item => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join("")
    || `<option value="">（暂无案件）</option>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

async function doLogin() {
  $("login-msg").textContent = "";
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) { $("login-msg").textContent = "请输入邮箱与密码"; return; }
  setBusy("login-btn", true);
  try {
    const session = await api("/api/auth/login", { method: "POST", body: { email, password } });
    csrfToken = session.csrfToken || "";
    await refreshSession();
  } catch (error) {
    $("login-msg").textContent = error.status === 401 ? "邮箱或密码错误" : error.message;
  } finally {
    setBusy("login-btn", false);
  }
}

async function doLogout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch (_) { /* 忽略 */ }
  csrfToken = "";
  show("login");
}

async function doGenerate() {
  const caseId = selectedCaseId();
  if (!caseId) return toast("请先选择案件");
  setBusy("gen-btn", true);
  try {
    const data = await api("/api/documents/generate", { method: "POST", body: { caseId, template: $("template-select").value } });
    const inserted = await insertIntoDocument(`${data.content}\n`);
    if (inserted) toast(`已插入：${data.label}`);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy("gen-btn", false);
  }
}

async function doAsk() {
  const caseId = selectedCaseId();
  const query = $("qa-input").value.trim();
  if (!query) return toast("请输入问题");
  setBusy("qa-btn", true);
  try {
    const data = await api("/api/legal/answer", { method: "POST", body: { query, caseId } });
    const cites = (data.citations || []).map((c, i) => `[${i + 1}] ${c.title || ""}${c.authority ? " · " + c.authority : ""}${c.status ? " · " + c.status : ""}`).join("\n");
    const block = `【问题】${query}\n${data.answer}${cites ? `\n\n依据：\n${cites}` : ""}\n`;
    const inserted = await insertIntoDocument(block);
    if (inserted) toast(data.generatedBy?.startsWith("claude") ? "已插入 Claude 生成答案（含依据）" : "已插入检索答案（含依据）");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy("qa-btn", false);
  }
}

async function doVerify() {
  const caseId = selectedCaseId();
  if (!caseId) return toast("请先选择案件");
  const result = $("verify-result");
  result.innerHTML = "";
  let content = await getSelectionText();
  if (!content || content.trim().length < 10) { toast("请先在正文中选中至少 10 个字"); return; }
  setBusy("verify-btn", true);
  try {
    const data = await api("/api/documents/verify", { method: "POST", body: { caseId, content } });
    result.innerHTML = renderVerify(data);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy("verify-btn", false);
  }
}

function renderVerify(data) {
  const items = [];
  items.push(finding(data.unverifiedLegal ? "high" : "pass", `未核验法条引用：${data.unverifiedLegal}`));
  if (data.outdatedLegal) items.push(finding("high", `引用了失效法源：${data.outdatedLegal}`));
  items.push(finding(data.ungroundedFacts ? "medium" : "pass", `缺事实依据：${data.ungroundedFacts}`));
  const outdated = (data.legal || []).filter(item => item.status === "outdated").map(item => item.ref);
  const unverified = (data.legal || []).filter(item => item.status === "unverified").map(item => item.ref);
  if (outdated.length) items.push(`<div class="hf-hint">失效引用：${escapeHtml(outdated.join("、"))}</div>`);
  if (unverified.length) items.push(`<div class="hf-hint">未核验引用：${escapeHtml(unverified.join("、"))}</div>`);
  items.push(`<div class="hf-hint">已扫描案件材料 ${data.filesScanned || 0} 份，仍需人工复核。</div>`);
  return items.join("");
}

function finding(level, text) {
  const label = { high: "高", medium: "中", low: "低", pass: "通过" }[level] || level;
  return `<div class="hf-finding"><span class="lvl ${level}">${label}</span>${escapeHtml(text)}</div>`;
}

function setBusy(id, busy) {
  const btn = $(id);
  if (btn) btn.disabled = busy;
}

// 绑定交互并初始化（taskpane.js 为 defer，执行时 DOM 已就绪）。
$("login-btn").addEventListener("click", doLogin);
$("login-password").addEventListener("keydown", event => { if (event.key === "Enter") doLogin(); });
$("logout-btn").addEventListener("click", doLogout);
$("gen-btn").addEventListener("click", doGenerate);
$("qa-btn").addEventListener("click", doAsk);
$("verify-btn").addEventListener("click", doVerify);
refreshSession();
