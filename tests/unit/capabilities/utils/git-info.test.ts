/**
 * GitInfo 单元测试
 *
 * 用真实临时 git 仓库验证 manifest 的 git 溯源证据：
 * 重点盯脱敏（remote URL 里的 token 绝不能进 ReleaseManifest）与脏区检测。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  isGitRepository,
  getGitInfo,
  getGitUser,
  hasUnpushedCommits,
  getLatestTag,
} from '../../../../src/capabilities/utils/git-info.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-gitinfo-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 在临时仓库里执行 git，身份内联注入，不依赖全局配置 */
function git(cwd: string, args: string): void {
  execSync(`git -c user.name=Tester -c user.email=t@example.com -c commit.gpgsign=false ${args}`, {
    cwd,
    stdio: 'pipe',
  });
}

function initRepo(): string {
  const repo = path.join(tmpDir, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init -q -b main');
  fs.writeFileSync(path.join(repo, 'README.md'), '# demo');
  git(repo, 'add .');
  git(repo, 'commit -q -m "first commit"');
  return repo;
}

describe('isGitRepository', () => {
  it('普通目录返回 false', () => {
    expect(isGitRepository(tmpDir)).toBe(false);
  });

  it('git 仓库返回 true', () => {
    const repo = initRepo();
    expect(isGitRepository(repo)).toBe(true);
  });
});

describe('getGitInfo', () => {
  it('非 git 目录返回 null', () => {
    expect(getGitInfo(tmpDir)).toBeNull();
  });

  it('干净仓库返回提交与分支信息', () => {
    const repo = initRepo();
    const info = getGitInfo(repo);

    expect(info).not.toBeNull();
    expect(info!.commit_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(info!.commit_message).toBe('first commit');
    expect(info!.branch).toBe('main');
    expect(info!.is_dirty).toBe(false);
    expect(info!.dirty_files).toEqual([]);
    expect(info!.tag).toBeUndefined();
  });

  it('未提交文件触发脏区标记并进入 dirty_files', () => {
    const repo = initRepo();
    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'x');

    const info = getGitInfo(repo);

    expect(info!.is_dirty).toBe(true);
    expect(info!.dirty_files).toContain('untracked.txt');
  });

  it('dirty_files 最多 10 条，避免泄露整个工作区', () => {
    const repo = initRepo();
    for (let i = 0; i < 12; i++) {
      fs.writeFileSync(path.join(repo, `file-${i}.txt`), 'x');
    }

    const info = getGitInfo(repo);

    expect(info!.is_dirty).toBe(true);
    expect(info!.dirty_files).toHaveLength(10);
  });

  it('https remote URL 中的 token 被脱敏', () => {
    const repo = initRepo();
    git(repo, 'remote add origin https://ghp_secret123@github.com/muzimu217/example.git');

    const info = getGitInfo(repo);

    expect(info!.remote_url).toBe(
      'https://<redacted>@github.com/muzimu217/example.git'
    );
    expect(info!.remote_url).not.toContain('ghp_secret123');
  });

  it('无凭据的 ssh remote URL 原样保留', () => {
    const repo = initRepo();
    git(repo, 'remote add origin git@github.com:muzimu217/example.git');

    const info = getGitInfo(repo);

    expect(info!.remote_url).toBe('git@github.com:muzimu217/example.git');
  });

  it('打标签后 tag 与 getLatestTag 均返回该标签', () => {
    const repo = initRepo();
    git(repo, 'tag v0.9.0');

    expect(getGitInfo(repo)!.tag).toBe('v0.9.0');
    expect(getLatestTag(repo)).toBe('v0.9.0');
  });

  it('无标签时 getLatestTag 返回 null', () => {
    const repo = initRepo();
    expect(getLatestTag(repo)).toBeNull();
  });
});

describe('getGitUser', () => {
  it('返回仓库配置的身份', () => {
    const repo = initRepo();
    git(repo, 'config user.name "DeliverKit Tester"');
    git(repo, 'config user.email tester@example.com');

    expect(getGitUser(repo)).toEqual({
      name: 'DeliverKit Tester',
      email: 'tester@example.com',
    });
  });
});

describe('hasUnpushedCommits', () => {
  it('没有上游分支时返回 false（命令失败不误报）', () => {
    const repo = initRepo();
    expect(hasUnpushedCommits(repo)).toBe(false);
  });
});
