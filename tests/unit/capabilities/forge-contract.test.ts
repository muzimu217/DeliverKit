import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  contractIncludesArtifact,
  loadForgeContract,
  renderForgeContract,
  type ForgeContract,
} from '../../../src/capabilities/forge-contract.js';

function contract(sourceDir: string): ForgeContract {
  return {
    schema_version: 1,
    generated_at: '2026-08-15T00:00:00.000Z',
    source_dir: sourceDir,
    project: { name: 'sample', language: 'Python', entrypoints: ['app.py'] },
    delivery_targets: [{ ecosystem: 'linux/ubuntu', artifacts: ['deb', 'rpm'] }],
  };
}

describe('Forge machine contract', () => {
  it('loads the newest embedded contract and checks its selected artifact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-contract-'));
    try {
      const planPath = path.join(dir, 'Forge.md');
      fs.writeFileSync(planPath, `# Plan\n${renderForgeContract(contract(dir))}\n`);

      const loaded = loadForgeContract(planPath, dir);
      expect(loaded.ok).toBe(true);
      if (loaded.ok) {
        expect(contractIncludesArtifact(loaded.contract, 'linux/ubuntu', 'deb')).toBe(true);
        expect(contractIncludesArtifact(loaded.contract, 'linux/ubuntu', 'appimage')).toBe(false);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a plan generated for another project', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-contract-'));
    try {
      const planPath = path.join(dir, 'Forge.md');
      fs.writeFileSync(planPath, renderForgeContract(contract('/another/project')));
      const loaded = loadForgeContract(planPath, dir);
      expect(loaded).toEqual(expect.objectContaining({ ok: false }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves a relative source_dir after the project is copied to a CI checkout path', () => {
    const generatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-contract-generated-'));
    const checkoutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-contract-checkout-'));
    try {
      const generatedPlan = path.join(generatedDir, 'Forge.md');
      fs.writeFileSync(generatedPlan, renderForgeContract(contract('.')));
      fs.copyFileSync(generatedPlan, path.join(checkoutDir, 'Forge.md'));

      const loaded = loadForgeContract(path.join(checkoutDir, 'Forge.md'), checkoutDir);
      expect(loaded.ok).toBe(true);
    } finally {
      fs.rmSync(generatedDir, { recursive: true, force: true });
      fs.rmSync(checkoutDir, { recursive: true, force: true });
    }
  });
});

describe('loadForgeContract - source_dir 符号链接容差', () => {
  it('declared 与 actual 是同一实际目录的符号链接时不误报', async () => {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-real-'));
    const link = path.join(os.tmpdir(), `deliverkit-link-${Date.now()}`);
    try {
      fs.symlinkSync(real, link);
      const contract = {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        source_dir: link,
        project: { name: 'demo', entrypoints: ['app.py'] },
        delivery_targets: [{ ecosystem: 'linux/ubuntu', artifacts: ['deb'] }],
      };
      const planPath = path.join(link, 'Forge.md');
      fs.writeFileSync(planPath, `# plan\n<!-- deliverkit-contract:${Buffer.from(JSON.stringify(contract), 'utf8').toString('base64url')} -->\n`);

      const loaded = loadForgeContract(planPath, real);

      expect(loaded.ok).toBe(true);
    } finally {
      fs.rmSync(real, { recursive: true, force: true });
      fs.rmSync(link, { force: true });
    }
  });

  it('真实不一致时报错携带两个路径值', () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-b-'));
    try {
      const contract = {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        source_dir: dirA,
        project: { name: 'demo', entrypoints: ['app.py'] },
        delivery_targets: [{ ecosystem: 'linux/ubuntu', artifacts: ['deb'] }],
      };
      const planPath = path.join(dirB, 'Forge.md');
      fs.writeFileSync(planPath, `<!-- deliverkit-contract:${Buffer.from(JSON.stringify(contract), 'utf8').toString('base64url')} -->\n`);

      const loaded = loadForgeContract(planPath, dirB);

      expect(loaded.ok).toBe(false);
      if (!loaded.ok) {
        expect(loaded.reason).toContain(dirA);
        expect(loaded.reason).toContain(dirB);
        expect(loaded.reason).toContain('符号链接');
      }
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });
});
