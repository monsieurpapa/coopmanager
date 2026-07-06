// Direct tests for EudrComplianceSchema — the client-side mirror of
// isValidEudrCompliance() in firestore.rules. Pins the one intentional
// divergence: rules tolerate extra keys (keys().hasAll), Zod rejects them
// (.strict()), so the paste box is stricter than the rules.
import { describe, expect, it } from 'vitest';
import { EudrComplianceSchema } from '../src/schemas';

const valid = {
  scorePercent: 100,
  totalFarms: 250,
  farmsWithGps: 250,
  oversizedFarmsMissingPolygon: false,
  computedAt: '2026-07-03T00:00:00Z',
  sourceFileHash: 'a'.repeat(64),
  sourceFileName: 'registre_maendeleo_2026-06.xlsx',
  scriptVersion: '1.0.0',
};

describe('EudrComplianceSchema', () => {
  it('accepts the exact tools/eudr output shape', () => {
    expect(EudrComplianceSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts boundary scores 0 and 100, rejects outside the range', () => {
    expect(EudrComplianceSchema.safeParse({ ...valid, scorePercent: 0, farmsWithGps: 0 }).success).toBe(true);
    expect(EudrComplianceSchema.safeParse({ ...valid, scorePercent: 101 }).success).toBe(false);
    expect(EudrComplianceSchema.safeParse({ ...valid, scorePercent: -1 }).success).toBe(false);
  });

  it('rejects unexpected keys (.strict — stricter than the rules mirror)', () => {
    expect(EudrComplianceSchema.safeParse({ ...valid, injected: true }).success).toBe(false);
  });

  it('rejects a non-hex or wrong-length sourceFileHash', () => {
    expect(EudrComplianceSchema.safeParse({ ...valid, sourceFileHash: 'abc123' }).success).toBe(false);
    expect(EudrComplianceSchema.safeParse({ ...valid, sourceFileHash: 'Z'.repeat(64) }).success).toBe(false);
  });

  it('rejects farmsWithGps greater than totalFarms (refine)', () => {
    expect(EudrComplianceSchema.safeParse({ ...valid, farmsWithGps: 251 }).success).toBe(false);
  });

  it('rejects non-integer farm counts and missing required keys', () => {
    expect(EudrComplianceSchema.safeParse({ ...valid, totalFarms: 2.5 }).success).toBe(false);
    const { scriptVersion: _omitted, ...missing } = valid;
    expect(EudrComplianceSchema.safeParse(missing).success).toBe(false);
  });
});
