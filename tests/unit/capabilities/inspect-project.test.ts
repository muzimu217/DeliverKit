/**
 * M2: inspect_project 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { inspectProject } from '../../../src/capabilities/inspect-project.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-inspect-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('M2: inspect_project', () => {
  it('Python 项目识别（pyproject.toml + app.py）', async () => {
    const dir = path.join(tmpDir, 'python-project');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'pyproject.toml'),
      '[project]\nname = "demo"\npython_requires = ">=3.10"\n'
    );
    fs.writeFileSync(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)');

    const result = await inspectProject(dir);

    expect(result.status).toBe('success');
    expect(result.language).toBe('Python');
    expect(result.runtime).toContain('3.10');
    expect(result.entrypoints).toContain('app.py');
    expect(result.existing_packaging?.pyproject_toml).toBe(true);
    expect(result.recommendations?.some((r) => r.includes('Docker'))).toBe(true);
  });

  it('Python 项目识别（requirements.txt）', async () => {
    const dir = path.join(tmpDir, 'python-req');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==2.3.0\n');
    fs.writeFileSync(path.join(dir, 'main.py'), 'print("hello")');

    const result = await inspectProject(dir);

    expect(result.status).toBe('success');
    expect(result.language).toBe('Python');
    expect(result.entrypoints).toContain('main.py');
    expect(result.existing_packaging?.requirements_txt).toBe(true);
  });

  it('已有 Dockerfile 时正确检测', async () => {
    const dir = path.join(tmpDir, 'with-dockerfile');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM python:3.10-slim\n');
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await inspectProject(dir);

    expect(result.existing_packaging?.dockerfile).toBe(true);
    expect(result.warnings?.some((w) => w.includes('Dockerfile'))).toBeFalsy();
  });

  it('无 Dockerfile 时给出警告', async () => {
    const dir = path.join(tmpDir, 'no-dockerfile');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'app.py'), '');

    const result = await inspectProject(dir);

    expect(result.warnings?.some((w) => w.includes('Dockerfile'))).toBe(true);
  });

  it('TypeScript 项目识别（package.json + typescript）', async () => {
    const dir = path.join(tmpDir, 'ts-project');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'ts-demo',
        main: 'dist/index.js',
        dependencies: { typescript: '^5.0.0' },
      })
    );

    const result = await inspectProject(dir);

    expect(result.language).toBe('TypeScript');
    expect(result.runtime).toBe('Node.js');
    expect(result.entrypoints).toContain('dist/index.js');
  });

  it('Go 项目识别（go.mod + main.go）', async () => {
    const dir = path.join(tmpDir, 'go-project');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module demo\n\ngo 1.21\n');
    fs.writeFileSync(path.join(dir, 'main.go'), 'package main\n');

    const result = await inspectProject(dir);

    expect(result.language).toBe('Go');
    expect(result.entrypoints).toContain('main.go');
  });

  it('HarmonyOS Stage 工程识别 ArkTS、API 与 Ability 入口', async () => {
    const dir = path.join(tmpDir, 'harmony-project');
    const abilityDir = path.join(dir, 'entry', 'src', 'main', 'ets', 'entryability');
    fs.mkdirSync(path.join(dir, 'AppScope'), { recursive: true });
    fs.mkdirSync(abilityDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AppScope', 'app.json5'), '{ app: { bundleName: "com.example.demo" } }');
    fs.writeFileSync(
      path.join(dir, 'build-profile.json5'),
      '{ app: { products: [{ compatibleSdkVersion: "5.0.5(17)", }], }, modules: [{ name: "entry", srcPath: "./entry", }], }'
    );
    fs.writeFileSync(
      path.join(dir, 'entry', 'src', 'main', 'module.json5'),
      '{ module: { mainElement: "EntryAbility", abilities: [{ name: "EntryAbility", srcEntry: "./ets/entryability/EntryAbility.ets", }], }, }'
    );
    fs.writeFileSync(path.join(abilityDir, 'EntryAbility.ets'), 'export default class EntryAbility {}');

    const result = await inspectProject(dir);

    expect(result.language).toBe('ArkTS');
    expect(result.runtime).toBe('HarmonyOS API 17');
    expect(result.entrypoints).toContain('entry/src/main/ets/entryability/EntryAbility.ets');
    expect(result.warnings).not.toContain('项目缺少 Dockerfile，生成计划时可选择自动生成');
    expect(result.recommendations?.some((item) => item.includes('HarmonyOS HAP'))).toBe(true);
  });

  it('无入口时返回警告', async () => {
    const dir = path.join(tmpDir, 'no-entry');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'utils.py'), 'def helper(): pass\n');

    const result = await inspectProject(dir);

    expect(result.warnings?.some((w) => w.includes('入口'))).toBe(true);
    expect(result.entrypoints).toHaveLength(0);
  });

  it('源目录不存在时返回 path_not_found 错误', async () => {
    const result = await inspectProject('/nonexistent/path/xyz');

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('path_not_found');
  });

  it('源路径是文件时返回 invalid_path 错误', async () => {
    const filePath = path.join(tmpDir, 'a-file.txt');
    fs.writeFileSync(filePath, 'hello');

    const result = await inspectProject(filePath);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_path');
  });
});

describe('inspect_project 手动指定语言与入口', () => {
  it('未识别语言的项目可通过 language/entrypoints 继续', async () => {
    const dir = path.join(tmpDir, 'manual-ruby');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'server.rb'), 'puts "hi"');

    const result = await inspectProject(dir, { language: 'python', entrypoints: ['server.rb'] });

    expect(result.status).toBe('success');
    expect(result.language).toBe('Python');
    expect(result.entrypoints).toEqual(['server.rb']);
    expect(result.decision_basis?.build_method).toContain('手动指定为 Python 项目');
  });

  it('language 大小写不敏感', async () => {
    const dir = path.join(tmpDir, 'manual-upper');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'run.sh'), '');

    const result = await inspectProject(dir, { language: 'PYTHON' });

    expect(result.status).toBe('success');
    expect(result.language).toBe('Python');
  });

  it('手动指定的语言与自动识别冲突时按手动值执行并标注', async () => {
    const dir = path.join(tmpDir, 'manual-conflict');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"demo"}');

    const result = await inspectProject(dir, { language: 'go' });

    expect(result.status).toBe('success');
    expect(result.language).toBe('Go');
    expect(result.decision_basis?.build_method).toContain('自动识别为 JavaScript，已忽略');
  });

  it('不支持的语言返回 invalid_input 并列出支持值', async () => {
    const dir = path.join(tmpDir, 'manual-badlang');
    fs.mkdirSync(dir, { recursive: true });

    const result = await inspectProject(dir, { language: 'ruby' });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(result.error?.suggested_fix).toContain('python');
    expect(result.error?.suggested_fix).toContain('arkts');
  });

  it('入口文件不存在返回 invalid_input', async () => {
    const dir = path.join(tmpDir, 'manual-noentry');
    fs.mkdirSync(dir, { recursive: true });

    const result = await inspectProject(dir, { language: 'python', entrypoints: ['missing.py'] });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(result.error?.summary).toContain('missing.py');
  });

  it('绝对路径或含 .. 的入口被拒绝', async () => {
    const dir = path.join(tmpDir, 'manual-unsafe');
    fs.mkdirSync(dir, { recursive: true });

    const absolute = await inspectProject(dir, { language: 'python', entrypoints: [path.join(dir, 'app.py')] });
    expect(absolute.status).toBe('failed');
    expect(absolute.error?.code).toBe('invalid_input');

    const traversal = await inspectProject(dir, { language: 'python', entrypoints: ['../app.py'] });
    expect(traversal.status).toBe('failed');
    expect(traversal.error?.code).toBe('invalid_input');
  });

  it('npm start 作为脚本型入口放行', async () => {
    const dir = path.join(tmpDir, 'manual-npmstart');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"demo"}');

    const result = await inspectProject(dir, { language: 'typescript', entrypoints: ['npm start'] });

    expect(result.status).toBe('success');
    expect(result.entrypoints).toEqual(['npm start']);
  });

  it('带 overrides 的调用绕过缓存且不污染缓存', async () => {
    const dir = path.join(tmpDir, 'manual-cache');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"demo"}');
    fs.writeFileSync(path.join(dir, 'main.go'), 'package main');

    const auto = await inspectProject(dir);
    expect(auto.language).toBe('JavaScript');

    const manual = await inspectProject(dir, { language: 'go' });
    expect(manual.language).toBe('Go');

    const again = await inspectProject(dir);
    expect(again.language).toBe('JavaScript');
  });
});
