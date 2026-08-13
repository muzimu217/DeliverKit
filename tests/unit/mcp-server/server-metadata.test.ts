import { describe, expect, it } from 'vitest';
import packageMetadata from '../../../package.json';
import { SERVER_NAME, SERVER_VERSION } from '../../../src/mcp-server/server-metadata.js';

describe('MCP server metadata', () => {
  it('uses package.json as the server version source', () => {
    expect(SERVER_NAME).toBe('deliverkit-mcp-server');
    expect(SERVER_VERSION).toBe(packageMetadata.version);
  });
});
