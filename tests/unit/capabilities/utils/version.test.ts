import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARTIFACT_VERSION,
  normalizeVersion,
  resolveArtifactVersion,
  toMsiProductVersion,
} from '../../../../src/capabilities/utils/version.js';

describe('artifact version resolution', () => {
  it('request override wins over contract', () => {
    expect(resolveArtifactVersion('2.0.0', '1.0.0')).toBe('2.0.0');
  });

  it('contract version is used when no override', () => {
    expect(resolveArtifactVersion(undefined, '1.4.2')).toBe('1.4.2');
  });

  it('falls back to 0.1.0 when both are missing', () => {
    expect(resolveArtifactVersion(undefined, undefined)).toBe(DEFAULT_ARTIFACT_VERSION);
  });

  it('invalid override falls through to contract', () => {
    expect(resolveArtifactVersion('not-a-version', '1.2.3')).toBe('1.2.3');
    expect(resolveArtifactVersion('  ', '1.2.3')).toBe('1.2.3');
  });

  it('normalizeVersion strips a leading v and trims', () => {
    expect(normalizeVersion(' v1.2.3 ')).toBe('1.2.3');
    expect(normalizeVersion('1.2')).toBe('1.2');
    expect(normalizeVersion('1.2.3-alpha')).toBeUndefined();
    expect(normalizeVersion('')).toBeUndefined();
  });

  it('MSI product version is normalized to exactly four numeric parts', () => {
    expect(toMsiProductVersion('1.2.3')).toBe('1.2.3.0');
    expect(toMsiProductVersion('1.0')).toBe('1.0.0.0');
    expect(toMsiProductVersion('1.2.3.4')).toBe('1.2.3.4');
    expect(toMsiProductVersion('1.2.3.4.5')).toBe('1.2.3.4');
  });
});
