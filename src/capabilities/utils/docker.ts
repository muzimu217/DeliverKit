/**
 * Docker 可用性探测。
 *
 * 「Docker 不可用」有四种完全不同的处境：没装、守护进程没起、当前用户没权限、
 * 探测本身超时（Docker Desktop 冷启动）。把它们收敛成同一句话会让首次使用者
 * 按错误的方向排查，因此这里保留原因并给出各自的修复动作。
 */

import { commandExists, runCommand, logTail } from './command.js';

export type DockerUnavailableReason =
  | 'not_installed'
  | 'daemon_not_running'
  | 'permission_denied'
  | 'probe_timeout'
  | 'unknown';

export interface DockerUnavailable {
  available: false;
  reason: DockerUnavailableReason;
  summary: string;
  suggestedFix: string;
  nextActions: string[];
  detail?: string;
}

export type DockerProbe = { available: true; serverVersion?: string } | DockerUnavailable;

/** 允许测试与 e2e 直接注入 boolean。 */
export type DockerProbeFn = () => DockerProbe | boolean;

/** Docker Desktop 冷启动常超过 10 秒，过短的探测超时会产生假阴性。 */
const DOCKER_PROBE_TIMEOUT_MS = 30_000;

const CI_FALLBACK = '或改用 generate_ci_workflow，在 GitHub Actions 的 Linux runner 上完成构建';

export function probeDocker(): DockerProbe {
  if (!commandExists('docker')) {
    return {
      available: false,
      reason: 'not_installed',
      summary: 'PATH 中找不到 docker 命令；Linux 包的隔离构建与安装验证需要 Docker',
      suggestedFix: `安装 Docker（macOS/Windows 用 Docker Desktop，Ubuntu 用 apt-get install docker.io），${CI_FALLBACK}`,
      nextActions: ['安装 Docker 后重新执行本工具', '调用 generate_ci_workflow 走 CI 构建'],
    };
  }

  const info = runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], {
    timeout: DOCKER_PROBE_TIMEOUT_MS,
  });
  if (info.success) {
    return { available: true, serverVersion: info.stdout.trim() || undefined };
  }

  return classifyDockerFailure(`${info.stderr}\n${info.stdout}`, {
    timedOut: info.timedOut,
    exitCode: info.exitCode,
  });
}

/**
 * 把 docker info 的报错分类。独立成纯函数，才能对真实报错文案做回归测试
 * （守护进程未启动被误判成权限问题会让用户往完全错误的方向排查）。
 */
export function classifyDockerFailure(
  output: string,
  context: { timedOut?: boolean; exitCode?: number } = {}
): DockerUnavailable {
  const stderr = output.toLowerCase();
  const detail = logTail(output.trim(), 12, 800) || undefined;

  if (context.timedOut) {
    return {
      available: false,
      reason: 'probe_timeout',
      summary: `docker info 在 ${DOCKER_PROBE_TIMEOUT_MS / 1000} 秒内没有响应；守护进程可能正在启动`,
      suggestedFix: '等待 Docker 完成启动（Docker Desktop 冷启动较慢）后重试，或检查 DOCKER_HOST 是否指向可达的守护进程',
      nextActions: ['运行 docker info 确认守护进程已就绪，然后重新执行本工具'],
      detail,
    };
  }

  if (stderr.includes('permission denied') || stderr.includes('access is denied')) {
    return {
      available: false,
      reason: 'permission_denied',
      summary: '当前用户无权访问 Docker 守护进程 socket',
      suggestedFix: 'Linux 上执行 sudo usermod -aG docker "$USER" 后重新登录会话（或用 sudo 运行），不要给 socket 放宽全局权限',
      nextActions: ['把当前用户加入 docker 组并重新登录', '运行 docker info 确认可访问后重新执行本工具'],
      detail,
    };
  }

  // Docker Desktop 未启动时的实际文案是「failed to connect to the docker API at
  // unix://…: dial unix …: connect: no such file or directory」，不含 permission 字样，
  // 必须归到守护进程未启动，否则会把用户引向权限方向白折腾。
  if (
    stderr.includes('cannot connect to the docker daemon') ||
    stderr.includes('failed to connect to the docker api') ||
    stderr.includes('daemon is not running') ||
    stderr.includes('is the docker daemon running') ||
    stderr.includes('no such file or directory') ||
    stderr.includes('docker_host')
  ) {
    return {
      available: false,
      reason: 'daemon_not_running',
      summary: 'docker 命令存在，但连不上守护进程（未启动或 DOCKER_HOST 指向不可达地址）',
      suggestedFix: `启动 Docker 守护进程（Docker Desktop 或 sudo systemctl start docker），并确认 DOCKER_HOST 未指向失效地址，${CI_FALLBACK}`,
      nextActions: ['启动 Docker 后运行 docker info 验证，然后重新执行本工具'],
      detail,
    };
  }

  return {
    available: false,
    reason: 'unknown',
    summary: `docker info 执行失败（退出码 ${context.exitCode ?? 1}）`,
    suggestedFix: `按 detail_log 中的 docker 报错处理，${CI_FALLBACK}`,
    nextActions: ['手动运行 docker info 复现并修复该报错'],
    detail,
  };
}

/** 把注入的 boolean 归一成 DockerProbe，保持测试与 e2e 的调用方式不变。 */
export function normalizeDockerProbe(value: DockerProbe | boolean): DockerProbe {
  if (value === true) {
    return { available: true };
  }
  if (value === false) {
    return {
      available: false,
      reason: 'unknown',
      summary: 'Docker 不可用',
      suggestedFix: `安装并启动 Docker，${CI_FALLBACK}`,
      nextActions: ['安装并启动 Docker 后重新执行本工具'],
    };
  }
  return value;
}

/**
 * AppImage 只在 x86_64 下产出，Apple Silicon 等 arm64 主机必须靠 amd64 模拟。
 * 不前置提示的话，失败会发生在容器深处，外部只看到一句 build_failed。
 */
export function amd64EmulationWarning(arch: string = process.arch): string | null {
  if (arch === 'x64') {
    return null;
  }
  return `当前主机架构为 ${arch}，AppImage 构建强制使用 linux/amd64 镜像：需要 Docker 已启用 QEMU/Rosetta 模拟，否则容器内会以晦涩错误失败。可先运行 docker run --rm --platform linux/amd64 ubuntu:22.04 uname -m 自检。`;
}
