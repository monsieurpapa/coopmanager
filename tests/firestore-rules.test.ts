// Firestore security-rules tests for the eudrCompliance admin-only guard.
// Runs against the Firestore emulator:
//   npm run test:rules
// (wraps `firebase emulators:exec --only firestore "vitest run"`)
//
// Matrix from the 2026-07-03 eng-review test plan:
//   - coop_manager cannot ADD eudrCompliance on update
//   - coop_manager cannot CREATE a doc carrying eudrCompliance
//   - coop_manager CAN still save normal profile edits, and a full-doc save
//     that resubmits the existing eudrCompliance unchanged keeps working
//   - coop_manager cannot MODIFY or DELETE an existing eudrCompliance
//   - admin CAN write a valid eudrCompliance; malformed shapes are rejected
//   - everyone (signed-out included) can read cooperatives
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, afterAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteField,
  collection, addDoc, serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'coopmanager-rules-test';
const COOP_ID = 'coop-maendeleo';
const ADMIN_UID = 'admin-uid';
const MANAGER_UID = 'manager-uid';

const validEudr = {
  scorePercent: 100,
  totalFarms: 250,
  farmsWithGps: 250,
  oversizedFarmsMissingPolygon: false,
  computedAt: '2026-07-03T00:00:00Z',
  sourceFileHash: 'a'.repeat(64),
  sourceFileName: 'registre_maendeleo_2026-06.xlsx',
  scriptVersion: '1.0.0',
};

const baseCoop = {
  name: 'Maendeleo',
  country: 'DRC',
  members: 250,
};

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

// Seed role docs and the cooperative with rules disabled, then act as each role.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ADMIN_UID), {
      email: 'admin@example.com',
      role: 'admin',
    });
    await setDoc(doc(db, 'users', MANAGER_UID), {
      email: 'manager@example.com',
      role: 'coop_manager',
      cooperativeId: COOP_ID,
    });
    await setDoc(doc(db, 'cooperatives', COOP_ID), baseCoop);
  });
});

const adminDb = () => env.authenticatedContext(ADMIN_UID, { email: 'admin@example.com' }).firestore();
const managerDb = () => env.authenticatedContext(MANAGER_UID, { email: 'manager@example.com' }).firestore();

describe('coop_manager and eudrCompliance', () => {
  it('cannot add eudrCompliance via update', async () => {
    await assertFails(
      updateDoc(doc(managerDb(), 'cooperatives', COOP_ID), { eudrCompliance: validEudr })
    );
  });

  it('cannot create own cooperative doc carrying eudrCompliance', async () => {
    // Delete-recreate path: manager's cooperativeId already points at COOP_ID.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(ctx.firestore(), 'cooperatives', COOP_ID));
    });
    await assertFails(
      setDoc(doc(managerDb(), 'cooperatives', COOP_ID), { ...baseCoop, eudrCompliance: validEudr })
    );
  });

  it('can create own cooperative doc without eudrCompliance', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(ctx.firestore(), 'cooperatives', COOP_ID));
    });
    await assertSucceeds(setDoc(doc(managerDb(), 'cooperatives', COOP_ID), baseCoop));
  });

  it('can still save normal profile edits', async () => {
    await assertSucceeds(
      updateDoc(doc(managerDb(), 'cooperatives', COOP_ID), {
        description: 'Coopérative de café arabica du Kivu',
        members: 260,
      })
    );
  });

  it('full-doc save resubmitting an unchanged eudrCompliance keeps working', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'cooperatives', COOP_ID), { eudrCompliance: validEudr });
    });
    // Portal saves send the whole form; identical eudrCompliance must not trip
    // the guard (diff().affectedKeys() ignores unchanged fields) and must not
    // be wiped.
    await assertSucceeds(
      setDoc(doc(managerDb(), 'cooperatives', COOP_ID), {
        ...baseCoop,
        description: 'Updated by manager',
        eudrCompliance: validEudr,
      })
    );
  });

  it('cannot modify an existing eudrCompliance', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'cooperatives', COOP_ID), { eudrCompliance: validEudr });
    });
    await assertFails(
      updateDoc(doc(managerDb(), 'cooperatives', COOP_ID), {
        eudrCompliance: { ...validEudr, scorePercent: 42 },
      })
    );
  });

  it('cannot delete an existing eudrCompliance', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'cooperatives', COOP_ID), { eudrCompliance: validEudr });
    });
    await assertFails(
      updateDoc(doc(managerDb(), 'cooperatives', COOP_ID), { eudrCompliance: deleteField() })
    );
  });
});

describe('admin and eudrCompliance', () => {
  it('can write a valid eudrCompliance', async () => {
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'cooperatives', COOP_ID), { eudrCompliance: validEudr })
    );
  });

  it('can create a new cooperative doc carrying a valid eudrCompliance', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'cooperatives', 'coop-new'), { ...baseCoop, eudrCompliance: validEudr })
    );
  });

  it('cannot create a doc carrying a malformed eudrCompliance', async () => {
    await assertFails(
      setDoc(doc(adminDb(), 'cooperatives', 'coop-new'), {
        ...baseCoop,
        eudrCompliance: { ...validEudr, sourceFileHash: 'short' },
      })
    );
  });

  it('rejects a hash that is not 64 chars', async () => {
    await assertFails(
      updateDoc(doc(adminDb(), 'cooperatives', COOP_ID), {
        eudrCompliance: { ...validEudr, sourceFileHash: 'abc123' },
      })
    );
  });

  it('rejects farmsWithGps greater than totalFarms', async () => {
    await assertFails(
      updateDoc(doc(adminDb(), 'cooperatives', COOP_ID), {
        eudrCompliance: { ...validEudr, farmsWithGps: 999 },
      })
    );
  });

  it('rejects a missing required key', async () => {
    const { scriptVersion: _omitted, ...missingKey } = validEudr;
    await assertFails(
      updateDoc(doc(adminDb(), 'cooperatives', COOP_ID), { eudrCompliance: missingKey })
    );
  });

  it('rejects scorePercent outside 0-100', async () => {
    await assertFails(
      updateDoc(doc(adminDb(), 'cooperatives', COOP_ID), {
        eudrCompliance: { ...validEudr, scorePercent: 101 },
      })
    );
  });

  it('rejects an extra key smuggled inside the map (hasOnly)', async () => {
    await assertFails(
      updateDoc(doc(adminDb(), 'cooperatives', COOP_ID), {
        eudrCompliance: { ...validEudr, injected: true },
      })
    );
  });
});

describe('leads (buyer sample requests)', () => {
  const validLead = {
    coopId: COOP_ID,
    coopName: 'Maendeleo',
    buyerName: 'Jane Buyer',
    company: 'EU Coffee Imports BV',
    country: 'Netherlands',
    interest: 'sample',
    quantityKg: '60',
    message: 'Interested in a washed arabica sample.',
    createdAt: serverTimestamp(),
    status: 'new',
  };

  it('signed-out visitor can create a valid lead (public form)', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, 'leads'), validLead));
  });

  it('rejects a lead with extra keys (open endpoint stays shape-locked)', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, 'leads'), { ...validLead, role: 'admin' }));
  });

  it('rejects a lead born with status other than new', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, 'leads'), { ...validLead, status: 'approved' }));
  });

  it('rejects a lead missing required contact fields', async () => {
    const db = env.unauthenticatedContext().firestore();
    const { buyerName: _omit, ...missing } = validLead;
    await assertFails(addDoc(collection(db, 'leads'), missing));
  });

  it('signed-out visitors and managers cannot read leads; admin can', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'leads', 'lead-1'), { ...validLead, createdAt: null });
    });
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'leads', 'lead-1')));
    await assertFails(getDoc(doc(managerDb(), 'leads', 'lead-1')));
    await assertSucceeds(getDoc(doc(adminDb(), 'leads', 'lead-1')));
  });
});

describe('staging_cooperatives create (managerEmail hardening)', () => {
  const UPLOADER_UID = 'uploader-uid';
  const uploaderDb = () =>
    env.authenticatedContext(UPLOADER_UID, { email: 'uploader@example.com' }).firestore();
  const validStaging = {
    data: { name: 'Nouvelle Coop' },
    status: 'pending',
    uploadedBy: UPLOADER_UID,
    createdAt: serverTimestamp(),
  };

  it('any authenticated user can stage a doc without managerEmail', async () => {
    await assertSucceeds(addDoc(collection(uploaderDb(), 'staging_cooperatives'), validStaging));
  });

  it('accepts a well-formed managerEmail and the empty string', async () => {
    await assertSucceeds(
      addDoc(collection(uploaderDb(), 'staging_cooperatives'),
        { ...validStaging, managerEmail: 'manager@cooperative.com' })
    );
    await assertSucceeds(
      addDoc(collection(uploaderDb(), 'staging_cooperatives'),
        { ...validStaging, managerEmail: '' })
    );
  });

  it('rejects a malformed managerEmail', async () => {
    await assertFails(
      addDoc(collection(uploaderDb(), 'staging_cooperatives'),
        { ...validStaging, managerEmail: 'not-an-email' })
    );
  });

  it('rejects an oversized managerEmail', async () => {
    await assertFails(
      addDoc(collection(uploaderDb(), 'staging_cooperatives'),
        { ...validStaging, managerEmail: `${'a'.repeat(250)}@example.com` })
    );
  });

  it('rejects extra top-level keys (shape lock)', async () => {
    await assertFails(
      addDoc(collection(uploaderDb(), 'staging_cooperatives'),
        { ...validStaging, eudrCompliance: validEudr })
    );
  });

  it('rejects uploadedBy pointing at someone else', async () => {
    await assertFails(
      addDoc(collection(uploaderDb(), 'staging_cooperatives'),
        { ...validStaging, uploadedBy: 'another-uid' })
    );
  });
});

describe('users cooperativeId (invite claim is the only self-service path)', () => {
  const PLAIN_UID = 'plain-user-uid';
  const PLAIN_EMAIL = 'invitee@example.com';
  const plainDb = () =>
    env.authenticatedContext(PLAIN_UID, { email: PLAIN_EMAIL }).firestore();

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', PLAIN_UID), {
        email: PLAIN_EMAIL,
        role: 'user',
      });
    });
  });

  it('owner cannot self-assign cooperativeId alone', async () => {
    await assertFails(
      updateDoc(doc(plainDb(), 'users', PLAIN_UID), { cooperativeId: COOP_ID })
    );
  });

  it('owner can still edit plain profile fields', async () => {
    await assertSucceeds(
      updateDoc(doc(plainDb(), 'users', PLAIN_UID), { displayName: 'Invitee' })
    );
  });

  it('invite claim works when the cooperative names their email', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'cooperatives', COOP_ID), {
        managerEmail: PLAIN_EMAIL,
      });
    });
    await assertSucceeds(
      updateDoc(doc(plainDb(), 'users', PLAIN_UID), {
        role: 'coop_manager',
        cooperativeId: COOP_ID,
      })
    );
  });

  it('invite claim fails when the cooperative names a different email', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'cooperatives', COOP_ID), {
        managerEmail: 'someone-else@example.com',
      });
    });
    await assertFails(
      updateDoc(doc(plainDb(), 'users', PLAIN_UID), {
        role: 'coop_manager',
        cooperativeId: COOP_ID,
      })
    );
  });
});

describe('public read', () => {
  it('signed-out visitors can read a cooperative (badge is public)', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'cooperatives', COOP_ID)));
  });
});
