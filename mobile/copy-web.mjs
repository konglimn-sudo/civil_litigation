// 把前端静态资源复制到 mobile/www/,供 Capacitor 打包为本地演示 APK。
// 安卓版运行在本地演示模式(localStorage),不含服务端功能(登录/RAG/OCR/文件/通知)。
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dest = path.join(here, "www");

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const file of ["index.html", "app.js", "styles.css"]) cpSync(path.join(root, file), path.join(dest, file));
// Capacitor 要求 webDir 至少有 index.html;前端已通过 window.Capacitor 自动进入本地演示模式。

console.log(`Copied web assets into ${path.relative(root, dest)}/ (本地演示模式)`);
