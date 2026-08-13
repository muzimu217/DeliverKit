/**
 * M3: generate_packaging_plan 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-plan-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeProject(name: string): string {
  const dir = path.join(tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('M3: generate_packaging_plan', () => {
  it('为 Python 项目生成 Forge.md（Docker 目标）', async () => {
    const dir = makeProject('python-docker');
    fs.writeFileSync(path.join(dir, 'app.py'), 'from flask import Flask');
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==2.3.0\n');

    const result = await generatePackagingPlan(dir, ['Docker']);

    expect(result.status).toBe('success');
    expect(result.plan_path).toBe(path.join(dir, 'Forge.md'));
    expect(result.plan_path).toBeTruthy();

    // 验证文件已写入
    expect(fs.existsSync(result.plan_path!)).toBe(true);

    // 验证内容
    const content = fs.readFileSync(result.plan_path!, 'utf-8');
    expect(content).toContain('# ForgeKit Packaging Plan');
    expect(content).toContain('Python');
    expect(content).toContain('app.py');
    expect(content).toContain('## Decisions');
    expect(content).toContain('Why Docker');
  });

  it('决策依据包含 Ubuntu 版本和兼容性信息', async () => {
    const dir = makeProject('python-version');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['Docker'], 'ubuntu-22.04');

    expect(result.status).toBe('success');
    expect(result.decision_basis?.target_version).toContain('22.04');
    // decision-rules.yaml 存在时应有兼容性说明
    if (result.decision_basis?.compatibility_notes?.length) {
      expect(result.decision_basis.compatibility_notes.some((n) => n.includes('glibc'))).toBe(true);
    }
  });

  it('根据项目语言写入对应基础镜像', async () => {
    const dir = makeProject('typescript-image');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'typescript-image', scripts: { start: 'node index.js' } })
    );
    fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("ready")');

    const result = await generatePackagingPlan(dir, ['Docker']);

    expect(result.status).toBe('success');
    expect(result.decision_basis?.base_image).toBe('node:18-alpine');
    expect(fs.readFileSync(result.plan_path!, 'utf-8')).toContain('Base image: node:18-alpine');
  });

  it('Docker + deb 双目标时生成对应决策', async () => {
    const dir = makeProject('python-deb');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['Docker', 'deb']);

    expect(result.status).toBe('success');
    const content = fs.readFileSync(result.plan_path!, 'utf-8');
    expect(content).toContain('Why deb');
  });

  it('目标环境 20.04 → 选择 Ubuntu 20.04', async () => {
    const dir = makeProject('python-2004');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['Docker'], 'ubuntu-20.04');

    expect(result.decision_basis?.target_version).toContain('20.04');
  });

  it('未支持的目标环境不会静默回退到 Ubuntu', async () => {
    const dir = makeProject('unsupported-target');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['Docker'], 'centos-9');

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(result.error?.summary).toContain('centos-9');
    expect(fs.existsSync(path.join(dir, 'Forge.md'))).toBe(false);
  });

  it('Risks 段包含风险提示', async () => {
    const dir = makeProject('python-risks');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    await generatePackagingPlan(dir, ['Docker']);

    const content = fs.readFileSync(path.join(dir, 'Forge.md'), 'utf-8');
    expect(content).toContain('## Risks');
    expect(content).toContain('glibc');
  });

  it('Next Actions 包含 build_docker_image 提示', async () => {
    const dir = makeProject('python-next');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['Docker']);

    expect(result.next_actions?.some((a) => a.includes('build_docker_image'))).toBe(true);
  });

  it('源目录不存在时返回错误', async () => {
    const result = await generatePackagingPlan('/nonexistent/xyz', ['Docker']);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('path_not_found');
  });
});
