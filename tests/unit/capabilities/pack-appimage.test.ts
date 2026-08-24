import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import { packAppImage } from '../../../src/capabilities/pack-appimage.js';
import type { DockerRunner } from '../../../src/capabilities/pack-deb.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {fs.rmSync(dir, { recursive: true, force: true });}
});

describe('pack_appimage', () => {
  it('requires an AppImage target in the generated Forge contract', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-appimage-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);
    const result = packAppImage({ sourceDir, planPath: plan.plan_path! }, () => { throw new Error('must not run'); }, () => true);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('plan_invalid');
  });

  it('builds a bundled AppDir and verifies the result with extract-and-run', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-appimage-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    fs.writeFileSync(path.join(sourceDir, 'requirements.txt'), 'flask==2.3.0\n');
    const plan = await generatePackagingPlan(sourceDir, ['appimage']);
    const outputDir = path.join(sourceDir, 'out');
    const calls: string[][] = [];
    const runner: DockerRunner = (_command, args, options) => {
      calls.push(args);
      if (calls.length === 1) {
        const artifactName = (args.at(-1) ?? '').match(/\/output\/([^\s]+\.AppImage)/)?.[1];
        if (!artifactName) {throw new Error('build script did not declare an AppImage artifact');}
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, artifactName), 'appimage');
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(outputDir, options.logFileName ?? 'build.log') };
    };

    const result = packAppImage({ sourceDir, planPath: plan.plan_path!, outputDir }, runner, () => true);

    expect(result.status).toBe('success');
    expect(result.artifacts?.[0]).toEqual(expect.objectContaining({ type: 'appimage' }));
    expect(calls).toHaveLength(2);
    expect(calls[0].at(-1)).toContain('appimage-builder --recipe');
    expect(calls[0].at(-1)).toContain('rm -rf /work/.git /work/.deliverkit');
    expect(calls[0].at(-1)).toContain('arch: x86_64');
    expect(calls[0].at(-1)).toContain('exec: "usr/bin/python3"');
    expect(calls[0].at(-1)).toContain('icon: deliverkit');
    expect(calls[0].at(-1)).toContain('deliverkit.png');
    expect(calls[0].at(-1)).toContain('find /work -mindepth 1 -maxdepth 1 ! -name AppDir ! -name AppImageBuilder.yml');
    expect(calls[0].at(-1)).toContain('ld-linux-x86-64.so.2 --library-path');
    expect(calls[0].at(-1)).toContain('PYTHONHOME: "$APPDIR/usr"');
    expect(calls[0].at(-1)).not.toContain('TARGET_APPDIR');
    expect(calls[1].at(-1)).toContain('--appimage-extract-and-run');
    expect(calls[1].at(-1)).toContain('unsquashfs -q -offset');
  });

  it('uses a Node 18 AppDir toolchain and an ELF Node entrypoint for TypeScript', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-appimage-node-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'package.json'), JSON.stringify({
      name: 'node-app',
      main: 'dist/index.js',
      scripts: { build: 'tsc', start: 'node dist/index.js' },
      devDependencies: { typescript: '^5.0.0' },
    }));
    fs.writeFileSync(path.join(sourceDir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(sourceDir, 'index.ts'), 'console.log("ready")\n');
    const plan = await generatePackagingPlan(sourceDir, ['appimage']);
    const outputDir = path.join(sourceDir, 'out');
    const calls: string[] = [];
    const runner: DockerRunner = (_command, args, options) => {
      const script = args.at(-1) ?? '';
      calls.push(script);
      if (calls.length === 1) {
        fs.mkdirSync(outputDir, { recursive: true });
        const artifactName = script.match(/\/output\/([^\s]+\.AppImage)/)?.[1];
        if (!artifactName) {throw new Error('build script did not declare an AppImage artifact');}
        fs.writeFileSync(path.join(outputDir, artifactName), 'appimage');
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(outputDir, options.logFileName ?? 'build.log') };
    };

    const result = packAppImage({ sourceDir, planPath: plan.plan_path!, outputDir }, runner, () => true);

    expect(result.status).toBe('success');
    expect(calls[0]).toContain('node_18.x');
    expect(calls[0]).toContain('node.real');
    expect(calls[0]).toContain('exec: "usr/bin/node.real"');
    expect(calls[0]).toContain('$APPDIR/usr/src/dist/index.js');
    expect(calls[0]).not.toContain('include: [nodejs, npm');
  });
});
