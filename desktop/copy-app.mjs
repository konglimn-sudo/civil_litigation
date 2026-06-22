// 把仓库根目录的核心应用文件复制到 desktop/app/,供 Electron 打包(保持核心代码单一来源)。
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dest = path.join(here, "app");

const files = ["server.mjs", "db.mjs", "ocr.mjs", "legal-corpus.mjs", "holidays.mjs", "index.html", "app.js", "styles.css"];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const file of files) cpSync(path.join(root, file), path.join(dest, file));
mkdirSync(path.join(dest, "scripts"), { recursive: true });
cpSync(path.join(root, "scripts", "extract_text.py"), path.join(dest, "scripts", "extract_text.py"));

console.log(`Copied ${files.length + 1} app files into ${path.relative(root, dest)}/`);
