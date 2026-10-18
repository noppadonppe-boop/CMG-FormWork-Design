# RC-FormWork acceptance checklist

This checklist keeps the six deployment-readiness actions repeatable. It is a screening and data-integrity gate; it does not issue construction approval.

## Before touching a project

- Export the project JSON from **สำรองโครงการ** and store it with the project revision.
- Open **Review & Issue** and resolve every `Design Case` integrity warning. A saved v0.7 draft whose element type differs from the case must be reconciled explicitly.
- Confirm that case id and case name are unique. Do not delete duplicates until the backup has been reviewed by the Owner.

```powershell
npm run audit:backup -- F:/Downloads/CMG-002-project-backup.json
```

The audit output is a proposal only. It never rewrites the backup or Production and never infers an engineering capacity.

Use [CMG-002_RECONCILIATION_PROPOSAL.md](./CMG-002_RECONCILIATION_PROPOSAL.md) to record the Owner's mapping decision before any Production write.

## Release identity

```powershell
npm run verify:deployment
npm run verify:release
git status --short --branch
git log -1 --oneline
```

Record the Firebase Hosting release id, Firestore rules version, Storage rules version, and Functions version in the same release note. The public HTML check cannot prove those four identities.

## Engineering inputs

For each case, record the Design Basis / Revision, concrete unit weight, Additional Dead Load, Construction Live Load, and the actual reviewed catalog entries for plywood, timber/steel members, Form Tie, Ringlock, shoring, braces, anchors, and bearing/support conditions. Missing evidence must remain `INCOMPLETE` or `BLOCKED`.

## Five system smoke path

1. Create or open one case each for footing, column, beam, slab, and wall.
2. Confirm geometry and units from the source drawing.
3. Enter Design Criteria and actual product evidence.
4. Run the preliminary calculation and inspect every `FAIL`, `INCOMPLETE`, and `BLOCKED` row.
5. Open A3 drawings and the A4 report. Confirm the same Design Revision, review state, and content hash are shown.
6. Submit, review, approve internally, and issue internally only when the independent-role rules allow it. `ISSUED_INTERNAL` is still `NOT FOR CONSTRUCTION`.

## Automated checks

```powershell
npm run typecheck
npm test -- --maxWorkers=1
npm run test:visual
npm run test:rules
npm run test:functions
npm run mcp:build
npm run test:closure-pack
```

When the default emulator ports are occupied, use the isolated audit ports without stopping the other suite:

```powershell
npm run test:rules:audit
npm run test:functions:audit
npm run test:closure-pack
```

For browser acceptance use the alternate Firebase emulator ports from `AGENTS.md`; do not stop the other application's default emulator suite.

When ports 8180/9250 are occupied by the other suite, use the isolated browser fixture:

```powershell
firebase emulators:start --config firebase.emulators-browser.json --project demo-cmg-formwork --only auth,firestore,storage,functions
npm run test:browser:seed
npm run dev:v07:browser
```

Open `http://127.0.0.1:6175/` (or the selected `BROWSER_VITE_PORT`), sign in with the demo credentials printed by `test:browser:seed`, and create the mock-up project. The Playwright test now edits the draft source reference to trigger the emulator-only save, opens **แปลนและรูปตัด**, and confirms eight A3 pages share the frozen Snapshot for Beam, Slab and Wall. This browser check uses emulator data only.

## Latest verification record (2026-10-18)

- Hosting version `592b723a1cbe091e` is `FINALIZED`; release `1792340126451000`; `verify:deployment` returned HTTP 2xx, the CMG Formwork title, the SPA entrypoint, the deployed v0.7 A3 drawing chunk, all five element menu labels, Connections, Audit, public and Closure Pack Ringlock/Form Tie DRAFT import, Case reconciliation import/export, NO_GO gate, and the sidebar scroll rule from deployed assets.
- `verify:release` returned `PASS`: all 10 source/deployed Functions match on Node 22, and Firestore/Storage Rules hashes match source.
- Full Vitest suite: 865 passed (including 21-sheet raster smoke with Tahoma and v0.7 same-snapshot output); Rules audit: 84 passed; Functions audit: 12 passed (including server-side Review transition and forged-history rejection); Closure Pack: 77 passed; typecheck, build and MCP build passed.
- Production smoke showed all five element menus and no console errors. The Design Case rename control rejects duplicate names, and the prefix/type mismatch warning is visible for the CMG-002 F01 case. Emulator browser acceptance then created the mock-up's 10 cases and opened Beam, Slab and Wall with `DRAFT / NO_GO` detail views. It also showed the unresolved CMG-002 case conflicts listed in [CMG-002_RECONCILIATION_PROPOSAL.md](./CMG-002_RECONCILIATION_PROPOSAL.md).
- The repeatable browser fixture and Playwright acceptance path are available through `scripts/test-browser-acceptance.mjs`; it runs only against the isolated emulator/Vite stack and verifies eight A3 snapshot-bound sheets for Beam/Slab/Wall plus Registry imports and reconciliation import/export. The reconciliation form/import/export is non-mutating and keeps `applyToProduction=false`. Printed browser PDF pagination and font embedding still need a separate acceptance check. Until Owner mapping and actual product/Design Basis evidence are recorded, the project remains `DRAFT / INCOMPLETE / NO_GO`.
