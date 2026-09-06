// AUTO-GENERATED from src/knowledge/ecosystems/*.yaml by scripts/generate-site-content.mjs — do not edit.
// 事实字段（status/artifact/tags/link）派生自知识包；展示字段见脚本内映射表。
export const ecosystems = [
  {
    "family": "linux",
    "icon": "package",
    "accent": "mint",
    "status": "VERIFIED / LOCAL + CI",
    "name": "Ubuntu / Debian",
    "artifact": "deb",
    "summary": "系统级安装包，适合 Ubuntu LTS 与 systemd 服务。",
    "tags": [
      "dpkg-deb",
      "dpkg-dev",
      "lintian（质量检查）"
    ],
    "link": "https://github.com/muzimu217/DeliverKit/blob/main/src/knowledge/ecosystems/linux-ubuntu.yaml",
    "source": {
      "id": "linux/ubuntu",
      "status": "verified",
      "updated_at": "2026-08-13"
    }
  },
  {
    "family": "linux",
    "icon": "boxes",
    "accent": "mint",
    "status": "EXPERIMENTAL / MATRIX",
    "name": "RPM Linux",
    "artifact": "rpm",
    "summary": "面向 Rocky、RHEL、Fedora 的系统级交付。",
    "tags": [
      "docker",
      "rpmbuild",
      "rpm"
    ],
    "link": "https://github.com/muzimu217/DeliverKit/blob/main/src/knowledge/ecosystems/linux-rpm.yaml",
    "source": {
      "id": "linux/rpm",
      "status": "experimental",
      "updated_at": "2026-08-15"
    }
  },
  {
    "family": "linux",
    "icon": "file-box",
    "accent": "mint",
    "status": "EXPERIMENTAL / MATRIX",
    "name": "Linux AppImage",
    "artifact": "AppImage",
    "summary": "把运行时和应用封装成单文件，适合便携分发。",
    "tags": [
      "docker",
      "appimage-builder",
      "Ubuntu x86_64 runtime"
    ],
    "link": "https://github.com/muzimu217/DeliverKit/blob/main/src/knowledge/ecosystems/linux-appimage.yaml",
    "source": {
      "id": "linux/appimage",
      "status": "experimental",
      "updated_at": "2026-08-15"
    }
  },
  {
    "family": "desktop",
    "icon": "monitor-down",
    "accent": "blue",
    "status": "CI / USER CERTIFICATE",
    "name": "Windows MSI",
    "artifact": "msi",
    "summary": "WiX 构建、Authenticode 签名，再做静默安装/卸载验证。",
    "tags": [
      "GitHub Actions windows-latest",
      "WiX Toolset v4",
      "signtool"
    ],
    "link": "https://github.com/muzimu217/DeliverKit/blob/main/src/knowledge/ecosystems/windows.yaml",
    "source": {
      "id": "desktop/windows",
      "status": "experimental",
      "updated_at": "2026-08-15"
    }
  },
  {
    "family": "desktop",
    "icon": "apple",
    "accent": "coral",
    "status": "CI / APPLE ACCOUNT",
    "name": "macOS DMG / PKG",
    "artifact": "dmg · pkg",
    "summary": "codesign、notarytool、公证票据与 Gatekeeper 验证。",
    "tags": [
      "macos runner",
      "Xcode Command Line Tools",
      "codesign"
    ],
    "link": "https://github.com/muzimu217/DeliverKit/blob/main/src/knowledge/ecosystems/macos.yaml",
    "source": {
      "id": "desktop/macos",
      "status": "experimental",
      "updated_at": "2026-08-16"
    }
  },
  {
    "family": "mobile",
    "icon": "smartphone",
    "accent": "gold",
    "status": "DEVECO / AGC ACCOUNT",
    "name": "HarmonyOS HAP / APP",
    "artifact": "hap · app",
    "summary": "DevEco 构建，AGC 正式签名，并通过 hdc 设备验证。",
    "tags": [
      "node >= 18",
      "DevEco Studio / Command Line Tools",
      "ohpm"
    ],
    "link": "https://github.com/muzimu217/DeliverKit/blob/main/src/knowledge/ecosystems/harmonyos.yaml",
    "source": {
      "id": "mobile/harmonyos",
      "status": "experimental",
      "updated_at": "2026-08-13"
    }
  }
];
