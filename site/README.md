# DeliverKit 站点

DeliverKit 的产品转化页：把访问者转化为 MCP 安装与首个成功交付，而不是泛百科。它是独立的静态站点，不依赖 Node 服务端，可直接部署到 GitHub Pages、Cloudflare Pages 或任意静态托管。

## 本地预览

```bash
npx serve site
```

浏览器打开命令输出的本地地址即可。直接双击 `index.html` 也能查看静态布局，但模块脚本和外部图标在某些浏览器的 `file://` 模式下会受限制。

## 信息架构

首屏与主 CTA 是「安装 MCP（`npx -y deliverkit-mcp`）」与「10 分钟跑通第一个 Linux 包」；生态知识卡片与平台前置指南是次级入口，服务于安装之后的用户。站点上的所有命令与 npm 包 `deliverkit-mcp` 保持一致：MCP 直接 `npx -y deliverkit-mcp`，CLI 用 `npx -y --package=deliverkit-mcp -- deliverkit …`。

## 内容边界

- 站点不收集任何用户数据：没有邮箱表单、没有统计脚本、没有 cookie。转化入口只有 npm 安装命令、GitHub 仓库与 Discussions。
- 站点只公开申请入口、操作步骤和验证方法，不包含任何账号、证书、私钥或 secret 值。
- 生态卡片与指南链接指向 GitHub 仓库中的知识包（blob URL），不依赖 Pages 部署结构中的相对路径。后续可由构建脚本从 YAML 自动生成，避免站点内容和 MCP 输出分叉。
