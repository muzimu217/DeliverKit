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
