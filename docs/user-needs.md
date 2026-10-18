# 用户需求 → 能力映射（2026-10-18）

> 证据来源：fpm / nfpm / goreleaser 三个同类工具的 open issue 高赞扫描（2026-10-18，GitHub API 按 reactions 排序），
> 加上本仓库漏斗数据（周安装 ~38、外部回流 0）。这是「找用户需求 → 实现用户需要」的第一份基线，
> 后续每次迭代前对照更新；有真实用户反馈后以反馈为准。

| # | 需求 | 证据 | 强度 | DeliverKit 现状 | 动作 |
|---|---|---|---|---|---|
| 1 | **systemd 服务安装**：deb/rpm 装完即可开机自启、随包升级重启 | fpm「Missing --rpm-systemd flag?」（+12 赞 / 16 评论，长期 open）| 高 | **10-18 起 deb 支持**：`pack_deb` 新增 `systemd` 参数——安装 unit 文件（`lib/systemd/system/<name>.service`）与维护脚本（postinst 在真实主机 `enable --now`，容器等无 systemd 环境降级为提示），验证阶段增加 `systemd-analyze verify` 语法校验 | ✅ 本次落地 deb；rpm 对称支持入 backlog P1 |
| 2 | **一键安装脚本**（`curl -sL url \| sh`） | goreleaser「Integrating godownloader into goreleaser」；fpm「Publish official Docker image?」（+10） | 高 | 无 | backlog P1：`generate-install-script` 能力（检测平台→选产物→生成安装脚本） |
| 3 | **apt/yum 仓库托管**：最终用户"加个源就能装+自动更新"，维护者发布即生效 | nfpm「Generate .changes files for debian packages」（+5，repo 元数据的组成部分） | 高 | 无 | backlog P1：`repo init/publish` 场景设计与骨架——**受众比"多生态编排"大一个量级的重定位机会** |
| 4 | 更多格式覆盖（Flatpak +14 / Alpine APKBUILD / xbps） | fpm「Feature Request: Flatpak support」#1149 等 | 中 | 无；且 Win/mac/鸿蒙四生态承诺尚未兑齐 | 不跟随（铁律：门槛达标前不铺开） |
| 5 | **首次成功体验**：安装→出包 ≤10 分钟、失败可自救 | 本仓库漏斗：周安装 ~38、外部回流 0——用户装了但没走到成功或没回来 | 高 | `doctor`、失败三件套（log_excerpt/suggested_fix/next_actions）、超时细分已做；TTFS 未实测 | 持续：等首个真实用户反馈校准；每次迭代不得引入新的激活摩擦 |

## 结论

1. **最有共识的痛点是「装完能用」**：systemd 服务安装（#1）是一次性、可验证、且正好复用 DeliverKit 验证闭环的能力——本次已落地 deb 侧。
2. **最大的增长机会是 #3（仓库托管）**：把 DeliverKit 从"打一个包"升级为"持续分发渠道"，这是同类工具都没有做好的空白区，建议作为下一个大方向评估。
3. **#2 依赖 #3**：一键安装脚本的最佳落点是"脚本默认从你的 repo 拉取"，做 #3 时一并设计。
4. **数据纪律**：npm 统计 10-14~10-17 曾滞后归零（对照 express/typescript 证实），周报引用下载趋势时须先做同窗口对照。
