/**
 * TypeScript和Go项目模板识别测试
 */

import { describe, it, expect } from 'vitest';
import { inspectProject } from '../../../src/capabilities/inspect-project.js';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(currentDir, '../../fixtures');

describe('inspect_project: 项目模板识别', () => {
  describe('TypeScript 项目', () => {
    it('应识别 TypeScript 项目', async () => {
      const tsProject = path.join(fixturesDir, 'sample-typescript-project');
      const result = await inspectProject(tsProject);

      expect(result.status).toBe('success');
      expect(result.language).toBe('TypeScript');
      expect(result.runtime).toContain('Node');
    });

    it('应检测到 package.json 和 tsconfig.json', async () => {
      const tsProject = path.join(fixturesDir, 'sample-typescript-project');
      const result = await inspectProject(tsProject);

      expect(result.status).toBe('success');
      expect(result.existing_packaging?.package_json).toBe(true);
    });

    it('应识别入口文件', async () => {
      const tsProject = path.join(fixturesDir, 'sample-typescript-project');
      const result = await inspectProject(tsProject);

      expect(result.status).toBe('success');
      expect(result.entrypoints).toBeDefined();
      expect(result.entrypoints?.length).toBeGreaterThan(0);
    });

    it('应检测到 Dockerfile', async () => {
      const tsProject = path.join(fixturesDir, 'sample-typescript-project');
      const result = await inspectProject(tsProject);

      expect(result.status).toBe('success');
      expect(result.existing_packaging?.dockerfile).toBe(true);
    });
  });

  describe('Go 项目', () => {
    it('应识别 Go 项目', async () => {
      const goProject = path.join(fixturesDir, 'sample-go-project');
      const result = await inspectProject(goProject);

      expect(result.status).toBe('success');
      expect(result.language).toBe('Go');
      expect(result.runtime).toContain('Go');
    });

    it('应检测到 go.mod', async () => {
      const goProject = path.join(fixturesDir, 'sample-go-project');
      const result = await inspectProject(goProject);

      expect(result.status).toBe('success');
      expect(result.existing_packaging?.gradle_build).toBe(false);
    });

    it('应识别 main.go 入口文件', async () => {
      const goProject = path.join(fixturesDir, 'sample-go-project');
      const result = await inspectProject(goProject);

      expect(result.status).toBe('success');
      expect(result.entrypoints).toContain('main.go');
    });

    it('应检测到 Dockerfile', async () => {
      const goProject = path.join(fixturesDir, 'sample-go-project');
      const result = await inspectProject(goProject);

      expect(result.status).toBe('success');
      expect(result.existing_packaging?.dockerfile).toBe(true);
    });
  });

  describe('项目推荐', () => {
    it('应为 TypeScript 项目推荐 Docker 打包', async () => {
      const tsProject = path.join(fixturesDir, 'sample-typescript-project');
      const result = await inspectProject(tsProject);

      expect(result.status).toBe('success');
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations?.some(r => r.includes('Docker'))).toBe(true);
    });

    it('应为 Go 项目推荐 Docker 打包', async () => {
      const goProject = path.join(fixturesDir, 'sample-go-project');
      const result = await inspectProject(goProject);

      expect(result.status).toBe('success');
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations?.some(r => r.includes('Docker'))).toBe(true);
    });
  });
});
