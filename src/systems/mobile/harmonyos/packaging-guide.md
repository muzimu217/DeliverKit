# HarmonyOS（鸿蒙）打包指南

> ForgeKit 多端框架 · mobile/harmonyos
> 目标：让开发者用自然语言（"帮我把这个鸿蒙应用打包成可上架的 APP"）即可完成开发认知 → 签名 → 打包 → 上架全流程。

本指南覆盖四件事：
1. **如何开发一个鸿蒙应用**（工程结构认知）
2. **如何配置签名**（调试 / 发布）
3. **如何一键打包**（HAP / APP）
4. **如何上架 AppGallery**（完整流程，作为知识沉淀）

---

## 1. 如何开发一个鸿蒙应用

### 1.1 技术栈
- 语言：**ArkTS**（基于 TypeScript 扩展）
- 模型：**Stage 模型**（API 9+ 主推，NEXT 仅支持 Stage）
- 包管理：**ohpm**（OpenHarmony Package Manager）
- 构建：**hvigor**（类 Gradle 的构建引擎，`hvigorw` 脚本）

### 1.2 标准工程结构
```
my-harmony-app/
├── AppScope/                 # 应用级配置
│   └── app.json5             # bundleName / 版本 / apiVersion（应用级）
├── entry/                    # 入口模块（默认模块）
│   ├── src/main/
│   │   ├── ets/              # ArkTS 源码
│   │   │   ├── entryability/ # UIAbility 入口
│   │   │   └── pages/        # 页面
│   │   ├── resources/        # 资源（字符串/图片/布局）
│   │   └── module.json5      # 模块声明（abilities / permissions）
│   └── build-profile.json5   # 模块级构建与签名配置
├── oh-package.json5          # 工程依赖（ohpm）
├── build-profile.json5       # 应用级构建配置（products / signingConfigs）
├── hvigorfile.ts             # 应用级 hvigor 构建脚本
└── hvigorw / hvigorw.bat     # 构建入口
```

### 1.3 ForgeKit 识别依据
`inspect_project` / `generate_packaging_plan` 命中以下特征即判定为鸿蒙工程：
- 存在 `AppScope/app.json5`
- 存在 `build-profile.json5` 且含 `app` / `modules` 段
- 存在 `oh-package.json5`（ohpm 工程）

---

## 2. 如何配置签名

鸿蒙签名分两种：

### 2.1 调试签名（本地设备验证）
- DevEco Studio / 命令行工具可**自动生成**调试证书与 Profile。
- 仅能安装到**已注册**的调试设备（通过 `hdc` + AGC 设备注册）。
- 不可用于上架。

### 2.2 发布签名（上架必须）
材料清单（缺一不可）：
| 文件 | 来源 | 说明 |
|------|------|------|
| `.csr` | 本地 `keytool`/DevEco 生成 | 证书签名请求 |
| `.cer` | **AGC 签发** | 正式证书（绑定 bundleName） |
| `.p12` | 本地生成并**自行妥善保管** | 密钥库（丢失=无法更新应用） |
| `.p7b` | **AGC 签发** | 发布 Profile（绑定证书+应用+设备） |

`build-profile.json5` 的 `signingConfigs` 示例：
```json5
{
  "app": {
    "signingConfigs": [
      {
        "name": "release",
        "type": "HarmonyOS",
        "material": {
          "certpath": "release.cer",
          "storePassword": "***",
          "keyAlias": "release",
          "keyPassword": "***",
          "profile": "release.p7b",
          "signAlg": "SHA256withECDSA",
          "storeFile": "release.p12"
        }
      }
    ],
    "products": [
      { "name": "default", "signingConfig": "release", "compatibleSdkVersion": "12", "runtimeOS": "HarmonyOS" }
    ]
  }
}
```

> 切勿将 `.p12` 密码、`.cer` 写入源码或 Dockerfile；使用环境变量/本地密钥管理。

---

## 3. 如何一键打包

### 3.1 产物选择
- **HAP**（`hvigorw assembleHap`）：单模块包，调试/内部分发。
- **APP**（`hvigorw assembleApp`）：聚合多模块，**上架唯一接受形态**。

### 3.2 ForgeKit 一键流程
调用 `pack_harmonyos_app`（需先 `generate_packaging_plan` 生成 Forge.md）：
1. 校验工程结构
2. 校验工具链（node 18 / ohpm / hvigorw）
3. **合规预检**：bundleName 格式、API 版本合法、release 是否具备正式签名与 Profile
4. 执行构建（工具链存在时）
5. 失败则结构化诊断（签名/SDK/依赖/权限问题，含修复建议）
6. 成功则输出产物路径 + SHA256 + Release Manifest + **合规报告**

---

## 4. 如何上架 AppGallery（完整流程知识）

> 这是"下一步该怎么做"的关键知识，ForgeKit 会在打包后给出对应下一步提示。

| 步骤 | 动作 | 产物/系统 |
|------|------|-----------|
| 1 | 华为开发者**实名认证**（个人/企业） | AGC 账号 |
| 2 | AGC 创建应用，填写 bundleName、分类 | 应用记录 |
| 3 | 本地生成 CSR → 上传 AGC 签发正式 `.cer` | 证书 |
| 4 | 创建发布 `.p7b` Profile，绑定证书+应用 | Profile |
| 5 | 配置正式签名，构建 **release APP** | `*.app` |
| 6 | AGC 上传 `.app`，填写信息/截图/隐私政策/权限说明 | 提交包 |
| 7 | 提交**人工审核**，处理驳回 | 审核状态 |
| 8 | 审核通过 → 发布 / 分阶段发布 | 上架 |

### 4.1 上架合规基线
- 必须提供**隐私政策**链接
- 敏感权限（`ohos.permission.LOCATION`、`READ_CONTACTS` 等）需**说明用途并申请**
- 需完成**内容分级**与**年龄适配**
- 不得包含违规内容（参照华为应用市场审核指南）
- 包体必须**正式签名**，调试证书直接驳回

### 4.2 常见驳回与处理
| 驳回原因 | 处理 |
|----------|------|
| 隐私政策缺失/不可访问 | 补充可公开访问的隐私政策 URL |
| 权限过度申请 | 移除未使用权限或补充合理性说明 |
| 调试签名 | 改用 AGC 正式签名重新构建 |
| 截图不合规 | 按规范补充真实运行截图 |

详见 `issues/appgallery-listing.md` 与 `issues/signing-risks.md`。
