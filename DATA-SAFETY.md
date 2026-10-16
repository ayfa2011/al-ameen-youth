# Firebase data safety and release process

## Data ownership

- Firebase Realtime Database is the live source of truth. Google Sheets are not an automatic mirror or recovery source.
- `syncAllToFirebase()` intentionally throws. Do not re-enable it or use a broad Sheet-to-Firebase `set()`; migrations must be scoped, ID-based, and verified in staging first.
- UI markup and styles must not write Firebase data. Keep Firebase mutations in the feature data modules and use the audited write helpers in `js/firebase-data.js`.
- Reference-only records (office bearers, finance reports, assets, historical rentals, and blood groups) are read-only to website users. Change them through a controlled migration with a verified backup.
- Deletion in the website means hiding a record with `deleted: true` or deactivating a member. Do not call Firebase `remove()` or delete Drive/Sheet rows for normal user actions. Restore controls are available to officials for soft-deleted records.

## Before changing or publishing

1. Use a separate Firebase staging project and a matching staging Apps Script deployment. A custom token issued for production cannot authenticate to staging.
2. For local development, copy `js/firebase-config.local.example.js` to the ignored `js/firebase-config.local.js`, fill it with staging-only Firebase settings and the staging Apps Script `/exec` URL. Localhost refuses to initialize if the staging project or URL is missing or points to production.
3. Use synthetic records in staging. Verify sign-in roles, reads, valid and invalid writes, soft delete/restore, concurrent edit rejection, atomic payment history, report export filtering, photo retry behavior, and audit entries.
4. Remove test records from staging after the test. Never create test records in the production project.
5. Publish and verify the staged website and database rules before promoting the reviewed files to production. A GitHub Pages push does not deploy Firebase rules or Apps Script.

## Backups and recovery

- `backupFirebaseDatabaseToDrive()` creates a timestamped full Realtime Database JSON snapshot in the script owner's Drive (or the folder named by `FIREBASE_BACKUP_FOLDER_ID`). It refuses to save an empty database response.
- In the production Apps Script, run `setupNightlyFirebaseBackupTrigger()` once from the editor and grant the requested Drive/UrlFetch permissions. Confirm the first backup file appears in the restricted backup folder and check Apps Script **Executions** for failures.
- Restrict Drive backup-folder access: snapshots contain member and donation information. Periodically verify a snapshot by importing it into staging and comparing record counts and sample records. Never test restore against production.
- Keep multiple dated snapshots. Do not replace the only verified snapshot with a new one.

## Firebase rules and audit history

- Deploy `firebase/firebase-database.rules.json` explicitly with `firebase deploy --only database --project <project-id>` after validation in staging.
- Rules require an authenticated role, limit official write access, validate core record shapes, and make `/auditLog` append-only for officials. Audit entries contain action/path/record IDs and timestamps, not record contents.
- Some transaction-based mutations append their audit entry immediately after the business transaction. If audit logging fails, the successful data mutation is preserved and the failure is logged to the browser console; inspect `/auditLog` when reconciling an incident.

## Release rollback

- Roll back website code with a new Git revert commit; do not rewrite shared history.
- Before restoring data, restore the dated JSON backup into staging and verify it. Production data restoration is a separate, deliberate operation and must never be used as a website-code rollback.
- Do not claim a release is launch-ready until the staging Firebase project, matching staging Apps Script deployment, rule tests, backup verification, and role-based website checks have all passed.
