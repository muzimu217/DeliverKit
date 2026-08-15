import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../..');
const serverEntry = path.join(projectRoot, 'dist/mcp-server/index.js');
const fixtureDir = path.join(projectRoot, 'tests/fixtures/sample-python-project');

const timeout = setTimeout(() => {
  console.error('Compiled MCP runtime smoke test timed out');
  process.exit(1);
}, 15_000);

const client = new Client(
  { name: 'deliverkit-runtime-smoke', version: '0.1.0' },
  { capabilities: {} }
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  stderr: 'pipe',
});
const stderrChunks = [];
transport.stderr?.on('data', (chunk) => stderrChunks.push(chunk.toString()));

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'generate_packaging_plan',
    'get_ecosystem_knowledge',
    'inspect_project',
  ]);

  const response = await client.callTool({
    name: 'inspect_project',
    arguments: { source_dir: fixtureDir },
  });
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');

  const result = JSON.parse(response.content[0].text);
  assert.equal(result.status, 'success');
  assert.equal(result.language, 'Python');
  assert.ok(result.entrypoints.includes('app.py'));

  const knowledgeResponse = await client.callTool({
    name: 'get_ecosystem_knowledge',
    arguments: { ecosystem: 'linux/ubuntu' },
  });
  const knowledge = JSON.parse(knowledgeResponse.content[0].text);
  assert.equal(knowledge.status, 'success');
  assert.equal(knowledge.total, 1);
  assert.equal(knowledge.ecosystems[0].id, 'linux/ubuntu');
  assert.equal(knowledge.ecosystems[0].signing.required, false);

  await new Promise((resolve) => setImmediate(resolve));
  const packageMetadata = JSON.parse(
    await (await import('node:fs/promises')).readFile(path.join(projectRoot, 'package.json'), 'utf8')
  );
  assert.ok(
    stderrChunks.join('').includes(
      `deliverkit-mcp-server v${packageMetadata.version} started`
    )
  );

  console.log('Compiled MCP runtime smoke test passed');
} finally {
  clearTimeout(timeout);
  await client.close();
}
