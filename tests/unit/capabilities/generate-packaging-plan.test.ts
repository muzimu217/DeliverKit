/**
 * generate_packaging_plan 单元测试（知识包驱动、多目标）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-plan-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeProject(name: string): string {
  const dir = path.join(tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('generate_packaging_plan（知识包驱动）', () => {
  it('为 Python 项目生成 deb 交付计划（Forge.md）', async () => {
    const dir = makeProject('python-deb');
    fs.writeFileSync(path.join(dir, 'app.py'), 'from flask import Flask');
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==2.3.0\n');

    const result = await generatePackagingPlan(dir, ['deb']);

    expect(result.status).toBe('success');
    expect(result.plan_path).toBe(path.join(dir, 'Forge.md'));
    expect(fs.existsSync(result.plan_path!)).toBe(true);

    const content = fs.readFileSync(result.plan_path!, 'utf-8');
    expect(content).toContain('# DeliverKit Delivery Plan');
    expect(content).toContain('## Delivery Targets');
    expect(content).toContain('linux/ubuntu');
    expect(content).toContain('deb');
    expect(content).toContain('## Risks');
  });

  it('delivery_targets 摘要包含生态/产物/签名信息', async () => {
    const dir = makeProject('python-summary');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['deb']);

    expect(result.delivery_targets).toHaveLength(1);
    expect(result.delivery_targets![0].ecosystem).toBe('linux/ubuntu');
    expect(result.delivery_targets![0].artifacts).toContain('deb');
    expect(result.delivery_targets![0].signing_required).toBe(false);
    expect(result.delivery_targets![0].store).toBeNull();
  });

  it('鸿蒙工程自动推断 harmonyos 并写入上架/签名规则', async () => {
    const dir = makeProject('harmony-auto');
    fs.mkdirSync(path.join(dir, 'AppScope'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'AppScope', 'app.json5'), '{}');
    fs.writeFileSync(path.join(dir, 'build-profile.json5'), '{}');

    const result = await generatePackagingPlan(dir, []);

    expect(result.status).toBe('success');
    expect(result.delivery_targets![0].ecosystem).toBe('mobile/harmonyos');
    expect(result.delivery_targets![0].signing_required).toBe(true);

    const content = fs.readFileSync(result.plan_path!, 'utf-8');
    expect(content).toContain('mobile/harmonyos');
    expect(content).toContain('AppGallery');
    expect(content).toContain('agc');
  });

  it('多目标：deb + harmonyos 同时生成两个 delivery target', async () => {
    const dir = makeProject('multi-target');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['deb', 'harmonyos']);

    expect(result.status).toBe('success');
    const ids = result.delivery_targets!.map((t) => t.ecosystem);
    expect(ids).toContain('linux/ubuntu');
    expect(ids).toContain('mobile/harmonyos');
  });

  it('未支持的目标返回 invalid_input 且不写 Forge.md', async () => {
    const dir = makeProject('unsupported');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['windows-msi']);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(result.error?.summary).toContain('windows-msi');
    expect(fs.existsSync(path.join(dir, 'Forge.md'))).toBe(false);
  });

  it('源目录不存在时返回错误', async () => {
    const result = await generatePackagingPlan('/nonexistent/xyz', ['deb']);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('path_not_found');
  });
});
