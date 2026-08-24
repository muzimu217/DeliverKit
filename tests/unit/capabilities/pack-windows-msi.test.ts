import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import { packWindowsMsi, type WindowsCommandRunner } from '../../../src/capabilities/pack-windows-msi.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) { fs.rmSync(dir, { recursive: true, force: true }); }
});

describe('pack_windows_msi', () => {
  it('refuses to pretend Windows packaging works on a non-Windows host', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-msi-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['windows-msi']);

    const result = packWindowsMsi({ sourceDir, planPath: plan.plan_path!, platform: 'darwin' }, () => { throw new Error('must not run'); }, () => true);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('toolchain_not_available');
  });

  it('requires both PFX and password before invoking the toolchain', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-msi-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['windows-msi']);

    const result = packWindowsMsi({ sourceDir, planPath: plan.plan_path!, platform: 'win32', environment: {} }, () => { throw new Error('must not run'); }, () => true);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('signing_material_missing');
  });

  it('builds, signs, verifies, installs, and uninstalls an MSI', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-msi-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['windows-msi']);
    const outputDir = path.join(sourceDir, 'out');
    const calls: Array<{ command: string; args: string[]; options: { redactedArgs?: string[] } }> = [];
    const runner: WindowsCommandRunner = (command, args, options) => {
      calls.push({ command, args, options });
      if (command === 'wix') {
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(args.at(-1)!, 'msi');
      }
      return { success: command !== 'msiexec', exitCode: command === 'msiexec' ? 3010 : 0, stdout: '', stderr: '', logPath: path.join(outputDir, options.logFileName ?? 'command.log') };
    };

    const result = packWindowsMsi({
      sourceDir,
      planPath: plan.plan_path!,
      outputDir,
      platform: 'win32',
      environment: { DELIVERKIT_WINDOWS_PFX_BASE64: Buffer.from('pfx').toString('base64'), DELIVERKIT_WINDOWS_PFX_PASSWORD: 'super-secret' },
    }, runner, () => true);

    expect(result.status).toBe('success');
    expect(calls.map((call) => call.command)).toEqual(['wix', 'signtool', 'signtool', 'msiexec', 'msiexec']);
    expect(calls[1].options.redactedArgs).toContain('<redacted>');
    expect(calls[1].options.redactedArgs).not.toContain('super-secret');
    expect(result.artifacts?.[0]).toEqual(expect.objectContaining({ type: 'msi' }));
  });
});
