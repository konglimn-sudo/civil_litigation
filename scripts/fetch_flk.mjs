#!/usr/bin/env node
// 从国家法律法规数据库(flk.npc.gov.cn)抓取条文并整理为可导入的法源 JSON。
//
// ⚠️ 须在「有外网」的本机运行(本仓库的开发沙箱禁止外联,因此该抓取流程未做联网实测;
//    解析层已隔离为纯函数并有单元测试覆盖,抓取流程按官方公开接口编写,
//    若官方接口结构调整,请优先修正本文件顶部的解析函数)。
//
// 用法:
//   node scripts/fetch_flk.mjs "合同" --size 10 --out data/legal-import.json
//   # 然后在「智能法律检索」页用管理员账号「批量导入法源」上传该 JSON,
//   # 或设置环境变量后由脚本直接导入到本地服务:
//   HENGFA_IMPORT_URL=http://127.0.0.1:4173 HENGFA_ADMIN_EMAIL=... HENGFA_ADMIN_PASSWORD=... \
//   node scripts/fetch_flk.mjs "买卖合同" --import
//
// 导出的法源 status 一律标记为「有效性待核验」,效力与现行文本仍须人工回到官方页面核验。

import { writeFileSync } from "node:fs";

const FLK = "https://flk.npc.gov.cn";

// —— 纯函数(可单元测试)——

export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// flk 列表项的 type/level 文本基本可直接使用,做一次温和归一。
export function mapFlkLevel(value) {
  const text = String(value || "").trim();
  if (/宪法/.test(text)) return "宪法";
  if (/司法解释/.test(text)) return "司法解释/程序规则";
  if (/行政法规/.test(text)) return "行政法规";
  if (/地方性法规/.test(text)) return "地方性法规";
  if (/法律/.test(text) || !text) return "法律";
  return text;
}

// 把 flk 的列表项 + 正文文本归一为本系统的法源对象。
export function normalizeFlkSource(item, text) {
  const id = String(item.id || item.ID || "");
  return {
    title: String(item.title || item.name || "未命名法源").trim().slice(0, 200),
    authority: String(item.office || item.publishOrgan || "全国人民代表大会及其常务委员会").trim().slice(0, 120),
    level: mapFlkLevel(item.type || item.legalType || item.law_type),
    status: "有效性待核验", // 官方页有效状态仍须人工核验,不直接断言「现行有效」
    effectiveDate: String(item.expiry || item.sxrq || item.publish || item.gbrq || "").slice(0, 40),
    sourceUrl: id ? `${FLK}/detail2.html?${id}` : FLK,
    text: htmlToText(text)
  };
}

// —— 网络抓取(本机运行)——

async function postForm(path, params) {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(`${FLK}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 hengfa-legal-importer" },
    body,
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`列表接口 ${response.status}`);
  return response.json();
}

async function fetchList(keyword, size) {
  const data = await postForm("/api/", {
    type: "", searchType: "title;vague", sortTr: "f_bbrq_s;desc",
    gbrqStart: "", gbrqEnd: "", sxrqStart: "", sxrqEnd: "", sort: "true",
    keyword, page: "1", size: String(size), _: String(Date.now())
  });
  return (data?.result?.data) || data?.data || [];
}

async function fetchBodyText(id) {
  const response = await fetch(`${FLK}/api/detail?id=${encodeURIComponent(id)}`, {
    headers: { "user-agent": "Mozilla/5.0 hengfa-legal-importer" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`详情接口 ${response.status}`);
  const detail = await response.json();
  const body = detail?.result?.body || [];
  const htmlPart = body.find(part => /html/i.test(part.type || "")) || body[0];
  if (!htmlPart?.path) return "";
  const fileUrl = htmlPart.path.startsWith("http") ? htmlPart.path : `${FLK}${htmlPart.path}`;
  const fileResp = await fetch(fileUrl, { headers: { "user-agent": "Mozilla/5.0 hengfa-legal-importer" }, signal: AbortSignal.timeout(30000) });
  if (!fileResp.ok) return "";
  return htmlToText(await fileResp.text());
}

async function importToServer(sources) {
  const base = process.env.HENGFA_IMPORT_URL.replace(/\/$/, "");
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.HENGFA_ADMIN_EMAIL, password: process.env.HENGFA_ADMIN_PASSWORD })
  });
  if (!login.ok) throw new Error(`登录失败 ${login.status}`);
  const cookie = String(login.headers.getSetCookie?.()[0] || login.headers.get("set-cookie") || "").split(";")[0];
  const { csrfToken } = await login.json();
  const result = await fetch(`${base}/api/legal/import`, {
    method: "POST", headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken },
    body: JSON.stringify({ sources })
  });
  if (!result.ok) throw new Error(`导入失败 ${result.status}: ${await result.text()}`);
  return result.json();
}

async function main() {
  const args = process.argv.slice(2);
  const keyword = args.find(arg => !arg.startsWith("--")) || "";
  const sizeIndex = args.indexOf("--size");
  const size = sizeIndex >= 0 ? Number(args[sizeIndex + 1]) || 10 : 10;
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 ? args[outIndex + 1] : "data/legal-import.json";
  const doImport = args.includes("--import");
  if (!keyword) { console.error("请提供检索关键词，例如: node scripts/fetch_flk.mjs \"买卖合同\" --size 10"); process.exit(1); }

  console.log(`检索「${keyword}」前 ${size} 条…`);
  const list = await fetchList(keyword, size);
  console.log(`列表返回 ${list.length} 条，逐条抓取正文…`);
  const sources = [];
  for (const item of list) {
    try {
      const text = await fetchBodyText(item.id || item.ID);
      if (text && text.length >= 20) sources.push(normalizeFlkSource(item, text));
      else console.warn(`  跳过(正文为空): ${item.title}`);
    } catch (error) {
      console.warn(`  跳过(${error.message}): ${item.title}`);
    }
  }
  console.log(`整理出 ${sources.length} 条可导入法源。`);

  if (doImport && process.env.HENGFA_IMPORT_URL) {
    const result = await importToServer(sources);
    console.log(`已导入服务端：`, result);
  } else {
    writeFileSync(outFile, JSON.stringify({ sources }, null, 2), "utf8");
    console.log(`已写入 ${outFile}，可在「智能法律检索」页用管理员账号批量导入。`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error("抓取失败:", error.message); process.exit(1); });
}
