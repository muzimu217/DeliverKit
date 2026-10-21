/**
 * 结果落盘（persistResultJson）单测
 *
 * pack_* 的证据必须到达 generate_release_manifest 才算闭环；
 * 落盘失败本身不允许让已成功的构建失败。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { persistResultJson } from '../../../../src/capabilities/utils/results.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-results-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('persistResultJson', () => {
  it('把结果写到 .deliverkit/results/<command>.json', () => {
    const result = { status: 'success', artifact: 'app_1.0.0_amd64.deb' };
    persistResultJson(tmpDir, 'pack-deb', result);

    const file = path.join(tmpDir, '.deliverkit', 'results', 'pack-deb.json');
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(result);
  });

  it('写入是带换行的 pretty JSON（人可 diff）', () => {
    persistResultJson(tmpDir, 'pack-rpm', { status: 'success' });

    const raw = fs.readFileSync(
      path.join(tmpDir, '.deliverkit', 'results', 'pack-rpm.json'),
      'utf8'
    );
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('"status"');
  });

  it('同名命令的结果被覆盖而不是追加', () => {
    persistResultJson(tmpDir, 'pack-appimage', { status: 'success', v: 1 });
    persistResultJson(tmpDir, 'pack-appimage', { status: 'success', v: 2 });

    const parsed = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, '.deliverkit', 'results', 'pack-appimage.json'),
        'utf8'
      )
    );
    expect(parsed).toEqual({ status: 'success', v: 2 });
  });

  it('目录不存在时自动创建（首次运行场景）', () => {
    const nested = path.join(tmpDir, 'fresh', 'project');
    persistResultJson(nested, 'pack-deb', { status: 'success' });

    expect(
      fs.existsSync(path.join(nested, '.deliverkit', 'results', 'pack-deb.json'))
    ).toBe(true);
  });

  it('落盘失败被吞掉，不向构建层抛错', () => {
    const notADir = path.join(tmpDir, 'plain.txt');
    fs.writeFileSync(notADir, 'x');

    // sourceDir 指向文件时 mkdir 必然失败，函数必须静默返回
    expect(() =>
      persistResultJson(notADir, 'pack-deb', { status: 'success' })
    ).not.toThrow();
  });
});
