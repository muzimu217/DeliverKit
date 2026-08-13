import { createRequire } from 'node:module';

interface PackageMetadata {
  version?: unknown;
}

const require = createRequire(import.meta.url);
const packageMetadata = require('../../package.json') as PackageMetadata;

if (typeof packageMetadata.version !== 'string' || packageMetadata.version.length === 0) {
  throw new Error('DeliverKit package.json does not contain a valid version');
}

export const SERVER_NAME = 'deliverkit-mcp-server';
export const SERVER_VERSION = packageMetadata.version;
