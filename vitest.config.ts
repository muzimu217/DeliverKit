import { defineConfig } from 'vitest/config';
import path from 'path';

const src = (sub: string) => path.resolve(__dirname, 'src', sub);

export default defineConfig({
  resolve: {
    alias: [
      // 将 @alias/x.js specifier 重写为 .ts 源文件（TS 产物用 .js，vitest 直接跑 .ts）
      { find: /^@mcp-server\/(.*)\.js$/, replacement: src('mcp-server/$1.ts') },
      { find: /^@mcp-server\/(.*)$/, replacement: src('mcp-server/$1.ts') },
      { find: /^@capabilities\/(.*)\.js$/, replacement: src('capabilities/$1.ts') },
      { find: /^@capabilities\/(.*)$/, replacement: src('capabilities/$1.ts') },
      { find: /^@knowledge\/(.*)\.js$/, replacement: src('knowledge/$1.ts') },
      { find: /^@knowledge\/(.*)$/, replacement: src('knowledge/$1.ts') },
      { find: /^@templates\/(.*)\.js$/, replacement: src('packaging/$1.ts') },
      { find: /^@templates\/(.*)$/, replacement: src('packaging/$1.ts') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src/systems/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'tests',
        'src/systems',
        'src/templates',
        '**/*.yaml',
        '**/*.md',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: ['default'],
    bail: 0,
    retry: 0,
  },
});
