#!/usr/bin/env bash
# 用本机 Chrome headless 为各页面生成截图(本地演示模式,无需后端/登录),输出到 docs/screenshots/。
# 依赖:已安装 Google Chrome。用法:bash scripts/screenshots.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/screenshots"
BASE="file://$ROOT/index.html"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] && [ -x "$CHROME" ] || { echo "未找到 Chrome,可用 CHROME=/path/to/chrome 指定"; exit 1; }

mkdir -p "$OUT"

shoot() { # 路由hash  输出名
  local route="$1" name="$2"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --user-data-dir="$(mktemp -d)" --force-device-scale-factor=1 --window-size=1440,1000 \
    --virtual-time-budget=4500 --screenshot="$OUT/$name.png" "${BASE}${route}" >/dev/null 2>&1
  [ -s "$OUT/$name.png" ] && echo "✓ $name.png" || echo "✗ $name.png"
}

shoot ""               dashboard
shoot "#cases"         cases
shoot "#documents"     documents
shoot "#evidence"      evidence
shoot "#search"        search
shoot "#collaboration" collaboration

echo "完成,见 docs/screenshots/"
