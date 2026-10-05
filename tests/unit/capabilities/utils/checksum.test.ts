/**
 * Checksum 单元测试
 *
 * SHA256 是 Release Manifest 验证链的核心证据，这里用公开已知向量锚定正确性。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { sha256File, sha256String } from '../../../../src/capabilities/utils/checksum.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-checksum-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('sha256String', () => {
  it('与公开已知向量一致', () => {
    expect(sha256String('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('空串等于空数据的 SHA256', () => {
    expect(sha256String('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('输出为 64 位小写十六进制', () => {
    expect(sha256String('DeliverKit')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('内容不同则摘要不同', () => {
    expect(sha256String('artifact-v1')).not.toBe(sha256String('artifact-v2'));
  });
});

describe('sha256File', () => {
  it('文件内容与等值字符串摘要一致', () => {
    const file = path.join(tmpDir, 'payload.txt');
    fs.writeFileSync(file, 'hello');

    expect(sha256File(file)).toBe(sha256String('hello'));
  });

  it('空文件等于空数据摘要', () => {
    const file = path.join(tmpDir, 'empty.bin');
    fs.writeFileSync(file, Buffer.alloc(0));

    expect(sha256File(file)).toBe(sha256String(''));
  });

  it('二进制内容按字节计算', () => {
    const bytes = Buffer.from([0x00, 0x01, 0xfe, 0xff]);
    const file = path.join(tmpDir, 'bytes.bin');
    fs.writeFileSync(file, bytes);

    expect(sha256File(file)).toBe(
      crypto.createHash('sha256').update(bytes).digest('hex')
    );
  });

  it('文件被篡改后摘要变化', () => {
    const file = path.join(tmpDir, 'mutable.txt');
    fs.writeFileSync(file, 'version-1');
    const before = sha256File(file);

    fs.writeFileSync(file, 'version-2');

    expect(sha256File(file)).not.toBe(before);
  });
});
