# Vibe Data Universe Frontend

新系统的 React + TypeScript 前端，包含数据宇宙、数据工作台、分析实验室和故事编辑器四个工作区。应用不需要登录，也没有旧系统的项目或治理导航。

## 启动

```powershell
npm ci
npm run dev
```

默认地址：`http://127.0.0.1:5173`

后端默认使用 `http://127.0.0.1:8000/api`。需要覆盖时设置 `VITE_API_BASE_URL`。

## 验证

```powershell
npm run lint
npm test -- --run
npm run build
npm run format
```

3D 粒子页和分析图表按路由延迟加载；桌面端使用左侧工作区导航，移动端使用固定底部导航。
