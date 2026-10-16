# Private cloud trial — 2026-10-13

Owner requested running the app on cloud after the desktop remote route was unavailable.
This authorizes a new private Sites publication and its required source sync.
It does not authorize Firebase production provisioning, paid AI requests or a construction release.

The Vite/React frontend is hosted as static assets. Backend/Firebase source remains in the repository
for later work but is not running in Sites. VITE_FIREBASE_ENABLED is forced false in this trial build.
Draft projects use browser localStorage. Full project JSON backup/import is provided for device transfer;
source PDFs/images are not included in the backup and must be reattached.

Cloud hosting and browser-local data are distinct; the app displays this clearly.
AI source parsing/proposal generation are not active on this trial.
v0.2 adds nominal paired RHS/unlipped-C waler screening, exact elastic point-load simple-bay
responses and reactions, explicit corner-vs-tie supports, and gross/net/SWL tie screens.
All construction-release blockers remain active. No verified physical continuous beam or hardware assembly
is implied by numerical beam benchmarks. New parameters migrate browser drafts and v1 backups;
new project backups use schemaVersion 2. Geometry confirmation resets on legacy migration.
v0.3 adds rectangular column corner normal loads, conditional ring axial/bending screens,
and user-entered unverified corner capacities/interaction criteria. Four-pin stability is still blocked.
Current backups use schemaVersion3 and accept v1/v2 via explicit migration.
Production builds force Firebase off; development mode can retain the explicitly configured emulator adapter.

Build/domain tests provide verification. Browser/mobile/PDF pagination QA is still unverified
because the managed control-browser capability is unavailable.
