# 安全策略

## 报告漏洞

请不要通过公开 issue 报告安全问题。使用 GitHub 的私密漏洞报告通道：

- [Security Advisories](https://github.com/muzimu217/DeliverKit/security/advisories/new)

请在报告中说明影响范围、复现步骤，以及你认为的严重程度。收到后会尽快确认并回复处理计划。

## 本项目的安全边界

DeliverKit 会执行构建命令并处理签名材料，因此以下边界是刻意设计的，也是评估漏洞时的判据：

- **不接触私钥内容**：Windows Authenticode、Apple 证书、鸿蒙 AGC 材料一律通过 CI secrets 或本机钥匙串注入，DeliverKit 只校验其是否存在与可用，不读取、不打印、不上传密钥内容。生成的 CI 工作流中，证书只以 secret 引用出现。
- **不发送遥测**：代码里没有任何统计、上报或外呼逻辑。构建日志只写本地文件。
- **构建在隔离容器内进行**：Linux 目标的构建与验证都在容器里完成，源码以只读方式挂载。
- **路径校验**：所有工具的 `source_dir` / `plan_path` 都经过越界校验（见 `src/capabilities/utils/filesystem.ts`），拒绝跳出项目目录的路径。
- **日志可能包含构建输出**：失败结果里的 `log_excerpt` 取自构建日志尾部。如果你的构建过程会把机密打印到 stdout，这些内容会出现在日志文件与错误摘要中——这属于构建脚本自身的问题，但报告相关设计缺陷同样欢迎。

## 依赖

依赖版本在 `package.json` 中以 caret 范围声明，`package-lock.json` 锁定实际版本。发现依赖链上的漏洞同样欢迎通过上述通道反馈。
