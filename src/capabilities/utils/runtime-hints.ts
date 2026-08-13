import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RuntimeHints {
  container_port?: number;
  healthcheck_path?: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  conflicts?: string[];
}

export function detectRuntimeHints(sourceDir: string): RuntimeHints | undefined {
  const ports = new Map<number, string[]>();
  const healthPaths = new Map<string, string[]>();
  const dockerfile = read(path.join(sourceDir, 'Dockerfile'));
  if (dockerfile) {
    for (const match of dockerfile.matchAll(/^\s*EXPOSE\s+(\d{1,5})(?:\/tcp)?\s*$/gim)) {
      add(ports, Number(match[1]), 'Dockerfile EXPOSE');
    }
    for (const match of dockerfile.matchAll(/HEALTHCHECK[^\n]*(?:curl|wget)[^\n]*?((?:\/)[a-zA-Z0-9_./-]+)/gim)) {
      add(healthPaths, normalizeHealthPath(match[1]), 'Dockerfile HEALTHCHECK');
    }
  }

  for (const file of ['app.py', 'main.py', 'server.py', 'index.js', 'server.js', 'app.js', 'src/index.ts', 'src/server.ts']) {
    const content = read(path.join(sourceDir, file));
    if (!content) {
      continue;
    }
    for (const pattern of [
      /\.listen\(\s*(\d{2,5})\b/g,
      /\bport\s*=\s*(\d{2,5})\b/gi,
      /\bPORT\s*\|\|\s*(\d{2,5})\b/g,
    ]) {
      for (const match of content.matchAll(pattern)) {
        add(ports, Number(match[1]), file);
      }
    }
    for (const match of content.matchAll(/(?:route|get|health)[(\s]*["'](\/health(?:z|check)?)["']/gi)) {
      add(healthPaths, normalizeHealthPath(match[1]), file);
    }
  }

  const validPorts = [...ports.keys()].filter((port) => port >= 1 && port <= 65535);
  const paths = [...healthPaths.keys()];
  if (validPorts.length === 0 && paths.length === 0) {
    return undefined;
  }

  const conflicts: string[] = [];
  if (validPorts.length > 1) {
    conflicts.push(`检测到多个端口：${validPorts.join(', ')}`);
  }
  if (paths.length > 1) {
    conflicts.push(`检测到多个健康路径：${paths.join(', ')}`);
  }
  const port = validPorts.length === 1 ? validPorts[0] : undefined;
  const healthPath = paths.length === 1 && port ? paths[0] : undefined;
  const evidence = [
    ...(port ? (ports.get(port) ?? []).map((source) => `${source} → port ${port}`) : []),
    ...(healthPath ? (healthPaths.get(healthPath) ?? []).map((source) => `${source} → ${healthPath}`) : []),
  ];
  return {
    container_port: port,
    healthcheck_path: healthPath,
    confidence: conflicts.length > 0 ? 'low' : dockerfile && port ? 'high' : 'medium',
    evidence,
    conflicts: conflicts.length ? conflicts : undefined,
  };
}

function read(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && stat.size <= 1024 * 1024 ? fs.readFileSync(file, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

function add<T>(target: Map<T, string[]>, key: T, evidence: string): void {
  target.set(key, [...(target.get(key) ?? []), evidence]);
}

function normalizeHealthPath(value: string): string {
  return `/${value.replace(/^\/+/, '').replace(/[),;]+$/, '')}`;
}
