// 衡法 Word/WPS 文书助手任务窗格：登录衡法服务端（同源），调用既有 REST API，
// 把生成文书 / 带依据的问答插入到光标处，并校验选中文本。Office.js 不可用时回退到剪贴板。
"use strict";

let csrfToken = "";     // 登录后保存的 CSRF 令牌,写操作必带。
let officeReady = false; // Office.js 是否就绪(在 Word/WPS 宿主内为 true)。
let officeHost = "";     // 宿主标识(Word/Excel...),目前仅记录。
let cases = [];          // 当前工作区案件列表(已过滤归档)。

const $ = id => document.getElementById(id); // 取元素的简写。

// 在 Office/WPS 宿主中初始化;非宿主环境(普通浏览器预览)此回调不会触发,officeReady 保持 false。
if (typeof Office !== "undefined" && Office.onReady) {
  Office.onReady(info => { officeReady = true; officeHost = info.host || ""; });
}

// 与衡法服务端的统一 fetch 封装:同源带 Cookie,写操作附 CSRF,非 2xx 抛带 status 的错误。
async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";              // 有请求体才声明 JSON。
  if (!["GET", "HEAD"].includes(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken; // 写操作带 CSRF。
  const res = await fetch(path, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));                                   // 容错解析(非 JSON 时给空对象)。
  if (!res.ok) {
    const error = new Error(data.error || `请求失败 (${res.status})`);              // 用服务端错误信息或状态码。
    error.status = res.status;                                                       // 保留状态码供上层区分(如 401)。
    throw error;
  }
  return data;
}

// 底部短暂提示(2.2 秒后淡出);用函数属性保存定时器以便重置。
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);                                    // 取消上一条的隐藏定时器。
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

// 在"登录"与"主功能"两个面板之间切换显示。
function show(pane) {
  $("login-pane").hidden = pane !== "login";
  $("main-pane").hidden = pane !== "main";
}

// 当前下拉框选中的案件 id。
function selectedCaseId() {
  return $("case-select").value || "";
}

// 把文本插入到 Word/WPS 光标处；非 Office 环境回退到剪贴板。
async function insertIntoDocument(text) {
  if (officeReady && typeof Word !== "undefined") {        // 在 Word/WPS 宿主内:用 Office.js 写入。
    await Word.run(async context => {
      const range = context.document.getSelection();       // 取当前选区(光标处即空选区)。
      range.insertText(text, Word.InsertLocation.replace); // 用文本替换选区=在光标处插入。
      await context.sync();                                // 提交批处理到文档。
    });
    return true;                                           // 真正插入成功。
  }
  try {
    await navigator.clipboard.writeText(text);             // 浏览器预览:退而求其次复制到剪贴板。
    toast("未检测到 Word 环境，已复制到剪贴板");
  } catch (_) {
    toast("未检测到 Word 环境，且复制失败");
  }
  return false;                                            // 未真正写入文档。
}

// 读取文档当前选区文本(供"校验选中文本"用);非 Office 环境返回空串。
async function getSelectionText() {
  if (!(officeReady && typeof Word !== "undefined")) return "";
  return Word.run(async context => {
    const selection = context.document.getSelection();
    selection.load("text");                                // 声明要读取 text 属性。
    await context.sync();                                  // 同步后属性才可用。
    return selection.text || "";
  });
}

// 检查是否已登录:有会话则进主界面并载入案件,否则显示登录面板。
async function refreshSession() {
  try {
    const session = await api("/api/session");             // 未登录会抛错(401)。
    csrfToken = session.csrfToken || "";                   // 刷新 CSRF 令牌。
    $("who").textContent = session.user ? `${session.user.name}（${session.user.role}）` : ""; // 顶部显示当前用户。
    await loadCases();
    show("main");
  } catch (_) {
    show("login");                                         // 任何失败都回到登录态。
  }
}

// 拉取工作区状态,把未归档案件填入下拉框。
async function loadCases() {
  const bootstrap = await api("/api/bootstrap");
  cases = (bootstrap.state?.cases || []).filter(item => !item.archived); // 过滤掉已归档案件。
  const select = $("case-select");
  select.innerHTML = cases.map(item => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join("")
    || `<option value="">（暂无案件）</option>`;            // 无案件时的占位项。
}

// 转义 HTML 特殊字符,防止把用户/案件文本注入到 innerHTML 时被当作标签。
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// 提交登录表单:成功后刷新会话进入主界面,401 给出友好提示。
async function doLogin() {
  $("login-msg").textContent = "";                       // 清空旧错误。
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) { $("login-msg").textContent = "请输入邮箱与密码"; return; } // 前端必填校验。
  setBusy("login-btn", true);
  try {
    const session = await api("/api/auth/login", { method: "POST", body: { email, password } });
    csrfToken = session.csrfToken || "";                 // 保存令牌供后续写操作。
    await refreshSession();                              // 复用会话刷新逻辑载入案件并切到主界面。
  } catch (error) {
    $("login-msg").textContent = error.status === 401 ? "邮箱或密码错误" : error.message; // 区分凭证错误与其他错误。
  } finally {
    setBusy("login-btn", false);
  }
}

// 退出登录:通知服务端注销(失败也无妨),清掉令牌回到登录面板。
async function doLogout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch (_) { /* 忽略网络/会话错误 */ }
  csrfToken = "";
  show("login");
}

// 生成所选模板的文书并插入文档。
async function doGenerate() {
  const caseId = selectedCaseId();
  if (!caseId) return toast("请先选择案件");
  setBusy("gen-btn", true);                                // 防重复点击。
  try {
    const data = await api("/api/documents/generate", { method: "POST", body: { caseId, template: $("template-select").value } });
    const inserted = await insertIntoDocument(`${data.content}\n`); // 末尾补换行,与后续内容隔开。
    if (inserted) toast(`已插入：${data.label}`);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy("gen-btn", false);                             // 无论成败都恢复按钮。
  }
}

// 提交问题,把带依据引用的回答插入文档。
async function doAsk() {
  const caseId = selectedCaseId();
  const query = $("qa-input").value.trim();
  if (!query) return toast("请输入问题");
  setBusy("qa-btn", true);
  try {
    const data = await api("/api/legal/answer", { method: "POST", body: { query, caseId } });
    // 把引用整理成"[n] 标题 · 机关 · 状态"列表。
    const cites = (data.citations || []).map((c, i) => `[${i + 1}] ${c.title || ""}${c.authority ? " · " + c.authority : ""}${c.status ? " · " + c.status : ""}`).join("\n");
    const block = `【问题】${query}\n${data.answer}${cites ? `\n\n依据：\n${cites}` : ""}\n`; // 组装"问题+答案+依据"段。
    const inserted = await insertIntoDocument(block);
    if (inserted) toast(data.generatedBy?.startsWith("claude") ? "已插入 Claude 生成答案（含依据）" : "已插入检索答案（含依据）"); // 据来源给不同提示。
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy("qa-btn", false);
  }
}

// 读取选区文本,送服务端校验引用与事实,结果渲染到面板。
async function doVerify() {
  const caseId = selectedCaseId();
  if (!caseId) return toast("请先选择案件");
  const result = $("verify-result");
  result.innerHTML = "";                                   // 清空上次结果。
  let content = await getSelectionText();                  // 取当前选区文本。
  if (!content || content.trim().length < 10) { toast("请先在正文中选中至少 10 个字"); return; } // 内容过短不校验。
  setBusy("verify-btn", true);
  try {
    const data = await api("/api/documents/verify", { method: "POST", body: { caseId, content } });
    result.innerHTML = renderVerify(data);                 // 渲染校验结论。
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy("verify-btn", false);
  }
}

// 把校验返回值渲染成若干条结论卡片 + 明细提示。
function renderVerify(data) {
  const items = [];
  items.push(finding(data.unverifiedLegal ? "high" : "pass", `未核验法条引用：${data.unverifiedLegal}`)); // 有未核验=高风险。
  if (data.outdatedLegal) items.push(finding("high", `引用了失效法源：${data.outdatedLegal}`));            // 失效引用单列高风险。
  items.push(finding(data.ungroundedFacts ? "medium" : "pass", `缺事实依据：${data.ungroundedFacts}`));    // 缺依据=中风险。
  const outdated = (data.legal || []).filter(item => item.status === "outdated").map(item => item.ref);    // 失效引用清单。
  const unverified = (data.legal || []).filter(item => item.status === "unverified").map(item => item.ref);// 未核验引用清单。
  if (outdated.length) items.push(`<div class="hf-hint">失效引用：${escapeHtml(outdated.join("、"))}</div>`);
  if (unverified.length) items.push(`<div class="hf-hint">未核验引用：${escapeHtml(unverified.join("、"))}</div>`);
  items.push(`<div class="hf-hint">已扫描案件材料 ${data.filesScanned || 0} 份，仍需人工复核。</div>`);    // 提醒人工复核。
  return items.join("");
}

// 单条结论卡片:按级别(high/medium/low/pass)上不同色标签。
function finding(level, text) {
  const label = { high: "高", medium: "中", low: "低", pass: "通过" }[level] || level;
  return `<div class="hf-finding"><span class="lvl ${level}">${label}</span>${escapeHtml(text)}</div>`;
}

// 置灰/恢复按钮,用于异步请求期间防重复点击。
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
