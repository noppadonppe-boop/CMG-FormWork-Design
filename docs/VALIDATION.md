# Validation evidence — current recheck 2026-10-19

- Full Vitest: **100 files / 870 tests passed**.
- `npm run typecheck` and `npm run build`: **PASS** after adding the editable Closure Pack project-input forms. Vite still reports the existing large-bundle advisory.
- `npm run test:visual`: **PASS** — 21 legacy/v0.7 A3 sheets rasterized with `@napi-rs/canvas`; this includes the eight-sheet Workflow v0.7 draft arrangement (geometry, each physical side, soffit/shoring, frame and support contacts) from one frozen Snapshot. Tahoma registered from `C:/Windows/Fonts/tahoma.ttf`.
- `npm run typecheck` and `npm run build`: **PASS**; bundle-size warning remains informational.
- Production `verify:deployment`: **PASS (14 checks)** for HTTP/SPA, five element menus, Connections, Audit, public Ringlock/Form Tie DRAFT import, editable project evidence forms, NO_GO gate, sidebar scroll rule, and the deployed v0.7 A3 drawing chunk.
- Firebase release audit: **PASS** for Hosting version `07524d0006e9ac26` (release `1792355437793000`), ten Node 22 Functions (including `saveReviewRecord`), and Firestore/Storage rule hash matches. The release deploys `984bde8f986298875c245fcba1c1094865efb792`.
- Functions emulator audit: **PASS** — 12 checks, including server-side Review transition acceptance and forged-history rejection.
- Reconciliation template audit: **PASS** with `npm run audit:reconciliation`; `--ready` mode correctly remains blocked until Owner decisions, approval metadata and a new pre-write backup are filled.
- Audit & Settings now includes an explicit per-Case reconciliation form, non-mutating JSON import/export, and readiness check; `applyToProduction` is always `false` until a separate reviewed write process is approved.
- Registry can also import the Closure Pack's 11 Form Tie and 17 Ringlock rows as DRAFT properties with no Registry limits.
- Workflow v0.7 Review step now edits, validates, saves, imports and exports the five Closure Pack project-input forms (Ringlock, soil, supporting slab, serviceability, stage release). The saved data is bound to the case Revision and included in its Snapshot; the inputs remain `NOT_VERIFIED`, do not supply solver capacities, and do not clear engineering blockers.
- Owner input is consolidated in [OWNER_INPUT_PACKET.md](./OWNER_INPUT_PACKET.md); it contains no invented engineering values and preserves the NO_GO boundary.
- Browser acceptance: **PASS** with `npm run test:browser:acceptance` against isolated emulators/Vite; it signs in, creates the mock-up project, verifies all five element menus, opens Beam/Slab/Wall, saves emulator-only drafts, checks each eight-sheet A3 output, and opens Audit. External network/404 console noise is filtered; no external AI call is made.
- Printed browser PDF pagination/fonts and the complete two-project criteria/save/reload/review E2E remain pending; raster smoke does not claim printed-PDF approval.

## Six-item closeout matrix

| ข้อ | หลักฐานปัจจุบัน | สถานะ | งานที่ยังต้องทำ |
|---|---|---|---|
| 1. Production Case relations | `F:/Downloads/CMG-002-project-backup.json`, `scripts/audit-project-backup.mjs`, `docs/CMG-002_RECONCILIATION_PROPOSAL.md` | PARTIAL | Owner ต้องเลือก mapping ของ Case ที่ชื่อ/ประเภท/ร่างชนกัน แล้วจึงเขียนกลับหลัง backup ใหม่ |
| 2. Hosting / Firebase release | `npm run verify:release` และ `npm run verify:deployment` | PASS | ไม่มีช่องว่าง release ที่ตรวจพบในรอบนี้ |
| 3. Product catalogue / Design Basis | Closure Pack templates, Ringlock/Form Tie references, Registry UI, public capture import as DRAFT | BLOCKED | ต้องเติมและ review รุ่น/ล็อต/SWL/configuration จริง, soil/young-slab basis, load basis และ acceptance criteria |
| 4. Beam / Slab / Wall primary UX | Production bundle มีเมนูองค์อาคาร 5 ระบบ, Connections, Audit; browser smoke เปิด Beam/Slab/Wall ได้ | PASS (screening UX) | ยังต้องเติมข้อมูลจริงเพื่อให้ผลพ้น `DRAFT / INCOMPLETE / NO_GO` |
| 5. Shared Design Revision / Hash | `WorkflowV07Output`, frozen v0.7 Snapshot, eight-sheet `WorkflowV07Drawings`, `ReviewPanel`, legacy title block binding | PASS (same-model report/A3 output; raster checked) | ยังต้องสร้าง/ตรวจ Review ของ Case จริงหลัง reconcile และเปลี่ยน revision |
| 6. Emulator E2E / acceptance | `npm run test:browser:acceptance` automated Playwright run covers eight-sheet output for Beam/Slab/Wall; Functions audit 12 checks; raster smoke 21 sheets | PASS (emulator flow) | Printed browser PDF pagination/fonts and full two-project lifecycle remain pending |

## Historical evidence — 2026-10-13

## Current private-cloud v0.3 phase

- `npm test`: **65 passed, 5 files** — prior regressions plus square/rectangular corner forces,
  conditional ring axial equilibrium, axial+bending screen, interaction failures and v2/v3 migration.
- Frontend TypeScript + Sites/Vite production build: **PASS**.
- `npm run build --workspace functions`: **PASS** with the shared v0.3 domain.
- `git diff --check`: **PASS**. Build still warns that the main JS chunk exceeds500kB before gzip.
- React static rendering: safe output for demand-only, selected ring, unsupported L and draft reference text;
  this is not interactive browser/mobile verification or printed-PDF visual QA.
- Owner-private audience unchanged; Firebase production/live AI remain unconnected.
- No security-rule/provider/auth changes; past Rules evidence below is historical, not a new live test.
- Every favorable numeric screen remains INCOMPLETE. Ring stability, physical joints and construction approval
  have not been verified. The18 additional passing software checks do not close these engineering gates.

See ENGINEERING_PHASE_03.md for fixtures and the conditional frame model. Square corner5kN+5kN
with Cx=Cy=8kN passes component comparisons but fails the selected linear interaction at1.25.

## Historical private-cloud v0.2 phase

- `npm test`: **47 passed, 4 files** — analytical/domain, backup migration and React static-render integration checks.
- Production build using the Sites build helper: **PASS** (TypeScript + Vite8.3.4).
- `npm run build --workspace functions`: **PASS** after fixing the domain backup import to use `.js` for NodeNext.
- `git diff --check`: **PASS**.
- Build chunk-size warning remains informational (main JavaScript chunk exceeds500kB before gzip).
- Real browser/mobile interactions and PDF pagination/fonts: **NOT RUN**; managed control-browser is unavailable.
- Security Rules/runtime/live AI tests were not repeated: no rule/authorization/provider logic changed.
  Previous results below remain historical evidence, not current live Firebase verification.
- Firebase production and AI providers remain disabled/unconnected for this static cloud trial.
- No construction acceptance/approval is implied by the 47 passing software checks.

Numerical v0.2 default fixture: F01 pmax60kPa, actual vertical span500mm,
F1 studs300mm/supports600mm, row line load30N/mm. Support loads9000/18000/18000/18000/18000/9000N;
sumP=sumR90000N, tie18kN, corner9kN, one-member alpha1 moment1,350,000Nmm.
The governing tie spans4000mm across the opposing concrete faces; Ae and SWL default unknown.
These are idealized independent pinned bays under a uniform pmax envelope, not installation coordinates.
Columns/L have only idealized corner-supported face screens and do not generate a footing through-tie design.
See ENGINEERING_PHASE_02.md for the complete mechanical contract, sources and remaining gates.

## Historical v0.1 startup validation

This report describes observed checks, not construction acceptance.

| Check | Observed result |
|---|---|
| Pure-domain analytical/unit fixtures | 19 passed |
| Firestore/Storage Emulator Rules | 7 passed |
| Frontend TypeScript + Vite build | PASS |
| Backend TypeScript compile | PASS |
| Authenticated Functions runtime integration | BLOCKED — sandbox does not permit emulator Unix socket |
| Live AI/provider drawing extraction | NOT RUN |
| Real browser/mobile UI, PDF upload/render interactions | NOT RUN |
| Printed PDF pagination/fonts/visual QA | PARTIAL — 13-sheet SVG raster smoke with Tahoma passed; browser print pagination remains NOT RUN |
| Professional formwork method validation and construction issue | NOT COMPLETE / BLOCKED |
| Transfer/start Codex on owner's PC | NOT PERFORMED — remote device Offline |

## Numerical evidence

- Footing3×4×2.5m, γ24kN/m³: pressure60kPa; volume30m³; side form35m²; face forces225/300/225/300kN.
- L section4000×3000mm with arms2000mm: area10m²; perimeter14m; volume25m³ at2.5m depth; six face resultants scalar sum1050kN. Directed forces balance independently.
- Column1×1×8m: pressure192kPa; each face resultant768kN.
- Uniform beam w10N/mm, L1000mm, E200000MPa, I1,000,000mm⁴: M1,250,000Nmm; reaction5000N; deflection0.651041667mm.
- Tie tributary screen60kPa×0.6m×0.6m=21.6kN.
- Passing numerical member screens remain INCOMPLETE because full material/component/system methods are missing.

## Security remediation

Initial Storage rules allowed an overwrite in emulator testing.
Changed source writes to require resource==null and request.resource!=null.
Final 7-rule suite passes, including source-overwrite rejection, outsider/viewer rejection,
member reads and client denial of authoritative result/role writes.

## Runtime notes

Frontend/backend builds ran on Node24.19.0. Firebase deployment manifest targets Node22;
Node22 runtime itself has not been tested in this environment.
Firebase Tools15 initially required Java21 while only Java17 was available.
Used Firebase Tools14.27.0 with Java17 to complete Firestore/Storage Rules tests.
Functions definitions loaded, but invoking a function failed because the sandbox disallows
the emulator's /tmp/fire_emu_*.sock Unix socket. No permission escalation or production fallback was used.
The original attempt also encountered a model-parameter prompt; changed configuration to
ordinary server environment with explicit DISABLED mode and a dummy local secret.
No real API key, provider call, Firebase production operation or deployment was performed.

## Limits and next actions

Use CODEX_NEXT_TASK.txt and the full Master Prompt1.1 to continue.
Run Functions integration tests on the actual authorized machine with Node22 and emulator prerequisites.
Complete browser/PDF QA and all missing engineering/source/revision/approval checks.
Do not infer a global engineering PASS from26 passing software tests or a successful build.
