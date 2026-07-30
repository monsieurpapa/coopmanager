// Staging docs can be created by any authenticated user and their `data` map
// is unconstrained by rules, so approval must not spread it blindly into
// /cooperatives: that write runs AS ADMIN and would let a poisoned staging
// doc inject admin-only fields (e.g. eudrCompliance). Only the fields the
// Gemini parse schema legitimately produces may pass through, and only with
// the type that schema declares — a `varieties: 5` would crash the public
// profile render (`varieties.join(...)`), so wrong-typed values are dropped.

type FieldKind = 'string' | 'number' | 'stringArray' | 'numberPair' | 'sensoryProfile';

export const APPROVED_STAGING_FIELDS: Record<string, FieldKind> = {
  name: 'string',
  country: 'string',
  region: 'string',
  established: 'number',
  members: 'number',
  menMembers: 'number',
  womenMembers: 'number',
  youthMembers: 'number',
  altitudeRange: 'numberPair',
  varieties: 'stringArray',
  processingMethods: 'stringArray',
  certifications: 'stringArray',
  annualProduction: 'number',
  averageCuppingScore: 'number',
  description: 'string',
  sustainabilityFocus: 'stringArray',
  areaHa: 'number',
  treeCount: 'number',
  households: 'number',
  sensoryProfile: 'sensoryProfile',
};

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function matchesKind(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return isFiniteNumber(value);
    case 'stringArray':
      return Array.isArray(value) && value.every(v => typeof v === 'string');
    case 'numberPair':
      return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
    case 'sensoryProfile':
      return value !== null && typeof value === 'object' && !Array.isArray(value) &&
        Object.values(value as Record<string, unknown>).every(isFiniteNumber);
  }
}

// Gemini emits `averageCuppingScore` (matches the staging doc and this
// allowlist), but the published /cooperatives schema and every render site
// read `selfReportedCuppingScore` — approving a staged doc without renaming
// left the field permanently unset, showing up live as a blank "SCORE" stat
// and an empty "pts" badge on every AI-staged cooperative.
const FIELD_RENAMES: Record<string, string> = {
  averageCuppingScore: 'selfReportedCuppingScore',
};

export function sanitizeStagingData(data: unknown): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  if (data === null || typeof data !== 'object') return sanitized;
  const record = data as Record<string, unknown>;
  for (const [field, kind] of Object.entries(APPROVED_STAGING_FIELDS)) {
    const value = record[field];
    if (value !== undefined && value !== null && matchesKind(value, kind)) {
      sanitized[FIELD_RENAMES[field] ?? field] = value;
    }
  }
  return sanitized;
}
