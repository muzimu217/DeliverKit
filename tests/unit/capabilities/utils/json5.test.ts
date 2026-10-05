/**
 * JSON5 解析单测
 *
 * inspect 读取的 tsconfig 等文件常带注释与尾逗号，解析失败必须静默返回 null
 * 让上层回退，而不是把异常抛进识别主流程。
 */

import { describe, it, expect } from 'vitest';
import { parseJson5 } from '../../../../src/capabilities/utils/json5.js';

describe('parseJson5', () => {
  it('解析无引号键与尾逗号', () => {
    expect(parseJson5('{ compilerOptions: { target: "ES2022", } }')).toEqual({
      compilerOptions: { target: 'ES2022' },
    });
  });

  it('解析行内注释', () => {
    expect(parseJson5('{ // entry\n entry: "src/index.ts" }')).toEqual({
      entry: 'src/index.ts',
    });
  });

  it('解析单引号字符串', () => {
    expect(parseJson5("{ name: 'deliverkit' }")).toEqual({
      name: 'deliverkit',
    });
  });

  it('非法文本返回 null 而不抛错', () => {
    expect(parseJson5('{ broken')).toBeNull();
  });

  it('空输入返回 null', () => {
    expect(parseJson5(null)).toBeNull();
    expect(parseJson5('')).toBeNull();
  });
});
