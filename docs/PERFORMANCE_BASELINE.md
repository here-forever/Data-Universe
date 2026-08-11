# 性能验收基线

版本：v1.0  
记录日期：2026-08-03  
环境：Windows、Python 3.13、Node.js 24

## 修订存储与分页

执行命令：

```powershell
cd backend
$env:UV_CACHE_DIR='D:\data-analyse\.uv-cache'
uv run --frozen python ../scripts/benchmark_storage.py
```

基准生成 50 万行、6 列数据；JSONL 输入为 77.13 MiB，转换后的 Zstandard Parquet 为 15.86 MiB。分页读取固定为偏移 250,000、返回 50 行。

| 存储与读取路径 | 耗时 | Python 分配峰值 |
| --- | ---: | ---: |
| JSONL 全量解析后切片 | 18.8028 秒 | 789.84 MiB |
| Parquet 行组分页 | 0.0293 秒 | 0.02 MiB |

Parquet 文件体积降低约 79.4%，该分页用例耗时降低约 99.8%。峰值由 `tracemalloc` 采集，只表示 Python 可追踪分配，不包含 PyArrow 的全部原生内存；结果用于版本间相同环境回归，不等同于进程 RSS。

## 前端生产构建

执行命令：

```powershell
cd frontend
$env:VITE_API_BASE_URL='http://127.0.0.1:8000/api/v1'
npm run build
```

| 产物 | 优化前 | 优化后 |
| --- | ---: | ---: |
| Three.js | 758.88 kB | 531.75 kB |
| React Three Fiber | 164.94 kB | 已移除 |
| ECharts 按需模块 | 594.25 kB | 604.23 kB |

默认数据宇宙路由的 3D 依赖由 923.82 kB 降至 531.75 kB，减少约 42.4%。Three.js 与 ECharts 两个重型 vendor 块均低于 700 kB；路由和粒子画布继续按需加载。

## 回归规则

- 存储基准输入不得低于 50 MiB，分页仍固定返回 50 行。
- Three.js 或 ECharts 任一压缩前 vendor 块不得超过 700 kB。
- 数值仅在相同依赖锁、构建模式和硬件环境下直接比较。

## 生产镜像

执行 `docker build` 后直接检查镜像配置与容器内 `id`：

| 镜像 | 镜像大小 | 默认运行用户 | 容器内身份 |
| --- | ---: | --- | --- |
| 后端 | 212,842,465 bytes（约 203.0 MiB） | `app` | `uid=999(app) gid=999(app)` |
| 前端 | 23,592,745 bytes（约 22.5 MiB） | `101` | `uid=101(nginx) gid=101(nginx)` |

前端最终镜像只包含 Nginx 与静态产物，不包含 Node.js、源码或 `node_modules`；后端使用 `uv.lock` 冻结依赖并以非 root 用户运行。
