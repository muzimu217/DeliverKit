import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writePlan } from '../../../src/capabilities/plan-writer.js';

let tempDir: string;
let planPath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-plan-writer-'));
  planPath = path.join(tempDir, 'Forge.md');
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('plan writer', () => {
  it('创建并覆盖生成的计划', () => {
    expect(writePlan(planPath, 'first').ok).toBe(true);
    expect(writePlan(planPath, 'second').ok).toBe(true);
    expect(fs.readFileSync(planPath, 'utf8')).toBe('second');
  });

  it('保留 user-managed 内容并追加重新生成的计划', () => {
    fs.writeFileSync(planPath, '<!-- user-managed -->\ncustom');

    const result = writePlan(planPath, 'generated');
    const content = fs.readFileSync(planPath, 'utf8');

    expect(result.ok).toBe(true);
    expect(content).toContain('custom');
    expect(content).toContain('regenerated at');
    expect(content).toContain('generated');
  });
});
