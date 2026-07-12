# 状态页自定义域名

Uptimer 支持为每个公共状态页绑定一个自定义域名。Cloudflare 负责 DNS、Pages 域名关联和 TLS 证书；Uptimer 只负责域名绑定和请求路由。

## 工作原理

1. 在 Cloudflare 控制台将域名关联到 Pages 项目。
2. 在 Uptimer 管理后台的状态页表单中填写该域名。
3. Uptimer 的 Pages 边缘 Worker 根据请求 `Host` 解析到对应状态页并提供页面隔离的内容。

Uptimer **不会**调用 Cloudflare API、存储 Cloudflare API Token、管理 DNS 记录或签发 TLS 证书。

## 前置条件

- 已部署的 Uptimer Pages 项目（`*.pages.dev` 域名是默认平台主机）。
- Pages 环境变量 `UPTIMER_DEFAULT_HOSTS` 需列出你的平台/默认主机名。部署工作流会自动推导 `*.pages.dev` 域名。若要添加已有的默认自定义域名，设置 `UPTIMER_DEFAULT_HOSTS_OVERRIDE`。

> 如果 `UPTIMER_DEFAULT_HOSTS` 未设置，自定义域名路由不启用，所有现有行为保持不变。

## 第 1 步 — 在 Cloudflare Pages 关联域名

在 Cloudflare 控制台 → Workers & Pages → 你的 Pages 项目 → Custom domains → Set up a custom domain。

- **子域名**（如 `status.example.com`）：如果 zone 不在 Cloudflare，需在你的 DNS 服务商添加 CNAME 记录，指向 `<你的项目>.pages.dev`。
- **Apex 域名**（如 `example.com`）：该域名必须是同一 Cloudflare 账号下的 zone。将 nameserver 指向 Cloudflare。

> 请勿在未于 Pages 控制台关联域名的情况下手动添加 CNAME 记录，否则域名将无法解析（HTTP 522）。

## 第 2 步 — 在 Uptimer 绑定域名

在管理后台 → 状态页 → 编辑某页 → 自定义域名字段，填写裸域名（如 `status.example.com`）。保存。

- 域名会规范化为小写、去除末尾点。
- 协议、路径、端口、通配符、IP 和 localhost 会被拒绝。
- 每个域名最多只能绑定到一个状态页。

## 第 3 步 — 验证

访问 `https://status.example.com/`。页面应渲染绑定的状态页。未知或未绑定的域名返回 `404` 且 `Cache-Control: no-store`。

`/status/:slug` 路由仍然可用，作为回退入口，不会被重定向。

## 绑定顺序、换绑与解绑

- **换绑**：将域名改为新值后，旧域名下一次请求即返回 `404`。
- **清空**：留空保存即可解绑。该域名下一次请求返回 `404`。
- **删除页面**：删除状态页会移除其域名绑定。

本版不缓存域名所有权，因此变更在下一次请求立即生效。

## 回滚

- **完全禁用自定义域名路由**：从 Pages 环境变量中移除 `UPTIMER_DEFAULT_HOSTS` 并重新部署。所有域名恢复为旧行为。
- **回滚单个绑定**：在管理后台清空该域名。
- 数据库列为可空新增列，回滚应用代码后该列无害。

## 故障排查

| 症状 | 原因 | 修复 |
|------|------|------|
| 自定义域名返回 404 | 域名未绑定、页面非公开或 `UPTIMER_DEFAULT_HOSTS` 配置错误 | 在管理后台检查绑定；确认页面公开；确保 `UPTIMER_DEFAULT_HOSTS` 包含 Pages 项目域名 |
| HTTP 522 | 域名未在 Cloudflare Pages 控制台关联 | 在 Workers & Pages → Custom domains 中关联域名后再添加 DNS |
| 证书未就绪 | Cloudflare TLS 签发中 | 等待；Uptimer 不报告证书状态 |
| 展示了错误页面 | 域名绑定到了错误的状态页 | 在管理后台编辑绑定 |
| 自定义域名无法访问管理后台 | 自定义域名上禁用了 Admin 路由 | 通过平台/默认域名访问管理后台 |

## 安全说明

- 仅信任请求 `Host` 头；`X-Forwarded-Host` 和查询参数被忽略。
- 自定义域名上不可访问 Admin 和 Internal API 路由。
- 自定义域名上冲突的 `/status/:other-slug` 路径返回 `404`。
- Uptimer 不为此功能请求或存储 Cloudflare API Token。
