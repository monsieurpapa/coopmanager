// Regression tests for the staging-approval sanitizer. This is the second half
// of the eudrCompliance guard: firestore.rules blocks coop_managers, but the
// approval write in StagingArea runs AS ADMIN, so a poisoned staging doc must
// be stripped here before it reaches /cooperatives. Values are also
// type-checked: a `varieties: 5` would crash the public profile render.
import { describe, expect, it } from 'vitest';
import { APPROVED_STAGING_FIELDS, sanitizeStagingData } from '../src/lib/staging';

const typedValue = (kind: string, field: string): unknown => {
  switch (kind) {
    case 'string': return `v-${field}`;
    case 'number': return 42;
    case 'stringArray': return ['a', 'b'];
    case 'numberPair': return [1450, 1900];
    case 'sensoryProfile': return { aroma: 8, acidity: 7, body: 8, sweetness: 7, aftertaste: 8 };
    default: throw new Error(`unknown kind ${kind}`);
  }
};

describe('sanitizeStagingData', () => {
  it('passes through every approved field when correctly typed', () => {
    const input: Record<string, unknown> = {};
    for (const [field, kind] of Object.entries(APPROVED_STAGING_FIELDS)) {
      input[field] = typedValue(kind, field);
    }
    const expected: Record<string, unknown> = { ...input, selfReportedCuppingScore: input.averageCuppingScore };
    delete expected.averageCuppingScore;
    expect(sanitizeStagingData(input)).toEqual(expected);
  });

  it('renames averageCuppingScore to selfReportedCuppingScore on approve', () => {
    const out = sanitizeStagingData({ name: 'Maendeleo', averageCuppingScore: 85.5 });
    expect(out).toEqual({ name: 'Maendeleo', selfReportedCuppingScore: 85.5 });
    expect(out).not.toHaveProperty('averageCuppingScore');
  });

  it('strips eudrCompliance injected into a staging doc', () => {
    const out = sanitizeStagingData({
      name: 'Maendeleo',
      eudrCompliance: { scorePercent: 100 },
    });
    expect(out).toEqual({ name: 'Maendeleo' });
  });

  it('strips other unknown/admin-only keys (managerEmail, id, role)', () => {
    const out = sanitizeStagingData({
      name: 'Coop',
      managerEmail: 'attacker@example.com',
      id: 'forced-id',
      role: 'admin',
      __proto__polluted: true,
    });
    expect(out).toEqual({ name: 'Coop' });
  });

  it('drops approved fields carrying the wrong type (poisoned staging doc)', () => {
    const out = sanitizeStagingData({
      name: 'Coop',
      varieties: 5,                    // number where string[] expected — would crash .join()
      members: '250',                  // string where number expected
      sensoryProfile: 'not-an-object',
      altitudeRange: [1450],           // must be a pair
      certifications: ['RA', 42],      // mixed array
      description: { nested: true },
      areaHa: NaN,                     // non-finite number
    });
    expect(out).toEqual({ name: 'Coop' });
  });

  it('drops null and undefined values but keeps falsy 0 and empty string', () => {
    const out = sanitizeStagingData({
      name: '',
      members: 0,
      region: null,
      description: undefined,
    });
    expect(out).toEqual({ name: '', members: 0 });
  });

  it('returns an empty object for null, undefined, and non-object input', () => {
    expect(sanitizeStagingData(null)).toEqual({});
    expect(sanitizeStagingData(undefined)).toEqual({});
    expect(sanitizeStagingData('name')).toEqual({});
    expect(sanitizeStagingData(42)).toEqual({});
  });
});
