/**
 * 生态知识包 schema 测试
 * 验证：2 个真实样例通过校验；坏样例给出可行动校验错误；JSON Schema 导出有效。
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import {
  EcosystemKnowledgeSchema,
  ecosystemKnowledgeJsonSchema,
  ECOSYSTEM_SCHEMA_VERSION,
} from '../../../src/knowledge/ecosystem-schema.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const ecosystemsDir = path.resolve(testDir, '../../../src/knowledge/ecosystems');

function readPack(file: string): unknown {
  return yaml.load(fs.readFileSync(path.join(ecosystemsDir, file), 'utf8'));
}

describe('ecosystem knowledge schema', () => {
  it('两个真实样例通过 schema 校验', () => {
    for (const file of ['linux-ubuntu.yaml', 'harmonyos.yaml']) {
      const result = EcosystemKnowledgeSchema.safeParse(readPack(file));
      expect(result.success, `${file} 应通过校验`).toBe(true);
    }
  });

  it('linux/ubuntu 与 harmonyos 样例的 id 与生态家族正确', () => {
    const ubuntu = EcosystemKnowledgeSchema.parse(readPack('linux-ubuntu.yaml'));
    const harmony = EcosystemKnowledgeSchema.parse(readPack('harmonyos.yaml'));

    expect(ubuntu.id).toBe('linux/ubuntu');
    expect(ubuntu.ecosystem).toBe('linux');
    expect(ubuntu.signing.required).toBe(false);

    expect(harmony.id).toBe('mobile/harmonyos');
    expect(harmony.ecosystem).toBe('harmonyos');
    expect(harmony.signing.required).toBe(true);
    expect(harmony.signing.type).toBe('agc');
    expect(harmony.distribution.store).toBe('AppGallery');
  });

  it('坏样例（空产物列表）给出可行动校验错误', () => {
    const invalid = {
      schema_version: ECOSYSTEM_SCHEMA_VERSION,
      id: 'test/broken',
      ecosystem: 'linux',
      name: 'Broken',
      status: 'planned',
      updated_at: '2026-08-13',
      summary: 'bad pack',
      artifacts: [],
      toolchain: { build_os: 'linux', cross_buildable: true, required: [] },
      signing: { required: false, type: 'none' },
      distribution: { store: null },
      verification: { install: 'x', run: 'y' },
    };

    const result = EcosystemKnowledgeSchema.safeParse(invalid);
    expect(result.success).toBe(false);

    if (!result.success) {
      const messages = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('\n');
      expect(messages).toContain('artifacts');
    }
  });

  it('JSON Schema 导出有效且包含核心字段', () => {
    const jsonSchema = ecosystemKnowledgeJsonSchema as {
      type?: string;
      properties?: Record<string, unknown>;
    };

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();
    expect(jsonSchema.properties?.signing).toBeDefined();
    expect(jsonSchema.properties?.artifacts).toBeDefined();
    expect(jsonSchema.properties?.distribution).toBeDefined();
    expect(jsonSchema.properties?.verification).toBeDefined();
  });
});
