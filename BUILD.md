# 打包与 CI/CD

衡法 AI 办案台可打包为三种分发形态。核心代码(`server.mjs`、`app.js` 等)保持零依赖,重型打包工具放在独立子目录,互不污染。

| 目标 | 形态 | 功能范围 | 工具 |
|------|------|----------|------|
| macOS | `.dmg` 桌面应用 | **全功能**(内置 Node 服务 + SQLite) | `desktop/`(Electron) |
| Windows | `.exe` 安装包 | **全功能** | `desktop/`(Electron) |
| Android | `.apk` | **本地演示模式**(localStorage,无登录/RAG/OCR/文件/通知等服务端功能) | `mobile/`(Capacitor) |

> 安卓为何只是本地演示:手机端无法本地运行 Node + SQLite 后端。需要全功能时,请用「远程客户端」方案(WebView 指向你部署的服务器)——可在 `mobile/` 基础上扩展。

## 一、本地构建

### 桌面端(macOS / Windows)
前置:Node 20+;原生模块编译工具(macOS 自带 Xcode CLT;Windows 需 VS Build Tools)。

```bash
cd desktop
npm install
npm run dist:mac    # 产出 desktop/dist/*.dmg(在 macOS 上)
npm run dist:win    # 产出 desktop/dist/*.exe(在 Windows 上)
npm start           # 本地直接运行(不打包),调试用
```

- 数据保存在系统用户数据目录(`app.getPath('userData')/data`),不出本机。
- SQLite:打包内的 Node 不一定支持 `node:sqlite`,故 `db.mjs` 自动回退到 `better-sqlite3`(electron-builder 会按目标平台重新编译原生模块)。
- 默认管理员:`admin@hengfa.local` / `Hengfa-Desktop-2026`(首次登录后请改密;可用环境变量 `HENGFA_ADMIN_PASSWORD` 覆盖)。
- OCR 需本机安装 `tesseract`(+ 中文包);未安装时图片 OCR 不可用,其余功能正常。

### 安卓(本地演示 APK)
前置:Node 20+、JDK 17、Android SDK。

```bash
cd mobile
npm install
npm run init-android   # 首次:复制前端 + 生成 android/ 工程
npm run build          # 复制 + cap sync + gradlew assembleDebug
# 产物:mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## 二、CI/CD(GitHub Actions)

工作流 `.github/workflows/build.yml`:

- **每次 push / PR 到 main**:运行 `test` 任务(零依赖核心回归测试,Node 24)。
- **打 tag(如 `v0.3.0`)或手动触发**:在 macOS / Windows / Ubuntu runner 上分别构建 `.dmg` / `.exe` / `.apk`,作为 artifact 上传;打 tag 时再汇总发布到 **GitHub Release**。

发布一个版本:

```bash
git add -A && git commit -m "release: v0.3.0"
git branch -M main
git remote add origin git@github.com:<你的账号>/<仓库>.git
git push -u origin main
git tag v0.3.0 && git push origin v0.3.0   # 触发三端构建并发布 Release
```

## 三、签名与发布(生产)

- **macOS**:正式分发需 Apple 开发者证书 + 公证(notarization)。CI 默认关闭签名(`CSC_IDENTITY_AUTO_DISCOVERY=false`),产出未签名 dmg(本机可运行,分发会提示未识别开发者)。配置 `CSC_LINK`/`CSC_KEY_PASSWORD` 等 secrets 可启用签名。
- **Windows**:可选代码签名证书(`CSC_LINK`/`CSC_KEY_PASSWORD`),否则安装时有 SmartScreen 提示。
- **Android**:CI 产出的是 **debug 签名** APK(可安装试用)。正式发布需用自有 keystore 进行 release 签名(配置 `mobile/android/key.properties` 与 Gradle 签名,keystore 切勿提交;已在 `.gitignore` 忽略)。

## 四、图标

`desktop/build/` 可放置 `icon.icns`(macOS)、`icon.ico`(Windows);缺省时 electron-builder 使用 Electron 默认图标。安卓图标可在生成 `android/` 工程后按标准 res 目录替换。
