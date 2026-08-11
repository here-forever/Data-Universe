# GitHub Pages 部署与自定义域名配置说明

本仓库的项目展示站（`site/` 目录）通过 GitHub Actions 自动部署到 GitHub Pages。

- **默认访问地址**：<https://here-forever.github.io/Data-Universe/>
- **自定义域名**：`site/CNAME` 当前为占位域名 `example.com`，**未实际绑定**（占位值不会发布，站点走默认地址；替换方法见下文第 3 节）

---

## 1. 自动部署流程

工作流文件：`.github/workflows/deploy-pages.yml`

触发条件（满足其一）：

1. 推送到 `main` 分支，且变更涉及 `site/**` 或工作流文件本身
2. 在仓库 **Actions → Deploy site to GitHub Pages → Run workflow** 手动触发

执行步骤：

| 阶段 | 内容 |
|------|------|
| build | `html-minifier` / `cleancss` / `uglifyjs` 压缩 `site/` 下的 HTML/CSS/JS 到 `dist/`，并拷贝 `screenshots/`；`CNAME` 仅在其内容**不是占位值** `example.com` 时才拷贝进产物 |
| deploy | 通过 `actions/deploy-pages@v4` 将 `dist/` 发布到 GitHub Pages |

部署状态可在仓库 **Actions** 页查看；每次部署约 1–2 分钟生效。

## 2. 仓库侧配置（已完成，供复核）

- **Settings → Pages → Source**：`GitHub Actions`（通过 REST API `build_type=workflow` 设置）
- **Settings → Pages → Custom domain**：当前未绑定。`site/CNAME` 是自定义域名的**唯一事实来源**：
  - 内容为占位值 `example.com` 时，工作流不会把它发布到产物中，GitHub Pages 不绑定任何自定义域名，站点通过默认地址访问；
  - 内容为真实域名时，工作流自动将其加入部署产物，GitHub 随即绑定该域名（无需手动改仓库设置）。

> 为什么占位域名不直接绑定？GitHub 会校验自定义域名唯一性，`example.com` 已被保留占用，绑定会被 API 拒绝；且绑定一个未解析到你站点的域名会让默认 github.io 地址 301 跳转过去，导致占位期间站点不可访问。因此采用「占位不发布」策略。

## 3. 替换为真实域名（占位 → 正式）

把 `example.com` 换成你自己的域名（以 `mysite.com` 为例）共两处：

### 3.1 修改 CNAME 文件（唯一必需步骤）

```bash
echo "mysite.com" > site/CNAME
git add site/CNAME
git commit -m "chore: set custom domain to mysite.com"
git push origin main
```

推送后工作流自动重新部署并把 CNAME 加入产物，GitHub 随即绑定 `mysite.com`，仓库 Pages 设置中的 Custom domain 会同步显示。也可顺手用命令确认：

```bash
gh api repos/here-forever/Data-Universe/pages
```

### 3.2 配置 DNS 解析

到你的域名服务商（阿里云 / 腾讯云 / Cloudflare 等）的 DNS 管理页添加记录：

| 记录类型 | 主机记录 | 记录值 | 说明 |
|----------|----------|--------|------|
| `CNAME` | `www`（或你想要的子域，如 `data`） | `here-forever.github.io` | 推荐方式，子域名必须用 CNAME |
| `A` | `@`（仅当使用根域名时） | `185.199.108.153` | 根域名不能用 CNAME，需加 4 条 A 记录 |
| `A` | `@` | `185.199.109.153` | 同上 |
| `A` | `@` | `185.199.110.153` | 同上 |
| `A` | `@` | `185.199.111.153` | 同上 |

> 注意：
>
> - **子域名（推荐）**：加一条 `CNAME` 记录指向 `here-forever.github.io` 即可。
> - **根域名**：CNAME 不能用于根域名，需按上表配置 4 条 GitHub 官方 A 记录。
> - 若服务商开了 CDN/代理（如 Cloudflare 的橙色云朵），首次配置建议先关闭代理（灰色云朵），等 GitHub 证书签发后再开。
> - DNS 传播通常 5–30 分钟，最长 48 小时。可用 `nslookup mysite.com` 或 `dig mysite.com` 检查是否已指向 GitHub。

### 3.3 启用强制 HTTPS

1. 等待 DNS 生效且 GitHub 检测到域名后（Settings → Pages 会显示绿色对勾）
2. 勾选 **Enforce HTTPS**
3. GitHub 自动签发免费 Let's Encrypt 证书（几分钟内完成）

## 4. 验证

```bash
# 查看 Pages 配置与状态
gh api repos/here-forever/Data-Universe/pages

# 查看最近一次部署
gh run list --repo here-forever/Data-Universe --workflow deploy-pages.yml --limit 1

# 检查站点可访问性（占位域名阶段用默认地址）
curl -I https://here-forever.github.io/Data-Universe/
```

## 5. 常见问题

| 现象 | 排查 |
|------|------|
| Actions 显示失败 | 打开运行日志；首次部署若提示 Pages 未启用，到 Settings → Pages 确认 Source 为 GitHub Actions 后重跑工作流 |
| 自定义域名 404 | DNS 未生效或记录值写错；确认 CNAME 记录值是 `here-forever.github.io`（不带 `https://`、不带路径） |
| 证书错误 / 无法开启 HTTPS | 等待 DNS 传播；关闭域名服务商的代理后重试 |
| 页面样式/脚本未加载 | 确认访问路径带仓库名前缀 `/Data-Universe/`；站点内所有资源均使用相对路径，正常部署后不会有此问题 |
| 推送 main 后未触发部署 | 只有 `site/**` 或工作流文件变更才会触发；其余情况可手动 Run workflow |
