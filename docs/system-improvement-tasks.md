# Vibe Data Universe 后续系统完善任务文档

> 版本：v1.0 ｜ 编制日期：2026-08-03 ｜ 适用范围：`D:\data-analyse` 全仓库
> 编制依据：基于 `git ls-files`（113 个受版本控制文件）对 `backend/`、`frontend/`、`docker/`、`docs/` 的静态分析，关键结论均已对照源码行号核实。

---

## 0. 文档说明

### 0.1 目的
本文件在「系统功能已完成重建（`docs/REBUILD_PLAN.md` 标记为全部完成）」的前提下，转入**运维成熟度与健壮性**阶段，明确后续需要完善的工作。所有结论均来自当前代码真实状态，可直接指导开发排期。

### 0.2 现状总评（客观判断）
工程质量**高于典型课程/演示项目**：分层清晰（router→service→repository→model）、类型完备（后端 Pydantic + 前端 strict TS）、前后端错误契约对齐、密钥处理有安全意识（`SecretStr` + `public_dict()` + zustand `partialize` 三重保障且有测试）、具备 CI + gitleaks + Dependabot、前端有路由懒加载与悬停预取、中英 i18n 完整、代码几无 TODO 残留。

但系统呈现 **「功能完成度优先、运维成熟度滞后」** 的特征：缺少生产级安全兜底（SSRF、调试模式泄露）、缺日志与监控、大文件读取存在性能瓶颈、工程化（覆盖率/多环境/CD）不完整、部分 `instruction.md` 原始需求被静默裁减。

### 0.3 如何使用本文档
- 第 1–4 章为分类阐述，第 6 章为**按优先级汇总的任务清单**（每项含目标描述 / 涉及范围 / 预期产出）。
- 所有任务已标注 **P0–P3 优先级**（P0 安全/正确性必做，P3 文档/需求补齐）。
- 可对照附录 A 将任务映射到 TAPD 的 需求(story) / 缺陷(bug) / 任务(task) 类型，使用 `tapd-cli` 批量导入。

### 0.4 优先级定义
| 等级 | 含义 | 处理节奏 |
|------|------|----------|
| **P0** | 安全漏洞或导致错误响应 / 数据风险，上线前必须修复 | 立即 |
| **P1** | 用户可感知的性能瓶颈、线上稳定性风险 | 本迭代 |
| **P2** | 工程化、可维护性、一致性问题 | 下迭代 |
| **P3** | 文档一致性、需求补做评估 | 排期或明确放弃 |

---

## 1. 待优化的功能模块

### 1.1 数据情绪面板（原始需求未实现）
- **依据**：`docs/instruction.md:82-89` 提出「数据好时界面明亮温暖、差时冷静深沉、主色调随指标动态调整、背景音乐随数据变化」；`REBUILD_PLAN.md` 需求映射表中**无此行**，属重建时被静默裁减。
- **现状**：`workspaceStore.ts:52` 仅有手动 `theme: "dark"|"light"` 开关，无数据驱动色彩；背景音乐完全缺失。
- **优化方向**：基于 `DatasetProfile` 质量评分映射一组调色板与动效强度；接入 Web Audio 轻量氛围音（可配置开关，默认关）。

### 1.2 粒子叙事增强
- **依据**：`instruction.md:59` 运动轨迹映射变化趋势、`instruction.md:66` 自动聚类成星团、`instruction.md:113-117` 辉光后处理 / 鼠标交互力场。
- **现状**：`ParticleUniverse.tsx` 仅整组匀速自转；粒子位置由 `_axis()` 的 z-score 标准化直接映射（`data/service.py:346-361`），无聚类布局；`ParticleUniverse.tsx:71-87` 为顺序相邻连线（上限 220 条），无 bloom、无鼠标力场。
- **优化方向**：时间序列粒子沿时间轴流动、流速反映变化幅度；基于 PCA/UMAP 或 k-means 做星团聚类布局；引入 `@react-three/postprocessing` Bloom；鼠标吸引/排斥力场（useFrame 内更新 velocity）。

### 1.3 AI 解说员：图表元素点击解释
- **依据**：`instruction.md:78`「用户点击任何图表元素，AI 解释其含义」。
- **现状**：仅支持独立问答框；图表点击仅触发筛选联动，未联动 LLM。
- **优化方向**：`AnalysisChart.tsx` 的 ECharts `click` 事件回调 → 携带字段/取值/上下文调用 `ask`，返回解释气泡。

### 1.4 前端大数据预览虚拟滚动
- **依据**：`instruction.md:298` 明确要求虚拟滚动；后端 `rows` 上限 200（`routes/library.py:54`）。
- **现状**：`PreviewTable`（`DataWorkbenchPage.tsx:537`）一次性渲染 200 行 × N 列 DOM，无虚拟滚动。
- **优化方向**：引入 `@tanstack/react-virtual` 对行做窗口化渲染；列过多时考虑横向虚拟滚动或分页。

### 1.5 协作体验增强
- **依据**：`docs/USER_GUIDE.md:221` 承认协作无账户/权限，适合可信局域网。
- **现状**：WebSocket 房间存进程内存（`collaboration/hub.py:11`），多实例失效且无上限；`CollaborationContext.tsx:95` 无自动重连；`JSON.parse` 无校验（`:105`）。
- **优化方向**：见任务 T-14、T-15（重连 + 校验 + 外部 pub/sub）。

### 1.6 国际化解耦与增强
- **依据**：`frontend/src/i18n/index.ts`（720 行，纯手写字典）+ 后端 `localized()` 硬编码双写。
- **现状**：无 i18next/react-intl；无复数/日期/货币本地化；720 行文案全进主 bundle；后端双语文案与算法强耦合（`insights/service.py`、`narrator.py` 数十处 `if locale==`）。
- **优化方向**：前端引入 i18next + 语言包懒加载；后端抽取文案到资源文件或模板引擎，分离展示层与算法。

### 1.7 WebGPU / LOD 渲染（性能）
- **依据**：`instruction.md:296` 建议 WebGPU、LOD。
- **现状**：`ParticleUniverse.tsx:158-162` 仍是 WebGL，`dpr={[1,1.65]}` 是唯一性能控制。
- **优化方向**：评估 `@react-three/fiber` + WebGPURenderer；按粒子数自适应 dpr / 采样数（已有 `particle_sample_rows` 可作阈值）。

---

## 2. 已知问题修复项（含代码证据）

| 编号 | 问题 | 证据位置 | 严重度 |
|------|------|----------|--------|
| B1 | **SSRF**：LLM `base_url` 由用户提交，后端直接 `httpx.post` 且错误回显上游响应体 | `narrator.py:135-140`；`insights/schemas.py:62-72` 仅拒绝 credentials/query/fragment，未做内网黑名单 | **高** |
| B2 | **上传先读全文件到内存**：`file.read()` 在大小校验前执行，128MiB 上限形同虚设（DoS） | `routes/library.py:33`；大小校验在 `parser.py:25` 才发生 | **高** |
| B3 | **缺 `Exception` 兜底处理器**：未捕获异常返回 Starlette 默认 HTML，破坏前端 JSON 契约；`RequestValidationError` 未拦截 | `main.py:37` 仅注册 `AppError` 处理器 | **中高** |
| B4 | **`app_debug` 默认 `True`**：生产若不显式覆盖，FastAPI 返回完整 traceback | `config.py:11`；`docker-compose.yml:8` `APP_DEBUG:-true` | **中高** |
| B5 | **双轨建表**：`init_database()` 的 `create_all()` 与 Alembic 并存，导致 `alembic_version` 表空而表已存在，后续迁移失败 | `main.py:18`；`core/database.py:32`；`README.md:55` | **中高** |
| B6 | **`assert` 用于业务校验**：`-O` 运行下退化为 `TypeError` | `data/service.py:105,116` | 中 |
| B7 | **`StopIteration` 未兜底**：找不到 active revision 时 `next(...)` 抛异常→500 | `data/repository.py:40` | 中 |
| B8 | **协作房间内存态**：多 worker/多实例下失效，且房间数/连接数无上限 | `collaboration/hub.py:11`；`routes/collaboration.py:13-19` 无消息大小/频率限制、无 schema 校验 | 中 |
| B9 | **前端协作无重连 + 畸形消息未校验**：断线永不重连；`JSON.parse` 无 try/catch | `CollaborationContext.tsx:95,105` | 中 |
| B10 | **演示数据字段不一致**：`examples/student_learning_rhythm.csv` 与 `build_demo_frame()` 字段不同，按 USER_GUIDE 操作字段对不上 | `examples/` vs `data/service.py:364-389` | 低 |
| B11 | **文档与 CI 不一致**：README 引用不存在的 `scripts/` 目录；README/USER_GUIDE 要求 `npm run format`，但 CI 不执行 | `README.md:106,137`；`.github/workflows/ci.yml` | 低 |
| B12 | **Docker 镜像不生产可用**：前端容器跑 `npm run dev`、后端容器 root 用户、构建未用 `uv.lock` | `docker/frontend.Dockerfile:12`；`docker/backend.Dockerfile:9` | 中高 |
| B13 | **PDF 字体仅中文 CID**：非中文字符可能缺字 | `stories/exporter.py:59` | 低 |
| B14 | **粒子颜色硬编码 6 色**：类别 >6 时颜色重复 | `data/service.py:28` | 低 |

### 正面结论（无需处理）
无明文密码；**无 SQL 字符串拼接**（全程 SQLAlchemy Core `select()` 参数化）；Pydantic 输入校验覆盖充分；`SecretStr` + `public_dict()` 确保密钥不落库；HTML 导出全程 `escape()` 无 XSS；前端无 `dangerouslySetInnerHTML`/`eval`。

---

## 3. 性能与安全性提升点

### 3.1 性能
1. **JSONL 全量读取（瓶颈之首）**：`_read_frame()`（`data/service.py:304-305`）每次请求把整个 JSONL 解析成 DataFrame；实测存在 **66MB** 修订文件，翻一页 50 行也全量加载。→ 改为列式存储（Parquet）+ 分页/投影读取，或至少对 `rows`/`detail` 做按需列切片 + LRU 缓存。
2. **前端 vendor 包过大**：`three` 全量导入（900KB，tree-shaking 失效）+ `echarts` 未按需（590KB），首屏 JS 约 1.9MB。→ `three` 仅引 `BufferGeometry/BufferAttribute/Color/Points/Group`；`echarts` 改 `echarts/core` 按需注册。
3. **预览表无虚拟滚动**（见 1.4）。
4. **SQLite 未优化**：未开启 WAL、未调连接池（仅 `pool_pre_ping`）。→ 开启 WAL、`checkpoint` 策略、`pool_size` 调优。
5. **上传未流式**：见 B2，改为流式读取 + 边读边校验大小，避免内存峰值。

### 3.2 安全性
1. **SSRF（P0）**：见 B1，需内网地址黑名单（拒绝 `127.0.0.0/8`、`169.254.0.0/16`、`10/172.16/192.168`、IPv6 `::1`/`fc00::/7`）、强制 HTTPS、**不回显**上游响应体（仅返回标准化错误）。
2. **调试模式泄露**（P0）：见 B4。
3. **鉴权缺失风险**：系统当前**设计上无鉴权**（`docs/USER_GUIDE.md` 已说明），因此所有数据集可被同网段任意删除（`DELETE /api/datasets/{id}` 无保护且物理删盘）。若部署到非 localhost 或多用户环境，需补轻量鉴权（如共享口令 / 网关层 Basic Auth / mTLS），或至少在文档显式标注「仅限可信单机/局域网」。
4. **密钥明文过网**：前端 API Key 经后端转发给 LLM，若后端非 HTTPS 则泄露。→ 强制 HTTPS、后端 `llm_base_url` 强制 `https://`。
5. **Docker 以 root 运行**：`docker/backend.Dockerfile` 未建非特权用户。→ 增加 `USER appuser`。
6. **CORS**：当前 `allow_credentials=False` 良好，但白名单为 localhost；部署到子域时需同步更新 `backend_cors_origins`，避免退化为放行。

---

## 4. 可扩展性改进建议

### 4.1 API 版本与契约
- 引入 `/v1` 前缀（`config.py:12` 当前仅为 `/api`，无版本）；对 `dict[str, Any]` 响应字段（`DatasetDetail.profile`、`ExploreResponse.overview` 等）补 Pydantic 模型，消除隐蔽破坏性变更通道；评估 OpenAPI codegen 生成前端 TS 类型，替代手写镜像。

### 4.2 分层一致性
- 仅 `data` 域有 repository 层；`insights`、`stories` service 直接写 SQLAlchemy 查询（`insights/service.py:151-158`、`stories/service.py:28/32`）。→ 补齐 repository 层。
- 服务间直接 `new`（`InsightService.__init__` new `DatasetService`；`StoryService` new 两者），无依赖注入 → 改用构造函数注入，便于单测。

### 4.3 拆分「上帝文件」
- `backend/app/insights/service.py`（740 行，含 `chart_recommendations()` 单函数 267 行，5 个高重复分支）→ 拆分为 `exploration/charts/hypothesis/clustering` 子模块。
- `frontend/features/data/DataWorkbenchPage.tsx`（985 行）、`AnalysisLabPage.tsx`（899 行）→ 抽取子组件到独立文件。
- `frontend/src/styles/index.css`（3691 行单文件）→ 引入 CSS Modules / 按页拆分，降低全局命名冲突与不可摇树风险。

### 4.4 多环境配置
- `app_env` 已声明但**全库无读取**（`config.py:10`）；无 `.env.development/.production/.test`；`app_debug` 默认 True、前端 `VITE_API_BASE_URL` 有 localhost 硬 fallback。→ 实现 `if app_env == "production"` 分支、三套 env 模板、CI 用独立 test 配置、构建期缺失变量即报错。

### 4.5 可观测性（当前几乎为零）
- 后端**零日志**（`git grep "import logging"` 在 backend/app 返回 0）；无 `/metrics`、无 Sentry、无 APM。
- `GET /api/health` 仅返回硬编码 `{"status":"ok"}`，不检查数据库/存储可写、不返回版本 → 拆分 liveness/readiness，readiness 探测 DB 与磁盘。
- 引入结构化 JSON 日志（request id 贯穿）+ `/metrics`（Prometheus）+ LLM 调用耗时/成本统计。

### 4.6 工程化与 CI/CD
- **CI 缺口**：不测覆盖率、不跑 Prettier（与 README 矛盾）、不跑 Alembic 空库升级、不构建 Docker 镜像、无 CD、单 OS 单版本（无 Windows matrix，但本地开发在 Windows）。
- **补齐**：`pytest-cov`/覆盖率门禁、Prettier 检查、`alembic upgrade head` 空库验证、Docker 构建 job；新增 CD workflow（镜像推送 + 发布）；增加 Makefile/Taskfile 统一命令；`backend` job 改用 `uv sync` 锁定 `uv.lock`。

### 4.7 持久层与协作演进
- **存储**：评估将修订文件从 JSONL 改为 **Parquet**（列式、压缩、按需读列），缓解 3.1.1 瓶颈；可选支持 PostgreSQL 用于多用户/并发场景。
- **协作**：内存房间改为外部 pub/sub（Redis / NATS），支持多实例与重连，并加房间数/连接数上限与消息 schema 校验。

---

## 5. （略）详见第 6 章汇总

---

## 6. 按优先级排序的任务清单

> 每项含：**目标描述 / 涉及范围 / 预期产出**。可直接拆为开发工单。

### P0 — 安全与正确性（上线前必做）

**T-01 修复 LLM base_url SSRF**
- 目标描述：阻止通过用户可控 `base_url` 探测内网或云元数据，并不泄露上游响应内容。
- 涉及范围：`backend/app/insights/narrator.py:135-140`、`insights/schemas.py:62-72`、新增 `core/ssrf_guard.py`。
- 预期产出：内网/链路本地地址黑名单校验；强制 `https://`；`ExternalLlmError` 仅返回标准化文案，不含上游 body；单测覆盖 `127.0.0.1`/`169.254.169.254`/`[::1]` 等用例。

**T-02 上传改为流式读取并前置大小校验**
- 目标描述：避免 128MiB 文件先全量读入内存造成内存峰值/DoS。
- 涉及范围：`routes/library.py:33`、`parser.py:25-57`、`data/service.py.create_upload`。
- 预期产出：基于 `SpooledTemporaryFile`/分块读取，在超过 `upload_max_bytes` 时立即 413，内存占用与文件大小解耦；单测覆盖超限与边界值。

**T-03 补全全局异常兜底处理器**
- 目标描述：任何未捕获异常（含 `RequestValidationError`）均返回统一 JSON，不再泄露 Starlette HTML。
- 涉及范围：`main.py:37`、新增 `core/errors.py` 兜底 handler、`frontend/apiClient.ts` 已兼容该结构。
- 预期产出：注册 `Exception` 与 `RequestValidationError` 处理器；500 返回 `{"error":{"code","message"}}`；附 request id；补充对应测试。

**T-04 关闭生产调试模式默认值**
- 目标描述：防止 traceback 泄露。
- 涉及范围：`config.py:11` 默认改 `False`；`docker-compose.yml:8` 改 `${APP_DEBUG:-false}`；文档同步。
- 预期产出：`app_debug` 默认 False；仅在显式设置时开启；安全评审检查项。

### P1 — 性能与线上稳定性（本迭代）

**T-05 统一建表机制为 Alembic**
- 目标描述：消除 `create_all()` 与 Alembic 双轨导致的迁移失败。
- 涉及范围：`main.py:18`、`core/database.py:32`、`README.md:55`。
- 预期产出：移除 `init_database()` 内的 `create_all`，由 `alembic upgrade head` 建表；liveness 不依赖建表；CI 增加空库升级验证。

**T-06 修订数据列式存储 + 按需读取（性能瓶颈之首）**
- 目标描述：消除每次请求全量 `pd.read_json`（实测 66MB 文件），降低内存与延迟。
- 涉及范围：`data/service.py:296-305`、repository、`routes/library.py` 的 `rows/detail/particles/explore`。
- 预期产出：改用 Parquet 或按需列切片 + LRU 缓存；分页接口内存稳定；提供大文件（≥50MB）性能基准对比。

**T-07 前端 vendor 包按需引入**
- 目标描述：削减首屏 JS（当前约 1.9MB）。
- 涉及范围：`features/universe/ParticleUniverse.tsx:8`、`features/analysis/AnalysisChart.tsx`、`vite.config.ts`。
- 预期产出：`three` 仅引所需类、`echarts` 改 core 按需注册；首屏 JS 显著下降（目标 vendor < 700KB），`vite build` 产物对比记录。

**T-08 预览表虚拟滚动**
- 目标描述：大数据预览不卡顿。
- 涉及范围：`features/data/DataWorkbenchPage.tsx:537 (PreviewTable)`。
- 预期产出：引入 `@tanstack/react-virtual`，窗口化渲染；200 行 × 多列流畅滚动。

**T-09 移除业务 `assert`、兜底 `StopIteration`**
- 目标描述：避免 `-O` 下行为退化与未捕获 500。
- 涉及范围：`data/service.py:105,116`、`data/repository.py:40`。
- 预期产出：`assert` 改为 `AppError` 校验；`next(...)` 提供默认值或显式 404；补测试。

**T-10 Docker 镜像生产化**
- 目标描述：前端用构建产物 + 静态服务器，后端非 root、依赖可复现。
- 涉及范围：`docker/frontend.Dockerfile:12`、`docker/backend.Dockerfile:9`、新增非特权用户、改用 `uv sync`。
- 预期产出：前端 `npm run build` + 静态服务（nginx/Caddy）；后端 `uv sync --frozen`；容器以非 root 运行；镜像体积下降。

**T-11 协作房间治理（内存/多实例/上限）**
- 目标描述：防止无上限连接导致内存耗尽，并为多实例打基础。
- 涉及范围：`collaboration/hub.py:11`、`routes/collaboration.py:13-19`。
- 预期产出：房间数/连接数上限 + 超出拒绝；消息大小/频率限制 + schema 校验；单测覆盖广播异常清理分支。

### P2 — 工程化与可维护性（下迭代）

**T-12 引入结构化日志与可观测端点**
- 目标描述：填补后端零日志与无监控空白。
- 涉及范围：新增 `core/logging.py`、`routes/health.py`、`/metrics` 端点、LLM 调用审计。
- 预期产出：request id 结构化日志；`/health` 拆 liveness/readiness（探测 DB+磁盘+版本）；Prometheus `/metrics`；LLM 耗时/成本统计。

**T-13 覆盖率工具与测试补齐**
- 目标描述：掌握真实覆盖率，覆盖核心业务。
- 涉及范围：`pyproject.toml`（加 `pytest-cov`）、`package.json`（加 `@vitest/coverage-v8`）、4 个主页面（2841 行）补测试、CI 加门禁。
- 预期产出：后端/前端覆盖率报告；主页面关键交互测试；CI 设阈值（如 ≥60% 起步）。

**T-14 前端协作重连与消息校验**
- 目标描述：断线自动恢复、畸形消息不崩溃。
- 涉及范围：`features/collaboration/CollaborationContext.tsx:95,105`。
- 预期产出：基于指数退避的 WebSocket 重连；`JSON.parse` 包裹 try/catch + 运行时校验；清理 `sessionStorage` 历史兼容分支。

**T-15 API 版本与响应契约强化**
- 目标描述：消除隐蔽破坏性变更。
- 涉及范围：`config.py:12`、`data/schemas.py`、`insights/schemas.py` 的 `dict[str, Any]` 字段、OpenAPI。
- 预期产出：`/api/v1` 前缀；关键响应字段改 Pydantic 模型；评估 OpenAPI codegen 替代手写 TS 类型。

**T-16 后端分层一致与依赖注入**
- 目标描述：insights/stories 补 repository 层，服务解耦便于单测。
- 涉及范围：`insights/service.py:151-158`、`stories/service.py:23-32`。
- 预期产出：抽出 repository 层；`DatasetService/InsightService` 经构造函数注入；单测可不依赖 HTTP 层。

**T-17 拆分上帝文件**
- 目标描述：降低单文件复杂度，提升可维护性。
- 涉及范围：`insights/service.py`(740)、`chart_recommendations()`(267)、`DataWorkbenchPage.tsx`(985)、`AnalysisLabPage.tsx`(899)、`styles/index.css`(3691)。
- 预期产出：拆分为按子域/按组件的小文件；`styles` 改为 CSS Modules 或按页拆分。

**T-18 多环境配置落地**
- 目标描述：支持 dev/test/prod 差异。
- 涉及范围：`config.py:10`（`app_env` 启用）、新增 `.env.*` 模板、前端构建期变量校验。
- 预期产出：`app_env` 分支逻辑；三套 env 模板；CI 用独立 test 配置；前端缺失 `VITE_API_BASE_URL` 构建即失败。

**T-19 CI/CD 与工程化补齐**
- 目标描述：把「CI/CD」补全为真正闭环。
- 涉及范围：`.github/workflows/ci.yml`、`dependabot.yml`、新增 CD workflow、Makefile。
- 预期产出：CI 加 Prettier 检查、Alembic 空库升级、Docker 构建；新增 CD（镜像推送+发布）；Makefile 统一命令；Windows matrix 至少 smoke。

**T-20 国际化解耦与增强**
- 目标描述：降低 bundle 体积、解耦业务与文案。
- 涉及范围：`frontend/src/i18n/index.ts`、`insights/service.py`、`narrator.py` 的 `localized()`/`if locale==`。
- 预期产出：前端引入 i18next + 语言包懒加载；后端文案抽取到资源；补复数/日期本地化。

### P3 — 文档一致性与需求补齐（排期或明确放弃）

**T-21 文档与演示数据一致性修复**
- 目标描述：消除文档与现实不符带来的困惑。
- 涉及范围：`README.md:106`（不存在的 `scripts/`）、`examples/` 与 `build_demo_frame()` 字段、`USER_GUIDE.md` 操作指引。
- 预期产出：删除/补全 `scripts/` 说明；统一演示数据集字段或明确两套数据用途；CI 不跑 Prettier 的问题对齐文档。

**T-22 原始需求裁减项决策**
- 目标描述：对 `instruction.md` 中被静默裁减的创新点做「补做/明确放弃」决策。
- 涉及范围：`instruction.md:82-89`（数据情绪面板）、`:59/:66`（粒子轨迹与聚类）、`:78`（图表点击 AI 解释）、`:296`（WebGPU/LOD）。
- 预期产出：产品决策文档，明确每项是否纳入路线图；若放弃，在 `REBUILD_PLAN.md` 显式标注「不做」及原因。

**T-23 渲染与导出细节修复**
- 目标描述：提升兼容性与观感。
- 涉及范围：`stories/exporter.py:59`（PDF 字体）、`data/service.py:28`（粒子颜色硬编码）。
- 预期产出：PDF 字体回退方案（中英混排）；粒子调色板随类别数扩展或循环取样。

---

## 附录 A：任务 → TAPD 类型映射建议

| TAPD 类型 | 适用任务 | 说明 |
|-----------|----------|------|
| **缺陷 (bug)** | T-01、T-02、T-03、T-04、T-05、T-09、T-10、T-11、T-14、T-21、T-23 | 有明确错误/风险证据，优先回归 |
| **需求 (story)** | T-06、T-07、T-08、T-12、T-13、T-15、T-16、T-17、T-18、T-19、T-20、T-22 | 功能/架构增强 |
| **任务 (task)** | 上述 story/bug 下拆出的具体开发项 | 如「拆分 chart_recommendations 函数」 |

导入示例（需配置 `TAPD_API_ENDPOINT` / `TAPD_TOKEN` / `TAPD_WORKSPACE_IDS`）：
```bash
tapd-cli bug add workspaceid=<ID> title="修复 LLM base_url SSRF" severity=serious \
  description="narrator.py:135 用户可控 base_url 直接 httpx.post，需加内网黑名单+强制HTTPS+不回显"
tapd-cli story add workspaceid=<ID> title="修订数据改 Parquet 列式存储按需读取" \
  description="data/service.py:304 每次全量 read_json，实测66MB，需削减内存与延迟"
```

---

## 附录 B：关键文件索引
- 后端入口/配置：`backend/app/main.py`、`backend/app/core/config.py`、`backend/app/core/database.py`、`backend/app/core/errors.py`
- 高风险业务：`backend/app/data/service.py`、`backend/app/insights/narrator.py`、`backend/app/api/routes/library.py`、`backend/app/api/routes/collaboration.py`
- 前端关键：`frontend/src/lib/apiClient.ts`、`frontend/src/features/data/DataWorkbenchPage.tsx`、`frontend/src/features/universe/ParticleUniverse.tsx`、`frontend/src/features/collaboration/CollaborationContext.tsx`、`frontend/src/styles/index.css`
- 部署/CI：`docker-compose.yml`、`docker/frontend.Dockerfile`、`docker/backend.Dockerfile`、`.github/workflows/ci.yml`
