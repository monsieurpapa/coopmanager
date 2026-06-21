// Mirrors firestore.rules 1:1. Keep both in sync when either changes —
// these functions are the client-side UX gate, the rules are the real
// security boundary.

export type Role = 'admin' | 'coop_manager' | 'user';

export interface UserProfile {
  email: string;
  role: Role;
  cooperativeId?: string;
  displayName?: string;
  phoneNumber?: string;
  bio?: string;
}

type Profile = UserProfile | null | undefined;

// mirrors isAdmin() in firestore.rules
export function isAdmin(profile: Profile): boolean {
  return profile?.role === 'admin';
}

// mirrors isCoopManager(coopId) in firestore.rules
export function isCoopManagerOf(profile: Profile, coopId: string | null | undefined): boolean {
  return !!profile && !!coopId && profile.role === 'coop_manager' && profile.cooperativeId === coopId;
}

export function canEditCooperative(profile: Profile, coopId: string | null | undefined): boolean {
  return isAdmin(profile) || isCoopManagerOf(profile, coopId);
}

export function canDeleteCooperative(profile: Profile): boolean {
  return isAdmin(profile);
}

export function canAccessStaging(profile: Profile): boolean {
  return isAdmin(profile);
}

export function canAccessBocAdmin(profile: Profile): boolean {
  return isAdmin(profile);
}

export function canAccessPortal(profile: Profile): boolean {
  return !!profile?.cooperativeId;
}
