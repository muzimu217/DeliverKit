/**
 * Checksum Utility - SHA256 计算
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * 计算文件的 SHA256
 */
export function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * 计算字符串的 SHA256
 */
export function sha256String(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
