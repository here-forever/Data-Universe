# Docker 部署

Compose 只启动新系统所需的 FastAPI 后端和 Nginx 静态前端。SQLite、数据修订与报告导出共同保存在 `backend_storage` 卷中，不需要 PostgreSQL、Redis 或任务 worker。后端镜像启动时自动执行 Alembic 迁移，并以非 root 用户运行。

```powershell
docker compose up --build
```

本地地址：

```text
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:8000
API docs: http://127.0.0.1:8000/docs
```

停止服务：

```powershell
docker compose down
```

只有明确需要清空所有上传数据、修订、故事与导出时，才删除持久卷：

```powershell
docker compose down -v
```
