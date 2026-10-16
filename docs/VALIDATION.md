# Validation evidence — 2026-10-13

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
| Printed PDF pagination/fonts/visual QA | NOT RUN |
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
