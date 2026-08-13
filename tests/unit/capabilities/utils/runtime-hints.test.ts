import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectRuntimeHints } from '../../../../src/capabilities/utils/runtime-hints.js';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-runtime-hints-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('detectRuntimeHints', () => {
  it('infers a single exposed port and health route with evidence', () => {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:20\nEXPOSE 8080\n');
    fs.writeFileSync(path.join(dir, 'server.js'), 'app.get("/health", ok); app.listen(8080);\n');
    expect(detectRuntimeHints(dir)).toEqual(expect.objectContaining({
      container_port: 8080,
      healthcheck_path: '/health',
      confidence: 'high',
    }));
  });

  it('does not choose a port when sources conflict', () => {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:20\nEXPOSE 8080\n');
    fs.writeFileSync(path.join(dir, 'server.js'), 'app.listen(3000);\n');
    const result = detectRuntimeHints(dir);
    expect(result?.container_port).toBeUndefined();
    expect(result?.confidence).toBe('low');
    expect(result?.conflicts?.[0]).toContain('3000');
  });
});
