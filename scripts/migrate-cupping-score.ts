/**
 * Migration: averageCuppingScore → selfReportedCuppingScore
 *
 * Renames the field on every document in /cooperatives.
 * Uses firebase-admin to bypass Firestore security rules.
 *
 * SETUP (one-time):
 *   1. npm install -D firebase-admin
 *   2. Firebase console → Project Settings → Service accounts → Generate new private key
 *   3. Save the JSON file locally (DO NOT commit it)
 *   4. export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *
 * USAGE:
 *   Dry run (default — shows what would change, writes nothing):
 *     npx tsx scripts/migrate-cupping-score.ts
 *
 *   Actually write changes:
 *     npx tsx scripts/migrate-cupping-score.ts --write
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DRY_RUN = !process.argv.includes('--write');
const PROJECT_ID = 'gen-lang-client-0714583331';
const DATABASE_ID = 'ai-studio-14c609dd-33fb-4bba-9fcb-670d1a1a61df';
const OLD_FIELD = 'averageCuppingScore';
const NEW_FIELD = 'selfReportedCuppingScore';

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"');
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
  }

  const db = getFirestore(PROJECT_ID, DATABASE_ID);
  const snapshot = await db.collection('cooperatives').get();

  if (snapshot.empty) {
    console.log('No documents found in /cooperatives. Nothing to migrate.');
    return;
  }

  let needsMigration = 0;
  let alreadyMigrated = 0;
  let skipped = 0;
  const toMigrate: { id: string; oldValue: number }[] = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const hasOld = OLD_FIELD in data;
    const hasNew = NEW_FIELD in data;

    if (!hasOld && hasNew) {
      alreadyMigrated++;
    } else if (!hasOld && !hasNew) {
      skipped++;
    } else if (hasOld) {
      needsMigration++;
      toMigrate.push({ id: docSnap.id, oldValue: data[OLD_FIELD] });
    }
  }

  console.log(`\n/cooperatives — ${snapshot.size} documents`);
  console.log(`  Already migrated (has ${NEW_FIELD}): ${alreadyMigrated}`);
  console.log(`  Needs migration  (has ${OLD_FIELD}): ${needsMigration}`);
  console.log(`  Neither field    (no score):         ${skipped}`);

  if (needsMigration === 0) {
    console.log('\nAll done. Nothing to migrate.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — no writes. Documents that would be migrated:');
    for (const { id, oldValue } of toMigrate) {
      console.log(`  ${id}: ${OLD_FIELD}=${oldValue} → ${NEW_FIELD}=${oldValue}`);
    }
    console.log('\nRun with --write to apply changes.');
    return;
  }

  // Write in batches of 500 (Firestore WriteBatch limit)
  const BATCH_SIZE = 500;
  let written = 0;

  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toMigrate.slice(i, i + BATCH_SIZE);

    for (const { id, oldValue } of chunk) {
      const ref = db.collection('cooperatives').doc(id);
      batch.update(ref, {
        [NEW_FIELD]: oldValue,
        [OLD_FIELD]: FieldValue.delete(),
      });
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  Committed batch: ${written}/${toMigrate.length} documents`);
  }

  console.log(`\nMigration complete. ${written} documents updated.`);
  console.log(`  ${OLD_FIELD} removed, ${NEW_FIELD} set.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
