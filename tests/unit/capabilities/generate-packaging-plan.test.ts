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

  it('Linux 多目标：deb + rpm + AppImage 分别解析为明确生态', async () => {
    const dir = makeProject('linux-multi-target');
    fs.writeFileSync(path.join(dir, 'app.py'), 'print("ready")');

    const result = await generatePackagingPlan(dir, ['deb', 'rpm', 'appimage']);

    expect(result.status).toBe('success');
    expect(result.delivery_targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ ecosystem: 'linux/ubuntu', artifacts: ['deb'] }),
      expect.objectContaining({ ecosystem: 'linux/rpm', artifacts: ['rpm'] }),
      expect.objectContaining({ ecosystem: 'linux/appimage', artifacts: ['appimage'] }),
    ]));
  });

  it('Windows MSI 计划声明签名硬约束', async () => {
    const dir = makeProject('windows-msi');
    fs.writeFileSync(path.join(dir, 'app.py'), 'print("ready")');

    const result = await generatePackagingPlan(dir, ['windows-msi']);

    expect(result.status).toBe('success');
    expect(result.delivery_targets).toEqual([
      expect.objectContaining({ ecosystem: 'desktop/windows', artifacts: ['msi'], signing_required: true }),
    ]);
    expect(fs.readFileSync(result.plan_path!, 'utf8')).toContain('desktop/windows');
  });

  it('macOS DMG 计划声明 Apple 签名与公证目标', async () => {
    const dir = makeProject('macos-dmg');
    fs.mkdirSync(path.join(dir, 'Demo.app', 'Contents'), { recursive: true });

    const result = await generatePackagingPlan(dir, ['macos-dmg']);

    expect(result.status).toBe('success');
    expect(result.delivery_targets).toEqual([
      expect.objectContaining({ ecosystem: 'desktop/macos', artifacts: ['dmg'], signing_required: true }),
    ]);
  });

  it('macOS PKG 计划保留 installer package 目标', async () => {
    const dir = makeProject('macos-pkg');
    fs.mkdirSync(path.join(dir, 'Demo.app', 'Contents'), { recursive: true });

    const result = await generatePackagingPlan(dir, ['macos-pkg']);

    expect(result.status).toBe('success');
    expect(result.delivery_targets).toEqual([
      expect.objectContaining({ ecosystem: 'desktop/macos', artifacts: ['pkg'], signing_required: true }),
    ]);
  });

  it('未支持的目标返回 invalid_input 且不写 Forge.md', async () => {
    const dir = makeProject('unsupported');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await generatePackagingPlan(dir, ['android-apk']);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(result.error?.summary).toContain('android-apk');
    expect(fs.existsSync(path.join(dir, 'Forge.md'))).toBe(false);
  });

  it('源目录不存在时返回错误', async () => {
    const result = await generatePackagingPlan('/nonexistent/xyz', ['deb']);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('path_not_found');
  });
});

describe('generate_packaging_plan 手动指定语言与入口', () => {
  it('未识别项目用手动指定生成契约，语言与入口写入机器契约', async () => {
    const dir = makeProject('manual-contract');
    fs.writeFileSync(path.join(dir, 'wsgi.server'), 'print("hi")\n');

    const result = await generatePackagingPlan(dir, ['deb'], undefined, {
      language: 'python',
      entrypoints: ['wsgi.server'],
    });

    expect(result.status).toBe('success');
    const content = fs.readFileSync(result.plan_path!, 'utf-8');
    const encoded = content.match(/deliverkit-contract:([A-Za-z0-9_-]+)/)?.[1];
    expect(encoded).toBeTruthy();
    const contract = JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf-8'));
    expect(contract.project.language).toBe('Python');
    expect(contract.project.entrypoints).toContain('wsgi.server');
  });

  it('手动指定的语言无效时不写 Forge.md', async () => {
    const dir = makeProject('manual-badlang');
    fs.writeFileSync(path.join(dir, 'a.file'), '');

    const result = await generatePackagingPlan(dir, ['deb'], undefined, { language: 'rust' });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(fs.existsSync(path.join(dir, 'Forge.md'))).toBe(false);
  });
});

describe('generate_packaging_plan 版本推导', () => {
  it('pyproject.toml 的 version 写入契约', async () => {
    const dir = makeProject('versioned-python');
    fs.writeFileSync(path.join(dir, 'app.py'), 'print("hi")\n');
    fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\nname = "demo"\nversion = "2.3.4"\n');

    const result = await generatePackagingPlan(dir, ['deb']);

    expect(result.status).toBe('success');
    const content = fs.readFileSync(result.plan_path!, 'utf-8');
    expect(content).toContain('- Version: 2.3.4');
    const encoded = content.match(/deliverkit-contract:([A-Za-z0-9_-]+)/)?.[1];
    const contract = JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf-8'));
    expect(contract.project.version).toBe('2.3.4');
  });

  it('package.json 的 version 写入契约', async () => {
    const dir = makeProject('versioned-node');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"demo","version":"5.1.0"}');

    const result = await generatePackagingPlan(dir, ['deb']);

    expect(result.status).toBe('success');
    const encoded = fs.readFileSync(result.plan_path!, 'utf-8').match(/deliverkit-contract:([A-Za-z0-9_-]+)/)?.[1];
    const contract = JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf-8'));
    expect(contract.project.version).toBe('5.1.0');
  });

  it('无版本元数据时回退 0.1.0 并给出警告', async () => {
    const dir = makeProject('unversioned');
    fs.writeFileSync(path.join(dir, 'app.py'), 'print("hi")\n');

    const result = await generatePackagingPlan(dir, ['deb']);

    expect(result.status).toBe('success');
    expect(result.warnings?.some((w) => w.includes('版本') && w.includes('0.1.0'))).toBe(true);
    const encoded = fs.readFileSync(result.plan_path!, 'utf-8').match(/deliverkit-contract:([A-Za-z0-9_-]+)/)?.[1];
    const contract = JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf-8'));
    expect(contract.project.version).toBe('0.1.0');
  });
});
