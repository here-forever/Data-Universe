# Vibe Data Universe Backend

FastAPI 与 Python 数据科学生态构成的新系统后端。它只处理文件数据集、分析运行、协作事件和数据故事，不包含账户、项目、权限、SQL 工作台、外部数据库连接、任务或治理模块。

## 启动

```powershell
uv sync --frozen --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

默认运行文件：

- 元数据：`storage/vibe-data.db`
- 数据修订：`storage/datasets/`
- 报告导出：`storage/exports/`

接口文档：`http://127.0.0.1:8000/docs`

## API 分区

- `GET /api/v1/health`、`GET /api/v1/health/live`
- `GET /api/v1/health/ready`（数据库与存储就绪探测）
- `GET /api/v1/metrics`（Prometheus 指标）
- `GET|POST|DELETE /api/v1/datasets...`
- `POST /api/v1/insights/{dataset_id}/explore`
- `POST /api/v1/insights/{dataset_id}/ask`
- `POST /api/v1/insights/llm/check`
- `POST /api/v1/insights/{dataset_id}/advanced`
- `GET|POST|PATCH|DELETE /api/v1/stories...`
- `WS /api/v1/collaboration/{dataset_id}/ws`

上传接口只接受 CSV、XLSX、XLS、JSON 与 TXT。清洗操作生成新的不可覆盖修订；分析运行和故事引用当前数据集，不建立旧系统中的项目或权限关系。

## 验证

```powershell
uv run ruff check app tests
uv run pytest
```

迁移验证：

```powershell
$env:DATABASE_URL = "sqlite+pysqlite:///./storage/migration-check.db"
uv run alembic upgrade head
```

## 可选 AI 解说

未设置 `LLM_API_KEY` 时，问数由本地统计引擎完成。部署方可设置 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 与 `LLM_API_STYLE` 作为默认模型；`LLM_API_STYLE` 支持 `responses` 和 `chat_completions`。

`POST /api/v1/insights/llm/check` 可验证用户提供的临时模型配置，`POST /api/v1/insights/{dataset_id}/ask` 也接受同结构的可选 `llm` 字段。临时 API Key 只用于当次上游请求，不写入分析历史。系统只向模型发送聚合画像与探索结果，不发送原始数据行。
