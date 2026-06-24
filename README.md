# 衡法 AI 办案台

根据《民事诉讼 AI 办公软件框架-概要》实现的民事诉讼 AI 办案工作台。后端使用零第三方依赖的 Node.js 与 SQLite（含内置 FTS5 全文检索），并保留直接打开 HTML 的本地演示模式。文字抽取在本机完成、数据不出本地：默认优先使用 Python（PyMuPDF/python-docx）加速器以获得最佳中文 PDF/DOCX 效果，未安装时自动回退到内置的零依赖 Node 抽取（图片 OCR、DOCX、文本、数字 PDF 文本层）。

## 界面预览

> 以下为本地演示模式截图（内置样例数据）。可用 `bash scripts/screenshots.sh` 重新生成至 `docs/screenshots/`。

| 办案总览 | 案件全生命周期 |
|---|---|
| ![办案总览](docs/screenshots/dashboard.png) | ![案件全生命周期](docs/screenshots/cases.png) |
| **智能文书** | **证据管理与分析** |
| ![智能文书](docs/screenshots/documents.png) | ![证据管理](docs/screenshots/evidence.png) |

## 已实现模块

- 案件全生命周期台账与关键节点提醒；总览仪表盘**一屏汇总跨案同日庭审冲突与全局逾期节点**，可点击直达对应案件时间轴
- 案件档案、事实摘要、程序时间轴和期限来源台账，并对时间轴自动提示**逾期/临近/同日多项待办/跨案庭审冲突**
- **送达日期期限推算**：按送达次日起算、末日遇**法定节假日/周末顺延**（节假日表由服务端**集中维护**——管理员在「平台与安全」页更新即对全员生效，2025 为准确数据、2026 为待核验示例，含调休上班日），自动计算上诉（判决 15 日/裁定 10 日）、答辩（15 日）、举证（可改）等截止日；并支持**按受理/应诉通知批量排期**——一次把答辩、管辖异议、举证（及开庭传票日期）多个节点一并写入程序时间轴
- **混合语义检索**：SQLite FTS5/BM25 词法召回（CJK 双字分词）与**本地语义向量**余弦召回经 RRF 融合，让「拖欠 / 欠款 / 未付款」等同义异形表述也能命中（弥补纯字面缺口）；默认零依赖（法律概念向量），可选 Python 稠密句向量模型加速，数据全程不出本机。开箱内置条文级样例语料并支持导入正式法源
- 检索增强问答：从工作区法源库混合召回片段，给出带可核验引用的抽取式回答；**意图识别**自动判断提问对应的办案能力并给出「前往该模块」的路由建议
- **面向当事人初步答疑入口**：问答页支持「办案视角 / 当事人初步答疑」双视角（当事人角色自动锁定为初步答疑），以现行有效法源为依据用通俗语言作答，附引用与「不构成正式法律意见」的强提示
- 起诉状、答辩状、证据目录、代理词、上诉状和执行申请书生成，并一键导出为 DOCX（零依赖、Word/WPS 可打开）
- **Agent 自动流编排**：一键串接「意图识别 → 混合检索 → 事实分析 → 文书生成 → 引用与逻辑校验」，分阶段返回各步产物并把初稿与校验结果载入编辑器
- 文书占位符、主体信息、法源和未核验证据自动审查，含**错别字 / 格式校验**与**逻辑校验**（诉请是否明确、当事人称谓一致、法律依据是否齐备、金额/标的一致性、前后表述矛盾、诉请的事实支撑、落款完整性）
- 证据编号、分类、待证事实关联、核验状态与证据链矩阵
- **立案前评估打分**：对主体适格 / 管辖 / 请求权基础 / 证据充分性 / 诉讼时效 / 标的与成本（含受理费累进估算）/ 调解可行性多维打分，给出「立案准备度」与补强建议（本地启发式参考，不构成是否应起诉的确定性意见）
- 争议焦点、证据缺口与风险路径分析；**类案检索 + 裁判倾向参考**（混合召回相似裁判要旨，启发式聚合支持/部分支持/驳回占比，仅供参考、不输出胜败概率）
- 庭前清单、发问提纲、质证和辩论要点生成
- **庭审语音转写**：本地离线转写庭审录音（可选 faster-whisper / 自定义引擎，数据不出本机）或手工导入笔录（SRT/VTT/「说话人：内容」/纯文本），结构化为带说话人与时间的分段，并可选生成**庭审小结**（争议焦点 / 自认 / 质证 / 待跟进，本地启发式或 Claude，强制附依据）
- 执行进度与财产线索台账；**上诉 / 再审衔接**（按时间轴判决/裁定节点推算上诉期限、衔接事项清单、一键生成上诉状）
- 团队任务、工时与文书版本记录；**工时计费 / 费用结算**（按案件设计时·固定·风险代理·混合计费方案，自动以工时×费率、标的×比例核算律师费，登记代垫支出与回款，结出应收合计与应收余额，并一键导出 DOCX 费用结算单）；**案源/客户（CRM）管理**与**案件归档及归档全文检索**（归档案件自动从办案列表与案件选择器隐藏，可按名称/案号/当事人/案由即时检索并一键复原）
- **Word / WPS 文书助手插件**（Office.js 任务窗格）：在 Word / WPS 内登录同一工作区，生成诉讼文书插入光标处、插入带依据的法律问答、校验选中文本的法条引用与事实依据
- 本地存储、脱敏、审计和来源要求的配置界面
- 关键节点、证据、文书生成和导出的操作审计台账
- SQLite 服务端持久化、HttpOnly 会话、CSRF 防护和角色权限
- 管理员、律师、助理、当事人四类角色及案件访问范围
- 受权限保护的案件文件上传、SHA-256 校验与本地 OCR
- PDF、DOCX、图片和文本材料的文字提取、预览及重新处理

## 运行

### 服务端模式

建议使用 Node.js 22 或更高版本。首次运行前可设置管理员账号：

```bash
export HENGFA_ADMIN_EMAIL="admin@example.com"
export HENGFA_ADMIN_PASSWORD="请设置至少10位的强密码"
npm run dev
```

然后访问 `http://127.0.0.1:4173`。未设置环境变量时，开发环境初始账号为 `admin@hengfa.local`，初始密码会输出在终端；首次登录后应立即修改。

SQLite 数据默认保存在 `data/hengfa.db`。可用 `HENGFA_DATA_DIR` 指定私有数据目录。

案件文件保存在数据目录下的 `uploads/`，不会通过静态 URL 暴露。文字抽取分两条路径，均在本机完成：

- **图片 OCR**（两条路径都需要）：`brew install tesseract` 并安装中文识别包 `chi_sim`/`chi_tra`（`brew install tesseract-lang`，或将 `chi_sim.traineddata` 放入 tessdata 目录）。
- **Python 加速器（可选，推荐）**：`python3 -m pip install PyMuPDF python-docx`，用于稳健处理中文 PDF（含扫描件内置栅格化）与 DOCX。
- **零依赖 Node 兜底（默认自动启用）**：未安装 Python 时，由内置 `ocr.mjs` 处理图片 OCR、DOCX、文本与数字 PDF 文本层；扫描件 PDF 需安装 Python 或 `poppler`（`brew install poppler`，提供 `pdftoppm`）。

可通过 `HENGFA_PYTHON_BIN`、`TESSERACT_BIN` 指定可执行文件，或用 `HENGFA_DISABLE_PYTHON=1` 强制使用零依赖路径。`/api/ocr/capabilities` 会返回当前实际可用的引擎与能力。

### 庭审语音转写（本地离线，可选）

庭审录音转文字同样遵循「可选本地引擎 + 零依赖兜底」：**默认无引擎时**只提供笔录手工导入与结构化，不会上传任何音频。启用本地离线转写有两种方式：

```bash
# 方式一：Python + faster-whisper（首次运行按需下载模型，之后离线）
pip install faster-whisper
# 可选：export HENGFA_ASR_MODEL=small   # tiny/base/small/medium/large-v3
# 可选：export HENGFA_ASR_LANG=zh

# 方式二：自定义命令行引擎（whisper.cpp / vosk / sherpa-onnx 等），约定命令把转写文本或字幕打到 stdout。
# 命令可带参数；用 {input} 表示音频路径（不写则自动追加到末尾），含空格的参数用双引号包裹。
# stdout 为纯文本或 SRT/VTT 均可，系统会自动识别并切分说话人/时间。
export HENGFA_ASR_CMD='whisper-cli -m models/ggml-large-v3.bin -l zh -nt -f {input}'   # whisper.cpp
# export HENGFA_ASR_CMD='faster-whisper {input} --language zh'                          # faster-whisper CLI
# export HENGFA_ASR_CMD='my-asr --wav {input}'                                          # vosk / sherpa 等
```

音频与转写全过程在本机完成；用 `HENGFA_DISABLE_ASR=1` 可强制走手工导入。`/api/hearing/capabilities` 返回当前可用引擎。**庭审小结**默认本地启发式摘录；仅当启用 Claude 基座时才会把笔录文本发送到 Anthropic 生成（强制附「（依据：发言N）」，失败回退本地）。

### Word / WPS 文书助手插件（Office.js 加载项）

`plugin/` 下是一个 Office.js 任务窗格加载项，把衡法能力嵌入 Word / WPS：登录同一工作区后，可在文档光标处**生成诉讼文书**、插入**带依据的法律问答**，并**校验选中文本**的法条引用与事实依据（复用服务端 `/api/documents/generate`、`/api/legal/answer`、`/api/documents/verify`）。窗格与服务端**同源**，沿用既有会话 Cookie 与 CSRF。

侧载步骤：

1. **以 HTTPS 暴露服务端**（Office/WPS 加载项强制 HTTPS）：本地可用 `npx office-addin-dev-certs install` 生成证书并配 TLS 反向代理，或部署到 HTTPS 域名。
2. 将 [`plugin/manifest.xml`](plugin/manifest.xml) 中所有 `https://localhost:4173` 替换为你的实际 HTTPS 地址。
3. **Word**（桌面/网页）：插入 → 我的加载项 → 上传我的加载项 → 选择 `manifest.xml`；功能区「开始」选项卡出现「衡法 · 文书助手」。
4. **WPS**：在支持 Office.js 加载项的版本中按其加载项管理导入同一 `manifest.xml`。

加载项静态文件由衡法服务端在 `/plugin/*` 提供，并使用仅放行 Office.js 官方 CDN 的专用 CSP。

### 语义检索向量引擎（本地，可选稠密模型）

法律检索/问答/类案默认即为「FTS5 词法 + 本地语义向量」混合召回，**无需任何安装**：零依赖向量由法律概念加权词向量构成（签名 `local-concept-v1`，256 维），在本机算余弦并与 BM25 经 RRF 融合。如需更强的同义/改写召回，可启用本地稠密句向量模型（与音视频一样「数据不出本机」）：

```bash
# 方式一：Python + sentence-transformers（首次按需下载模型，之后离线）
pip install sentence-transformers
# 可选：export HENGFA_EMBED_MODEL=shibing624/text2vec-base-chinese

# 方式二：自定义命令行引擎（约定 stdin 收 JSON 文本数组、stdout 出等长 JSON 向量数组）
export HENGFA_EMBED_CMD='my-embed --json'
```

启用后向量引擎签名变化，**下次启动会自动重建全部法源/类案向量**（backfill）以保证口径一致；用 `HENGFA_DISABLE_EMBED=1` 可强制回退零依赖本地向量。`/api/retrieval/capabilities` 返回当前生效引擎、维度与向量数。

### 法源库与官方法源接入

首次启动时，约 60 条条文级**样例语料**写入 `legal_sources` 与 FTS5 索引，检索/问答即可使用。管理员可在「智能法律检索」页以三种方式扩充：

- **单条导入**：「＋ 导入正式法源」粘贴经核验的正式文本。
- **批量导入 JSON**：「批量导入 JSON」上传 `{ "sources": [ { title, authority, level, status, effectiveDate, sourceUrl, text } ] }`，调用 `POST /api/legal/import`。
- **官方库抓取脚本**（本机运行，需外网）：

  ```bash
  node scripts/fetch_flk.mjs "买卖合同" --size 10 --out data/legal-import.json
  # 再在「批量导入 JSON」上传 data/legal-import.json；或直接导入到本地服务：
  HENGFA_IMPORT_URL=http://127.0.0.1:4173 HENGFA_ADMIN_EMAIL=... HENGFA_ADMIN_PASSWORD=... \
    node scripts/fetch_flk.mjs "买卖合同" --import
  ```

  脚本从国家法律法规数据库（flk.npc.gov.cn）抓取并整理条文，解析层（`htmlToText`/`mapFlkLevel`/`normalizeFlkSource`）有单元测试覆盖；**因官方接口可能调整，导入的 status 一律标记为「有效性待核验」，须人工核对现行文本与效力**。

### 可选 Claude 生成式能力（AI 中台基座模型）

本系统统一指定 **Claude 为生成式基座模型**（默认 `claude-opus-4-8`），服务端所有大模型能力——法律问答、案件事实抽取、裁判倾向综述、庭审小结——都经同一个 `claudeChat` 客户端调用，仅以检索片段、案件材料或庭审笔录为唯一依据并强制附引用。**默认关闭以贯彻本地优先**，未启用时各能力走本地（抽取式 / 启发式）结果。如需启用：

```bash
export HENGFA_LLM=claude
export ANTHROPIC_API_KEY="sk-ant-..."
# 可选：export HENGFA_LLM_MODEL=claude-opus-4-8
```

启用后相关问题与检索片段 / 案件材料会发送到 Anthropic；任何调用失败都会自动回退到本地结果（响应中的 `generatedBy` / `extractedBy` 字段标明来源）。

#### 法律领域适配（基座模型 + 领域微调的本地可落地形态）

设计文档要求「基座模型 **+ 法律领域微调**」。真正的权重级微调需离线训练与私有模型托管，超出零依赖本地应用范围；本系统以 [`legal-domain.mjs`](legal-domain.mjs) 提供**可落地、可核查的法律领域适配层**，把领域知识固化进每次推理：

- **领域系统提示**：所有生成式调用经 `applyDomain` 统一前置「中国民事诉讼语境、依据强制、术语规范、效力时效优先、审慎结论、可核验」约束；
- **法律术语词典**：口语/近义表述（如「欠钱不还」「打官司」）在命中时注入对应**规范术语 + 实务要点**，纠正口语化、统一术语；
- **法律概念词典**：与语义检索（`embedding.mjs`）**共享同一份概念词组**，生成与检索口径一致。

接入**已微调的法律模型**：将 `HENGFA_LLM_MODEL` 指向该模型即可（经同一 `claudeChat` 入口）。自定义领域画像：设 `HENGFA_DOMAIN_PROFILE` 指向 JSON（`{ system, glossary, conceptGroups }`）即可覆盖领域系统提示、追加术语与概念。`/api/ai/capabilities` 返回当前基座模型与领域画像信息。

### 本地演示模式

在文件管理器中打开 `index.html`，或直接在浏览器中访问：

```text
file://***/civil_litigation/index.html
```

本地演示模式的数据保存在浏览器 `localStorage`，不启用登录与服务端权限，仅用于界面体验。

### 测试

```bash
npm test
```

### 打包为桌面 / 移动应用

可打包为 macOS/Windows 桌面应用(Electron,全功能)与安卓本地演示 APK(Capacitor),并通过 GitHub Actions 按 tag 自动构建发布。详见 [BUILD.md](BUILD.md)。核心代码保持零依赖,打包工具隔离在 `desktop/`、`mobile/` 子目录。

## 当前边界

本版本用于验证产品流程和交互。**内置法律语料为条文要点归纳样例**，具体条号、现行文本、效力状态、法院要求和案件事实必须由办案人员回到正式法源核验，不能作为正式法律意见。

各能力当前形态：

- **法律检索（混合召回）**（`/api/legal/search`）：服务端模式为 **FTS5/BM25 词法 + 本地语义向量** 的混合检索。词法精确命中条号/原文，语义向量按概念召回同义异形表述，二者经 RRF（倒数排名融合）合并排序，结果标注每条由「字面 / 语义 / 字面+语义」哪路命中。向量引擎默认零依赖（法律概念加权词向量，签名 `local-concept-v1`），探测到 Python `sentence-transformers` 或自定义 `HENGFA_EMBED_CMD` 时升级为稠密句向量；引擎切换后启动自动重建向量（backfill）保证整库口径一致。`/api/retrieval/capabilities` 返回当前引擎、维度与已索引向量数。
- **检索增强问答**（`/api/legal/answer`）：默认「检索 + 抽取式摘录 + 引用」；配置 `HENGFA_LLM=claude` + `ANTHROPIC_API_KEY` 后改为以检索片段为唯一依据的 Claude 生成式回答（强制附引用、失败自动回退），默认关闭以贯彻本地优先。
- **法源库维护**：可经单条 / 批量 JSON / 官方库抓取脚本扩充，支持编辑效力状态与元数据，**变更自动留痕**（谁、何时、由何值改为何值，可查看变更记录），并可为法源设「**有效期至**」。
- **失效法源治理**：检索**默认排除**已废止 / 已失效 / 已修改 / 尚未生效法源（可开关显示）；引用校验对引用了失效法源的文书标记告警，仪表盘**反查并提示**哪些已生成文书引用了失效法源，可一键**在文书内高亮定位**引用段落，并**直接在弹窗内检索现行有效法源替换、存为新版本**（替换后告警自动消除；弹窗按失效法源主题自动预填关键词并即时检索现行有效候选）。
- **提醒与通知中心**：后台**定时任务**（默认每 12 小时，无需登录）统一扫描去重，生成法源到期 / 逾期节点 / 临近期限 / 跨案庭期冲突 / 逾期·临近协作任务等多类提醒，写入**通知中心**（顶栏铃铛 + 未读数，按类型分组折叠）。每条通知可**点击直达**对应对象（逾期/临期/庭期冲突 → 案件时间轴，法源到期 → 法源维护并打开编辑，点击即标记已读）。每位成员可在「提醒偏好」自定义**临期提前天数、关注类型、接收渠道**（站内/外部），并「查看日报」生成可复制汇总。
  - **外部投递**：可选 `HENGFA_REMINDER_WEBHOOK` 主动 POST，payload 含工作区**总日报 `digest`** 与**按收件人个性化的 `deliveries`**（每位订阅外部渠道成员一封，便于群发邮件/企业微信/钉钉）。投递失败**留痕并下次扫描自动重发**（`webhook_outbox`，超过 `HENGFA_WEBHOOK_MAX_ATTEMPTS`（默认 5）标记 failed），管理员可在「平台与安全」页**可视化查看投递记录**并一键刷新 / 重试待发。
  - **自动清理**：超过 `HENGFA_NOTIF_RETENTION_DAYS`（默认 30）的**已读**通知与已发投递记录由定时任务自动清理（未读与失败记录保留）。
- 文书生成与文书 Agent：`generateDocument` 基于已录入信息拼装初稿（起诉状/答辩状/代理词/证据目录会**内嵌「证据链与补强提示」**，由证据矩阵自动列出待证事实的核验比例与补强建议），并可导出为结构化 DOCX。「智能文书」页（服务端模式）提供：
  - **事实抽取**（`POST /api/documents/facts`）：从案件已上传材料抽取带来源与类型标注的候选事实，可一键插入草稿；带日期的事实自动汇总为**升序排列的案件时间线**，并可**一键写入案件「程序时间轴」**（caseEvents，去重，过去=已完成/将来=待办理）；支持可选 Claude 结构化抽取（默认关，失败回退本地）。
  - **引用 / 事实 / 逻辑校验**（`POST /api/documents/verify`）：法条引用回法源库核验，金额/当事人等关键事实回案件材料与证据核验，标注「已匹配/未核验」「有依据/缺依据」；有依据项**标注命中的来源文件**，未核验法条可**一键跳转法律检索**、缺依据金额/当事人可**一键跳转证据/材料页**补充。新增**逻辑校验**（`logicCheck`）：检查诉请是否明确、当事人称谓一致、法律依据是否齐备、标的额/金额一致性、前后表述矛盾（如同时「已付清」与「拖欠」）、诉请的事实支撑、落款完整性，均为启发式提示。
  - **Agent 自动流编排**（`POST /api/agent/run`）：一键串接「意图识别 → 混合检索 → 事实分析 → 文书生成 → 引用与逻辑校验」，分阶段返回各步产物（含路由意图、引用片段、候选事实与时间线、文书初稿、校验结果），并把初稿与校验结果载入编辑器；Claude 启用时分析阶段走结构化抽取、失败回退本地。
  - **版本对比**：「保存版本」对草稿做内容快照，「版本对比」以行级 LCS diff 对比**任意两个版本（含当前草稿）**的增删差异。
- 意图识别（`POST /api/agent/intent`、[`agent.mjs`](agent.mjs)）：本地启发式把自然语言输入归类到办案能力（文书/检索/证据/期限/策略/庭审/执行/立案前评估），返回路由建议、候选与置信度，驱动 Agent 自动流第一步与问答页的「前往该模块」入口。
- 面向当事人初步答疑（`POST /api/consult/answer`）：以现行有效法源混合召回为依据，用通俗语言给出初步说明并强制附「不构成正式法律意见」提示与引用；问答页「办案视角 / 当事人初步答疑」双视角切换，当事人角色自动锁定为初步答疑。
- 立案前评估（`POST /api/assessment/prefiling`、`assessPrefiling`）：对主体适格/管辖/请求权基础/证据充分性/诉讼时效/标的与成本/调解可行性逐项打分（含《诉讼费用交纳办法》财产案件受理费累进估算），给出「立案准备度」分值与补强建议；本地启发式参考，诉讼时效等须人工核验。
- 案情策略：`calculateStrategy` 为本地启发式风险参考，不输出确定性胜败结论。「检索类案」（`POST /api/strategy/tendency`）按案件案由与关键事实经混合检索召回相似**裁判要旨样例**，本地聚合「支持 / 部分支持 / 驳回」占比作为**裁判倾向参考**；配置 Claude 后附带以召回片段为唯一依据、强制标注「（依据：类案N）」的倾向综述（失败回退本地）。**内置类案为要点归纳样例、不对应真实案号**，正式类案须回到中国裁判文书网核验。
- 数据：核心业务数据以工作区 JSON 形式存入 SQLite；案件文件、OCR 文本、法源检索片段、法源变更留痕、节假日表、提醒通知、提醒偏好与 webhook 投递记录已拆分为独立结构化表（`case_files`、`legal_sources`、`legal_chunks_fts`、`legal_embeddings`、`precedent_embeddings`、`legal_source_revisions`、`holiday_calendars`、`notifications`、`notification_prefs`、`webhook_outbox`）。

## 文件

- `index.html`：应用结构
- `styles.css`：响应式工作台样式
- `app.js`：数据模型、视图、交互逻辑与零依赖客户端 DOCX 导出
- `server.mjs`：零依赖本地服务器（认证、权限、状态同步、文件、FTS5 检索）
- `legal-corpus.mjs`：约 60 条条文级法律检索样例语料（首次启动写入 FTS5）
- `precedent-corpus.mjs`：约 17 条类案裁判要旨样例语料（首次启动写入 `precedent_fts`，用于类案检索与裁判倾向参考）
- `holidays.mjs`：法定节假日默认数据（首次启动播种，之后由管理员经 `/api/holidays` 集中维护）
- `ocr.mjs`：零依赖本地文字抽取兜底（图片 OCR、DOCX、文本、数字 PDF）
- `embedding.mjs`：本地语义向量引擎（零依赖法律概念向量默认 + 可选 Python 稠密模型），与 FTS5 混合检索
- `legal-domain.mjs`：法律领域适配层（领域系统提示 + 术语词典 + 概念词典；与检索共享概念，可经 `HENGFA_DOMAIN_PROFILE` 自定义）
- `agent.mjs`：Agent 办案启发式纯函数（意图识别、立案前评估打分、文书逻辑校验、受理费累进估算）
- `scripts/embed.py`：可选 sentence-transformers 本地稠密句向量加速器
- `transcribe.mjs`：庭审语音转写（本地引擎探测、音频转写、零依赖笔录 SRT/VTT/分段解析）
- `scripts/transcribe.py`：可选 faster-whisper 本地离线转写加速器
- `document-templates.mjs`：文书模板纯函数（Web 应用与 Word/WPS 插件共享，经 `/api/documents/generate`）
- `plugin/`：Word/WPS 文书助手 Office.js 加载项（任务窗格 + 清单 + 命令页 + 图标）
- `scripts/extract_text.py`：可选 Python 抽取加速器（PyMuPDF + python-docx）
- `scripts/fetch_flk.mjs`：官方法源库（flk.npc.gov.cn）抓取与导入脚本（本机联网运行）
- `tests/`：认证、权限、版本同步、前端权限、RAG 检索、**语义/混合检索**（向量召回纯字面漏召的概念同义项）、**法律领域适配**（领域提示组合/术语命中/自定义画像）、**工时计费**（费用结算测算）、**Agent 编排/意图识别/立案前评估/逻辑校验/当事人答疑**、批量导入、本地抽取、文书 Agent（事实抽取/引用校验）、类案裁判倾向、CRM/归档、庭审语音转写与 Word/WPS 插件（模板/生成端点/窗格服务）回归测试
- `民事诉讼AI办公软件框架-概要.pdf`：原始产品概要
