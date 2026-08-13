# Ubuntu 系统打包指南

> 适用版本：Ubuntu 20.04 / 22.04 / 24.04（LTS）
> 包格式：`.deb`（Debian Package）
> 目标读者：需要为 Ubuntu 系统打包 Python/Go/TS 项目的开发者

---

## 1. Ubuntu deb 包基础知识

### 1.1 deb 包结构

```
package_1.0.0_amd64.deb  # 最终产物
├── debian-binary        # 版本标识（2.0）
├── control.tar.gz       # 控制信息
│   ├── control          # 包元数据（名称、版本、依赖）
│   ├── md5sums          # 文件校验和
│   ├── conffiles        # 配置文件列表
│   ├── preinst          # 安装前脚本
│   ├── postinst         # 安装后脚本
│   ├── prerm            # 占除前脚本
│   ├── postrm           # 占除后脚本
├── data.tar.gz          # 实际文件
│   ├── usr/
│   │   ├── bin/         # 可执行文件
│   │   ├── lib/         # 库文件
│   │   ├── share/       # 文档、配置
│   ├── etc/             # 配置文件
│   ├── var/             # 数据文件
```

### 1.2 包命名规范

```
package-name_version_architecture.deb

示例：
- myapp_1.0.0_amd64.deb      # x86_64 架构
- myapp_1.0.0_arm64.deb      # aarch64 架构
- myapp_1.0.0_all.deb        # 架构无关（如 Python 纯代码）
```

---

## 2. 打包流程（Python 项目示例）

### 2.1 准备源码目录结构

```
myapp-1.0.0/
├── debian/                # 打包配置目录
│   ├── control            # 包元数据（必须）
│   ├── rules              # 构建规则（必须）
│   ├── changelog          # 变更日志（必须）
│   ├── compat             # debhelper 版本（必须）
│   ├── postinst           # 安装后脚本（可选）
│   ├── postrm             # 占除后脚本（可选）
│   ├── install            # 文件安装路径（可选）
│   ├── dirs               # 额外目录（可选）
├── setup.py               # Python 安装配置
├── myapp/                 # 源码
│   ├── __init__.py
│   ├── main.py
│   ├── utils.py
├── requirements.txt       # Python 依赖
├── README.md
└── LICENSE
```

### 2.2 编写 debian/control 文件

```
Source: myapp
Section: python
Priority: optional
Maintainer: Your Name <your.email@example.com>
Build-Depends: debhelper (>= 13), python3, python3-setuptools
Standards-Version: 4.5.1

Package: myapp
Architecture: all
Depends: python3 (>= 3.8), python3-pip
Recommends: python3-requests
Suggests: python3-numpy
Installed-Size: 1024
Description: My Application - A brief description
 A longer description that can span multiple lines.
 This package provides a Python application for...
```

**字段说明**：
- `Source`: 源包名称
- `Section`: 分类（python/admin/net/utils 等）
- `Priority`: 优先级（required/standard/optional/extra）
- `Maintainer`: 维护者信息
- `Build-Depends`: 构建时依赖
- `Architecture`: 架构（all/amd64/arm64）
- `Depends`: 运行时必须依赖
- `Recommends`: 推荐依赖
- `Suggests`: 建议依赖
- `Description`: 包描述（短描述 + 长描述）

### 2.3 编写 debian/rules 文件

```makefile
#!/usr/bin/make -f

%:
	dh $@ --with python3 --buildsystem=pybuild

override_dh_auto_clean:
	python3 setup.py clean --all

override_dh_auto_build:
	python3 setup.py build

override_dh_auto_install:
	python3 setup.py install --root=$(CURDIR)/debian/myapp --install-layout=deb

override_dh_python3:
	dh_python3 --depends=python3
```

### 2.4 编写 debian/changelog 文件

```
myapp (1.0.0-1) unstable; urgency=medium

  * Initial release.
  * Added core functionality.
  * Fixed bug #123.

 -- Your Name <your.email@example.com>  Sat, 04 Jul 2026 10:00:00 +0800
```

### 2.5 编写 debian/compat 文件

```
13
```

（表示使用 debhelper 版本 13）

---

## 3. 使用 Docker 构建环境打包

### 3.1 使用现成模板（推荐）

```bash
# 1. 进入项目目录
cd myapp-1.0.0

# 2. 使用 ForgeKit 提供的 Dockerfile 构建
docker build -t myapp-builder:ubuntu-22.04 \
  -f /path/to/forgekit/src/systems/ubuntu/templates/Dockerfile.ubuntu-22.04 .

# 3. 在容器中打包
docker run -v $(pwd):/build myapp-builder:ubuntu-22.04

# 4. 产物输出到 dist/
ls dist/myapp_1.0.0_all.deb
```

### 3.2 手动构建流程

```bash
# 1. 安装打包工具
apt-get update
apt-get install -y build-essential devscripts debhelper dh-python python3 python3-setuptools

# 2. 进入源码目录
cd myapp-1.0.0

# 3. 构建源包
dpkg-buildpackage -S -us -uc

# 4. 构建二进制包
dpkg-buildpackage -b -us -uc

# 5. 验证包
lintian ../myapp_1.0.0_all.deb

# 6. 测试安装
dpkg -i ../myapp_1.0.0_all.deb
```

---

## 4. 不同 Ubuntu 版本的适配

### 4.1 版本差异对照

| 版本 | glibc | Python | systemd | 注意事项 |
|------|-------|--------|---------|----------|
| 20.04 | 2.31 | 3.8 | v245 | 使用 glibc 2.31 构建，确保兼容性 |
| 22.04 | 2.35 | 3.10 | v249 | 推荐 LTS，glibc 兼容性较好 |
| 24.04 | 2.39 | 3.12 | v255 | 最新 LTS，建议等待稳定期 |

### 4.2 多版本构建策略

**策略 1：最低版本优先**
```bash
# 在 Ubuntu 20.04 构建（glibc 2.31）
# 产物可在 20.04/22.04/24.04 运行（向下兼容）
docker run -v $(pwd):/build ubuntu:20.04
```

**策略 2：多版本构建**
```bash
# 构建三个版本
for ver in 20.04 22.04 24.04; do
  docker run -v $(pwd):/build ubuntu:$ver \
    -e TARGET_VERSION=$ver
done

# 产物命名区分版本
ls dist/
# myapp_1.0.0_ubuntu-20.04_all.deb
# myapp_1.0.0_ubuntu-22.04_all.deb
# myapp_1.0.0_ubuntu-24.04_all.deb
```

**策略 3：静态链接（跨版本兼容）**
```bash
# 使用静态链接，不受 glibc 版本影响
# 适用于 Go/Rust/C 项目
CGO_ENABLED=0 go build -o myapp
```

---

## 5. 依赖处理

### 5.1 Python 项目依赖

```bash
# 在 debian/control 中声明
Depends: python3 (>= 3.8), python3-pip
Recommends: python3-requests, python3-click

# 在 requirements.txt 中声明
requests>=2.28.0
click>=8.0.0
numpy>=1.22.0
```

**注意事项**：
- Python 标准库包（如 `python3-requests`）在 Ubuntu 仓库中已有
- 非标准库包需要通过 pip 安装，在 postinst 中添加：
  ```bash
  # debian/postinst
  pip3 install -r /usr/share/myapp/requirements.txt
  ```

### 5.2 Go 项目依赖

```bash
# 静态链接，无外部依赖
# debian/control
Architecture: amd64
Depends: libc6 (>= 2.31)  # 仅需基础 C 库

# 或动态链接
Depends: libc6 (>= 2.31), libssl1.1
```

### 5.3 Node.js 项目依赖

```bash
# debian/control
Depends: nodejs (>= 12), npm

# 在 postinst 中安装依赖
# debian/postinst
cd /usr/share/myapp
npm install --production
```

---

## 6. 服务管理（systemd）

### 6.1 创建 systemd service 文件

```ini
# debian/myapp.service
[Unit]
Description=My Application Service
After=network.target

[Service]
Type=simple
User=myapp
Group=myapp
ExecStart=/usr/bin/myapp --config /etc/myapp/config.yaml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

### 6.2 在 debian/install 中声明安装路径

```
usr/bin/myapp
usr/share/myapp/*
etc/myapp/config.yaml
lib/systemd/system/myapp.service
```

### 6.3 在 postinst 中启用服务

```bash
# debian/postinst
#!/bin/bash
set -e

# 创建用户
if ! id myapp &>/dev/null; then
  useradd -r -s /bin/false myapp
fi

# 启用服务
systemctl daemon-reload
systemctl enable myapp
systemctl start myapp
```

---

## 7. 配置文件处理

### 7.1 在 debian/conffiles 中声明配置文件

```
/etc/myapp/config.yaml
/etc/myapp/settings.ini
```

**效果**：用户修改配置文件后，升级包时不会被覆盖

### 7.2 配置文件模板

```yaml
# templates/config.yaml.template
# My Application Configuration

server:
  host: 0.0.0.0
  port: 8080

database:
  host: localhost
  port: 5432
  name: myapp

logging:
  level: info
  file: /var/log/myapp/app.log
```

---

## 8. 常见问题与解决方案

### 8.1 glibc 版本不兼容

**问题**：在 Ubuntu 22.04 构建的包，在 Ubuntu 20.04 上报错：
```
version 'GLIBC_2.35' not found
```

**解决方案**：
1. 在目标系统最低版本构建（Ubuntu 20.04）
2. 使用静态链接（Go/Rust）
3. 使用容器化部署（Docker）绕过 glibc 依赖

### 8.2 Python 版本不匹配

**问题**：依赖 `python3 (>= 3.10)`，但 Ubuntu 20.04 只有 Python 3.8

**解决方案**：
```bash
# 使用最低 Python 版本声明
Depends: python3 (>= 3.8)

# 或在 postinst 中安装指定版本
apt-get install -y python3.10
```

### 8.3 架构不匹配

**问题**：在 x86_64 构建的包，无法在 aarch64 上安装

**解决方案**：
```bash
# 在 Docker 中指定架构
docker buildx build --platform linux/arm64 -t myapp:arm64 .

# 或使用 QEMU 模拟
docker run --platform linux/arm64 -v $(pwd):/build ubuntu:22.04
```

### 8.4 依赖包不存在

**问题**：依赖 `python3-mylib`，但 Ubuntu 仓库中不存在

**解决方案**：
1. 在 postinst 中使用 pip 安装：
   ```bash
   pip3 install mylib
   ```
2. 将依赖打包进 deb（不推荐，包体积变大）
3. 使用虚拟环境（推荐）：
   ```bash
   python3 -m venv /usr/share/myapp/venv
   /usr/share/myapp/venv/bin/pip install mylib
   ```

---

## 9. 最佳实践

### 9.1 打包前检查清单

- [ ] debian/control 字段完整（Source/Package/Maintainer/Depends/Description）
- [ ] debian/rules 构建流程正确
- [ ] debian/changelog 版本号符合规范
- [ ] debian/compat 设置为 13
- [ ] 测试在目标版本安装：`dpkg -i package.deb`
- [ ] 测试服务启动：`systemctl start myapp`
- [ ] 测试升级：`dpkg -i package_2.0.0.deb`
- [ ] 测试卸载：`dpkg --purge myapp`

### 9.2 包质量检查

```bash
# 使用 lintian 检查
lintian package.deb

# 检查包内容
dpkg -c package.deb

# 检查包信息
dpkg -I package.deb

# 检查文件校验和
dpkg --verify myapp
```

### 9.3 版本号规范

```
版本号格式：major.minor.patch-revision

示例：
- 1.0.0-1     # 首次发布
- 1.0.0-2     # 修复 bug，不改变功能
- 1.0.1-1     # 小版本更新
- 1.1.0-1     # 功能更新
- 2.0.0-1     # 大版本更新
```

---

## 10. 参考模板文件

ForgeKit 提供以下模板（见 `templates/` 目录）：

| 模板文件 | 用途 | 使用方式 |
|---------|------|----------|
| Dockerfile.ubuntu-20.04 | Ubuntu 20.04 构建环境 | `docker build -f Dockerfile.ubuntu-20.04 .` |
| Dockerfile.ubuntu-22.04 | Ubuntu 22.04 构建环境 | `docker build -f Dockerfile.ubuntu-22.04 .` |
| Dockerfile.ubuntu-24.04 | Ubuntu 24.04 构建环境 | `docker build -f Dockerfile.ubuntu-24.04 .` |
| control.template | debian/control 模板 | 复制并修改字段 |
| rules.template | debian/rules 模板 | 复制并修改构建逻辑 |
| changelog.template | debian/changelog 模板 | 复制并修改版本信息 |
| postinst.template | 安装后脚本模板 | 复制并修改服务启动逻辑 |
| service.template | systemd service 模板 | 复制并修改服务配置 |

---

## 11. 快速开始示例

### Python 项目打包完整流程

```bash
# 1. 创建项目目录结构
mkdir -p myapp-1.0.0/debian
cd myapp-1.0.0

# 2. 复制模板文件
cp /path/to/forgekit/src/systems/ubuntu/templates/control.template debian/control
cp /path/to/forgekit/src/systems/ubuntu/templates/rules.template debian/rules
cp /path/to/forgekit/src/systems/ubuntu/templates/changelog.template debian/changelog
echo "13" > debian/compat

# 3. 修改 control（根据项目调整）
sed -i 's/myapp/myapp-name/g' debian/control
sed -i 's/1.0.0/1.0.0/g' debian/control

# 4. 使用 Docker 构建
docker build -t myapp-builder \
  -f /path/to/forgekit/src/systems/ubuntu/templates/Dockerfile.ubuntu-22.04 .
docker run -v $(pwd):/build myapp-builder

# 5. 验证产物
ls dist/*.deb
lintian dist/*.deb
dpkg -c dist/*.deb

# 6. 测试安装（在测试机器上）
dpkg -i myapp_1.0.0_all.deb
systemctl start myapp
systemctl status myapp
```

---

*本指南由 ForgeKit 提供，基于 Ubuntu 官方打包规范和实战经验总结。*