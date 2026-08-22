# awesome-mcp-servers 提交材料

> 目标仓库：https://github.com/punkpeye/awesome-mcp-servers（80k+ star，MCP 项目冷启动第一站）
> 前置：gates.md 全部通过（列表要求 server 可安装，npm 包必须真实存在）。
> 规则来源：其 [CONTRIBUTING.md](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md) —— PR 修改 README，条目格式与现有条目保持一致，插入对应主题章节的**字母序**位置。

## 提交条目（成稿，按章节实际拼写核对后使用）

```
- [DeliverKit](https://github.com/muzimu217/DeliverKit) — An AI delivery brain: turns packaging, signing, and notarization knowledge for Linux (deb/rpm/AppImage), Windows (MSI), macOS, and HarmonyOS into plans agents can execute and verify.
```

## 操作步骤

```bash
# 1. fork punkpeye/awesome-mcp-servers 到 muzimu217 账号（gh 一键）
gh repo fork punkpeye/awesome-mcp-servers --clone=false

# 2. 在 fork 的 README 中找到与 packaging / deployment / devops 最相关的章节
#    （章节名以当前 README 为准，提交前务必核对，别凭记忆写）
# 3. 将上面条目按字母序插入（DeliverKit 以 D 开头，通常落在章节前部）
# 4. 提交 PR，标题格式参考其历史 PR：
#    "Add DeliverKit"
# 5. PR 描述写三行：是什么 / 为什么符合收录标准（MIT、npm 可装、CI 绿、README 完整）/ 自验步骤
```

## PR 描述模板

```
Adds DeliverKit — an MCP server that plans and verifies multi-ecosystem packaging (Linux deb/rpm/AppImage verified e2e; Windows/macOS/HarmonyOS contract-first).

- Install: npx -y deliverkit-mcp (npm, MIT)
- README includes install config, capability list, and honest status per ecosystem
- CI green: https://github.com/muzimu217/DeliverKit/actions

Happy to adjust the description/section if maintainers prefer a different fit.
```

## 注意

- 描述一句话内说清「独特性」（跨生态 + 验证证据），不堆关键词。
- 被合并后，把链接回填到 matrix.md 渠道 3 状态列。
- 若维护者要求缩短描述，备选精简版：
  `— Plans and verifies multi-ecosystem packaging (Linux/Windows/macOS/HarmonyOS) for AI agents.`
