# Vibe Data Universe

面向大学生、科研人员与数据分析初学者的数据探索系统。系统以本地文件为唯一数据接入方式，把上传、画像、清洗、分析、3D 粒子叙事和报告导出组织成一条连续工作流。

旧系统的账户、项目、权限、外部数据库连接、SQL 工作台、任务中心、治理中心和传统仪表盘已移除；当前代码与数据模型只服务于新系统。

## 核心工作流

```text
CSV / Excel / JSON / TXT
  -> 自动画像与质量评分
  -> 版本化清洗
  -> EDA / 中文问数 / 高级统计
  -> 3D 数据粒子叙事
  -> 故事流编辑
  -> HTML / PDF 导出
```

## 产品界面

- **数据宇宙**：每一行数据映射为一个 3D 粒子，支持旋转、缩放、自动巡航、轴与颜色映射、粒子检查和 AI 解说。
- **数据工作台**：拖拽上传四类文件，查看分页数据、字段画像、质量问题与修订历史，组合去重、缺失值处理和异常标记。
- **分析实验室**：自动 EDA、智能图表推荐、图表点击联动、相关性矩阵、异常检测、中文问数、回归、Welch 检验与 KMeans 聚类。
- **故事编辑器**：将指标、图表、质量与叙述编排成故事流，支持保存、重排和 HTML/PDF 导出。
- **协作画布**：WebSocket 同步在线状态、图表筛选、粒子映射、清洗和故事操作。

## 技术架构

- 前端：React、TypeScript、Vite、Zustand、TanStack Query、Three.js、React Three Fiber、ECharts。
- 后端：FastAPI、SQLAlchemy、Pydantic、Pandas、NumPy、SciPy、Scikit-learn、ReportLab。
- 数据：SQLite 保存工作区元数据，本地文件系统保存数据修订与导出文件。
- AI：默认统计引擎可离线回答；配置大模型 API 后自动切换为外部解说模式。

详细的重建范围和验收映射见 [docs/REBUILD_PLAN.md](docs/REBUILD_PLAN.md)。原始需求文档保留在 [docs/instruction.md](docs/instruction.md)。

## 本地启动

需要 Python 3.13、Node.js 24 和 `uv`。

后端：

```powershell
cd backend
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

前端：

```powershell
cd frontend
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173`。首次进入且没有数据集时，系统会自动生成一份校园学习节律演示数据；也可以上传 [examples/student_learning_rhythm.csv](examples/student_learning_rhythm.csv)。

## Docker 启动

```powershell
docker compose up --build
```

前端地址为 `http://127.0.0.1:5173`，后端 API 文档为 `http://127.0.0.1:8000/docs`。运行数据保存在 `backend_storage` 卷中。

## 可选大模型

复制 `.env.example` 为 `.env`，只在需要外部 AI 解说时设置：

```text
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-5-mini
LLM_API_STYLE=responses
```

`LLM_API_STYLE` 可设为 `responses` 或 `chat_completions`。也可以在“数据宇宙”或“分析实验室”的 AI 解说员中打开模型设置，选择 OpenAI、DeepSeek、通义千问或自定义兼容服务。界面设置优先于环境默认值；API Key 仅保留在当前应用会话，不写入浏览器本地存储、数据库或分析历史。

未启用外部模型时，中文问数仍使用本地统计证据引擎工作。无论使用哪种模式，原始数据行都不会发送给外部模型。

## 验证

```powershell
cd backend
uv run ruff check app tests
uv run pytest

cd ..\frontend
npm run lint
npm test -- --run
npm run build
npm run format
```

后端端到端测试覆盖四种文件接入、画像、版本化清洗、EDA、联动筛选、中文问数、高级统计、粒子数据、WebSocket、故事编辑与两类导出。

## 数据边界

- 数据接入仅支持 CSV、Excel（`.xlsx` / `.xls`）、JSON 和 TXT。
- 默认单文件上限 128 MiB、50 万行、300 列，可通过环境变量调整。
- 上传文件、SQLite 数据库、导出报告和 `.env` 均被 Git 忽略。
