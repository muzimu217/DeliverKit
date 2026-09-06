/**
 * Artifact version resolution.
 *
 * Versions come from project metadata via the Forge contract; request-level
 * overrides win; anything missing falls back to 0.1.0 so builds never stall
 * on version inference.
 */

export const DEFAULT_ARTIFACT_VERSION = '0.1.0';

/** Resolve the version for this build: explicit override > contract > 0.1.0. */
export function resolveArtifactVersion(
  override: string | undefined,
  contractVersion: string | undefined
): string {
  return normalizeVersion(override) ?? normalizeVersion(contractVersion) ?? DEFAULT_ARTIFACT_VERSION;
}

/** Trim and strip a leading `v`; invalid values fall through as undefined. */
export function normalizeVersion(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/^v/, '');
  return trimmed && /^\d+(\.\d+)*$/.test(trimmed) ? trimmed : undefined;
}

/** WiX ProductVersion requires exactly four numeric parts (x.y.z.w). */
export function toMsiProductVersion(version: string): string {
  const parts = normalizeVersion(version)?.split('.').map(Number) ?? [];
  while (parts.length < 4) {parts.push(0);}
  return parts.slice(0, 4).join('.');
}
