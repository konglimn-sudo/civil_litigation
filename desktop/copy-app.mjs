// 把仓库根目录的核心应用文件复制到 desktop/app/,供 Electron 打包(保持核心代码单一来源)。
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dest = path.join(here, "app");

// 必须涵盖 server.mjs 的全部本地依赖,否则 Electron 内 import 会因缺文件而失败。
const files = ["server.mjs", "db.mjs", "ocr.mjs", "transcribe.mjs", "embedding.mjs", "legal-domain.mjs", "agent.mjs",
  "legal-corpus.mjs", "precedent-corpus.mjs", "document-templates.mjs", "holidays.mjs", "index.html", "app.js", "styles.css"];
// 可选的本地加速器脚本(未安装对应 Python 包时自动回退,可不存在也不影响核心功能)。
const scripts = ["extract_text.py", "transcribe.py", "embed.py"];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const file of files) cpSync(path.join(root, file), path.join(dest, file));
mkdirSync(path.join(dest, "scripts"), { recursive: true });
for (const script of scripts) cpSync(path.join(root, "scripts", script), path.join(dest, "scripts", script));

console.log(`Copied ${files.length + scripts.length} app files into ${path.relative(root, dest)}/`);
