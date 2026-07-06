import * as z from 'zod';

export const CooperativeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  country: z.string().min(1, 'Country is required'),
  region: z.string().min(1, 'Region is required'),
  established: z.number().optional(),
  members: z.number().min(0),
  menMembers: z.number().min(0).optional(),
  womenMembers: z.number().min(0).optional(),
  youthMembers: z.number().min(0).optional(),
  altitudeRange: z.array(z.number()).length(2).optional(),
  varieties: z.array(z.string()).optional(),
  processingMethods: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  annualProduction: z.number().min(0).optional(),
  selfReportedCuppingScore: z.number().min(0).max(100).optional(),
  commodity: z.enum(['coffee', 'cocoa']).optional(),
  managerEmail: z.string().email().optional().or(z.literal('')),
  isBocParticipant: z.boolean().optional(),
  description: z.string().optional(),
  sustainabilityFocus: z.array(z.string()).optional(),
  areaHa: z.number().min(0).optional(),
  treeCount: z.number().min(0).optional(),
  households: z.number().min(0).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  sensoryProfile: z.object({
    aroma: z.number().min(0).max(10),
    acidity: z.number().min(0).max(10),
    body: z.number().min(0).max(10),
    sweetness: z.number().min(0).max(10),
    aftertaste: z.number().min(0).max(10),
  }).optional(),
});

export type CooperativeFormData = z.infer<typeof CooperativeSchema>;

// Validates the eudrCompliance object pasted by an admin from the tools/eudr
// script output. Mirrors isValidEudrCompliance() in firestore.rules — keep
// both in sync. `.strict()` rejects unexpected keys so nothing else can ride
// along into the cooperative doc.
export const EudrComplianceSchema = z.object({
  scorePercent: z.number().min(0).max(100),
  totalFarms: z.number().int().min(0),
  farmsWithGps: z.number().int().min(0),
  oversizedFarmsMissingPolygon: z.boolean(),
  computedAt: z.string().max(40),
  sourceFileHash: z.string().regex(/^[0-9a-f]{64}$/, 'Must be a SHA-256 hex hash'),
  sourceFileName: z.string().max(200),
  scriptVersion: z.string().max(40),
}).strict().refine(d => d.farmsWithGps <= d.totalFarms, {
  message: 'farmsWithGps cannot exceed totalFarms',
});
