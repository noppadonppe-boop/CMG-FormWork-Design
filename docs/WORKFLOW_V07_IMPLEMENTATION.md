# Workflow v0.7 — local development preview

Date: 2026-10-15 (Asia/Bangkok). Status: DRAFT / NO_GO / NOT FOR CONSTRUCTION.

Current workflow engine: `0.7.0-preview.30`. Preview.30 adds `COUPLED_TIE_FRAME_SUPPORTS`: a waler-level
compatibility solve in which every actual support moves together with tension-only tie springs
(user E·A/L), the exact linear frame flexibility at mapped nodes (plus the frame's displacement under
its other actions) and user-declared isotropic corner-connector springs joining rail ends at shared
vertices; rails are re-analysed with the compatible support movement and the solved frame is checked to
reproduce it. Unrestrained net forces are rejected instead of guessed. Side-form stability is gated on
an explicit lateral frame-node action in the same case plus the second-order path.
Earlier preview text: it adds exact governing stations (including one-sided
segment locations at discontinuities) and explicit, review-evidence-gated 1D flexure/shear/SLS limit
comparisons for beam/slab joists and bearers and for wall/side studs, shared waler rails and paired
independent rails. Preview.29 adds per-1000 mm side plywood strip limit screens, a per-face local
ledger (stud↔rail bearing, support-plate bearing, waler-support connection, stud/rail lateral
buckling with declared unbraced-length scope, rail-end corner opening), and a mixed side topology in
which balanced, collinear tie routes keep their supports while every untied support is handed one way
to a downstream frame. At face level, corner ends stay free; corner force transfer exists only in
the preview.30 coupled model.
Missing or incompatible evidence remains INCOMPLETE;
SCREENED is not construction approval. Existing revision-scoped contract overlays cover Ringlock
assembly, head-bearing, support-contact and Stage-release calculations alongside the iterative
P–Delta screening path, structured member N–M–V–T demand ledger, and user-supplied resistance and SLS
evidence gates. Measured U-head opening,
real bearer-seat geometry and one-way conditional contact demands remain explicit. Each actual head retains its own bearer support,
force, moment, Stage/case and upstream revision. Measured contact must fit both the actual plate
and bearer face/ends, with separately declared side clearances. Flat contact cannot substitute for
coupled multiple rails or a curved tube/saddle model. All geometry, product and contact-law evidence
remains unverified draft data; no default strength, clearance, friction or restraint is introduced.
The owner confirmed that support Design Basis / soil / young-slab documents are unavailable.
All current results remain DRAFT / NO_GO.

The complete suite with `npm test -- --maxWorkers=4` reports **688 passing and 5 failing tests out
of 693**, with eight unhandled errors from the retained misspelled `reject` assignment in
`tests/source-upload.test.tsx:21`. The actual identifier is `rejecnืt`, containing Thai U+0E37;
its pre-edit hash is unchanged. The owner requested preserving and reporting this issue.
The initial complete run also failed the old explicit component-count assertion, which omitted
new head-bearing requirements. That assertion now includes them and independently checks exactly
one SOFFIT-08 row for every actual head in every case. The focused load-case file passes 17/17;
the final complete run has only the owner-retained upload failures. Both root logs are preserved.
Worker count is limited on the command line following prior preview timeout evidence; no test
configuration, timeout threshold or upload-test assertion was changed.
The new head-bearing tests pass all **25 tests in two files**. Preview.21 adds bounded second-order
domain and workflow coverage; its focused frame/second-order set passes **25/25 tests in three
files**. Preview.22 adds the member demand ledger; Preview.23 adds the resistance evidence gate;
Preview.24 adds the SLS evidence gate; Preview.25 adds the contract audit; Preview.26 adds
revision-scoped assembly/head/support/Stage contract overlays; the current focused
frame/demand/resistance/SLS/contract/support/head/UI set passes **93/93 tests in ten files**. Typecheck, app build, Functions
build, MCP build, direct local MCP smoke and compiled NodeNext module imports pass. These are
software checks, not engineering acceptance. Command evidence:
`artifacts/workflow-v07-preview26-verification.json`, `artifacts/workflow-v07-preview26-source-hashes.json`,
and the earlier preview records below. Earlier preview records are historical.

Preview.26 keeps the ephemeral frame-analysis identity intact while enriching the twelve-row contract
audit after support/head-bearing evaluation. `JACK_HEAD_BASE` records actual assembly and head-seat
entities and carries the existing geometry/contact issues; `SUPPORT_CONTACT` records actual base and
interface entities and carries the signed base-to-support transfer issues. Both remain `INCOMPLETE`
when resistance, soil/slab or connection evidence is absent. When a Stage study exists,
`STAGE_RELEASE` records the captured Stage IDs and evidence in each active/stage audit with the same
input Revision/Stage/Case identity. These overlays do not convert `BLOCKED` or `SCREENED` into PASS,
do not add capacities, and keep `constructionRelease: NO_GO`.

The owner approved source changes after the read-only audit. The application package and legacy
calculation engine remain v0.3; v0.7 is the workflow contract version. No Firebase configuration,
rules, permissions, callable API, MCP registration/tool source, production data or deployment changed.
No dependency was installed. No live application/provider or engineering software was opened.

## Isolation and preservation

- `src/domain/index.ts`, `mechanics.ts`, `columnYoke.ts`, `scene.ts` and backup migration are unchanged.
- The new implementation lives in `src/domain/workflowV07/`; the legacy API is adapted explicitly.
- `src/main.tsx` only adds a lazy-loaded preview panel to Overview. Existing project/case data is
  copied into a private in-memory draft; edits do not save back through the legacy project state.
- `VITE_WORKFLOW_V07_ENABLED` must equal the string `true`. It is absent/off by default.
  The gate also requires Firebase to be disabled or explicitly using emulators. It refuses Firebase
  production even if the flag is enabled. The current `.env` was not modified.
- To review later in an authorized local environment, disable Firebase for that environment and
  explicitly enable the flag, or use an already configured emulator environment. This change did
  not start either environment.
- Original files and a source-hash inventory were captured under
  `artifacts/workflow-v07-baseline-802c7053/` before editing. This source copy still has no `.git`;
  no branch/commit/remote claim is made.

## Files and behavior

| Module | Implemented scope | Limits |
|---|---|---|
| `common.ts` | Explicit finite numbers, units, canonical JSON, cloning/freezing | Rejects undefined/NaN/Infinity; mass is not force |
| `geometry.ts` | Physical faces and opposing scanline regions from simple orthogonal polygons; interval coverage; basic orthogonal tie paths/crossings | No holes, varying heights, diagonal edges or construction tie placement; no mirror-analysis approval |
| `loads.ts` | Separate synthetic slab/beam service-load arithmetic; ownership ledger checks including overlapping rectangular concrete regions with different IDs | No code combinations, general polygon overlap, automatic self-weight, vertical-to-lateral conversion or full line/point load mapping |
| `caseFactors.ts` | Nine explicit, nullable action coefficients and declared SERVICE/FACTORED case basis; signed vector/imposed-movement reversals | No standard/code presets, unknown-to-zero/one conversion or engineering approval; physical source magnitudes must still be known |
| `loadCases.ts` | Up to eight authored same-stage cases, explicit shared-layout scope, complete source-to-member reanalysis, per-case required inventory and stale/frozen identity | Different construction stages/topologies/restraints require independently authored layouts; no automatic combination completeness, response envelope, nonlinear or settlement/contact coupling approval |
| `stageStudy.ts` | Up to six independently captured physical Stage inputs; source provenance, shared final-geometry/basis checks, independent Stage/case reanalysis, namespaced actual coverage, private editor restore/copy and explicit layout removal | Independent static studies only; no previous force/state carry-over, concrete-age model, automatic transition validation, reshoring redistribution or construction-sequence approval |
| `spatialLoads.ts` | Explicit complete-for-stage surface replacement; actual placed concrete depths and rectangular DL/LL/placement/other patches; direct on-analysis-line point/line member loads; ownership, raw/applied values, per-category force and first moments | No unknown-to-zero/full-strip fallback, automatic plywood point-load width, eccentricity/impact/lateral conversion, construction history or bearing/resistance approval |
| `sidePressure.ts` | Independent complete per-face normal-outward pressure sources: local hydrostatic heads and cited linear-Z lateral/wind/placement patches; actual partial-X endpoint plywood analyses, affine-Z stud transfers, ownership and source/face force/first-moment checks | One-way simply spanning strips on rigid stud lines; no invented pressure method, vertical-load conversion, inward/suction/contact-loss model, two-way/shear/connection resistance or geometry-to-placement inference |
| `tieDossier.ts` | Authored segmented Inner/Outer product/limit-state records, immutable originals under numeric Custom history, current physical/product-geometry binding, individual thread/engagement screens and distinct At/EA body indicators; source-preserving legacy migration and product-template copy | Declared data remains unverified; no catalogue/strength defaults, thread stripping/plate/waler resistance, BOM quantities, cut lengths, total wall/assembly movement or construction approval |
| `catalogues.ts` | Reference/Custom snapshots; partial numeric material overrides preserve other properties; strict reconstruction of imported snapshots; cm-to-mm section conversion and principal-axis selection; steel thickness bands | Unknown/quarantined/inherited-unreviewed sections cannot silently become selectable; source metadata/identity cannot be overridden; no timber/plywood resistance rule pack |
| `elasticBinding.ts` | Captured section/material Standard/Custom records, explicit source axis and E key, role/family/product compatibility, measured timber geometry and actual E/I inputs to side/soffit members | Elastic inputs only; no stock/material/service certification, resistance, derived weight, frame binding or per-member soffit overrides; plywood has its own module |
| `plywood.ts` | Product-specific directional bending E/full gross strip convention, exact thickness match, actual span/Y-zone analyses retaining each rectangular X load patch, unequal support reactions and signed reaction-to-joist transfer with force/first-moment balance | One-way simple strips only; no two-way/continuous/cantilever panels, point-load spreading width, shear-deformation or resistance; explicit source/service/axis evidence does not certify actual stock |
| `beam.ts` | Prismatic Euler–Bernoulli stiffness analysis, actual supports, continuous spans, point and linear patch loads, overhangs/fixed ends, exact response polynomials and stationary points; governing absolute M/V/deflection values with station and one-sided segment at discontinuities; explicit user-reviewed flexure/shear limits and service deflection criteria; force/moment residuals; captured actual analysis inputs including transferred loads | First order, small deflection, constant EI, rigid vertical supports with zero or explicitly prescribed translation (benchmarked against 6EIδ/L³), no springs, joint slip, shear deformation, member bearing/local buckling, connection or system strength checks |
| `sidePanel.ts` | Legacy one-way hydrostatic or explicitly declared per-face pressure; actual plywood reactions feed studs for explicit fields, each waler level and two independent rails with separate per-level E/I/shares; full combined support demands and both first moments | Declared uniform rail sharing only; not verified plate/contact stiffness, plywood strength, corner, opposed tie or whole-system design |
| `walerPair.ts` | Two distinct physical rail definitions per waler level, nullable geometry/fitting data, actual splice/continuity declarations and necessary tie/plate dimensional screens | No composite action, automatic stiffness-derived sharing, splice stiffness, contact/plate resistance or geometric fitting approval; successful envelope screens remain BLOCKED |
| `sideLayout.ts` | Actual physical face/stud/waler/support coordinates, independent level supports, plywood strip demand, tied endpoint routing/equilibrium, serial assembly demand binding and actual required-check generation | Hydrostatic service scenario only; edge-supported simply spanning plywood; stud/rail/plywood-strip and local limits are reviewer-supplied evidence screens only; no capacity is derived; corner hardware force transfer and system stability are not modeled; mixed tie/frame supports are one-way without tie elongation/frame displacement compatibility; no clamp/ground-brace system substitute or favorable capacity/release claim |
| `sideLocalChecks.ts` | Per-face demands from actual rail analyses: each stud↔rail contact force, each rail support reaction (plate bearing), each level support total (connection), stud/rail maximum moment with actual unsupported span (lateral buckling), rail-end deflection at face ends (corner opening, SLS); one reviewer limit per kind bound to the face's current stud/rail/pair definitions | Contact reversal is blocked; buckling requires declared unbraced-length scope; corner ends are analysed as free so only opening is screened; system stability requires lateral actions and a bracing frame |
| `sideFrameTransfer.ts` | Yoke/ground-braced one-way support handoff, and `MIXED_TIED_AND_FRAME_SUPPORTS`: ties must have equal, nonnegative, moment-free, collinear end demands; tied supports cannot also be mapped; every untied support must map to a frame node; force/moment closure includes tied pairs | One-way modes only: no tie elongation or frame displacement feedback (use the coupled mode); corner/clamp/anchor resistance unverified |
| `sideCoupled.ts` | `COUPLED_TIE_FRAME_SUPPORTS`: unknown outward support/corner-end displacements and rigid rail axial motion; rail stiffness from unit support-movement analyses; tension-only tie active set; mixed frame-flexibility rows; corner connector forces, balanced rail axial forces, coupled tie forces and re-analysed rails with resistance screens; support, global force/moment and frame-compatibility closure; reviewer limits for connector/rail axial/tie forces bound to the declared stiffness data | Stud→waler transfer still uses rigid supports; rails axially rigid and paired rail ends move together; linear springs without slip, gap, pretension or rotation; frame engages only the face-normal direction at coincident nodes; rigid modes with self-equilibrated load are pinned to zero and reported; unbalanced load on a mechanism is rejected |
| `loadPath.ts` | Explicit joist→bearer→individual U-head/ground links, physical XY placement, revision checks and transferred reactions | No ledger substitution, frame solver or uplift/moment transfer shortcut; header/contact geometry and connection verification still required |
| `soffit.ts` | Rectangular one-way beam/slab candidate; optional actual plywood strip reactions feed joists, bearers and individual heads; explicit complete per-head base datums or shared base; separate concrete/DL/LL and owned plywood/member self-weight; force/moment closure; optional source-reviewed 1D evidence for joist/bearer M/V/deflection | Beam axis X, joists Y, bearers X; common head analysis plane; explicit simple panel joints at each joist, no panel overhangs; automatic material capacities are not derived |
| `assemblies.ts` | Segmented Inner/Outer tie assembly completeness, common load basis, full serial force, engagement and numerical capacity comparison | No product certification or thread/plate/local resistance engine; favorable numbers remain BLOCKED |
| `ringlock.ts` | Installed-height arithmetic, brace label compatibility, matching configuration/basis prerequisites, individual head demands | No manufacturer ratings added; no 3D/second-order frame, node, brace, foundation or global stability verification; missing reactions remain null |
| `ringlockAssembly.ts` | Per-leg seven-term installed closure, independent jack installed/extension/engagement fields, measured standard rises and spigot gap/insertion closure, exact source coordinates, component graph validation and actual component requirements | Geometry only; no stock certification, minimum spigot insertion rule, real jack/splice stiffness, joint/contact/ground resistance or system approval; no hidden tolerance snapping or inferred catalogue extensions |
| `ringlockResearch.ts` | Explicit product-group/role/section/material/elastic reference snapshots; gross CHS property consistency; exact module-label comparison | Feedstock strengths and nominal tube properties do not certify finished stock, nodes, braces or a system rating; no defaults or cross-supplier section fallback |
| `frameLinear.ts` | First-order 3D beam-column/axial-bar/linear six-DOF joint-spring demand core, actual local axes, prescribed boundaries, force/couple/offset actions and equilibrium | No geometric second order, material/member resistance, joint slack/nonlinearity, warping or manufacturer/system approval |
| `frameSecondOrder.ts` | Explicit nodal imperfection records, bounded signed P–Delta geometric stiffness iteration in both beam bending planes, tangent stability/convergence and first/second-order axial comparison | Nodal imperfection only; no distributed crookedness, contact/uplift/sliding or joint nonlinearity, member/connection/system resistance, rating or construction approval |
| `frameDemands.ts` | Current linear member end actions and N–M–V–T envelopes, role-to-check mapping, optional second-order axial comparison, same revision/Stage/case identity and explicit evidence-gated resistance checks | No inferred member/connection resistance, second-order end bending/shear reconstruction, PASS or construction approval; reviewed rows remain screening only |
| `resistanceEvidence.ts` | Strict per-quantity N/N·mm evidence records, action/resistance-basis compatibility, source/revision/review references, explicit `INCOMPLETE`/`SCREENED`/`FAIL` comparison and no characteristic/test conversion | User must provide the actual rule-pack record and review; no product defaults, stage/case inference, authority or construction release |
| `frameSls.ts` | Per-node translation/rotation demand records with explicit service limit evidence, unit/source/revision/review checks and `INCOMPLETE`/`SCREENED`/`FAIL` results | No default deflection/settlement limit, support feedback, code interpretation or construction release; unknown rotations stay unknown |
| `contractAudit.ts` | Twelve-row `ringlock-analysis-contract-1.0` audit keyed to one input Revision/Stage/Case; preserves explicit entities, missing inputs, blockers and known FAIL/SCREENED states; overlays later assembly/head/support/Stage results without changing identity | Contract rows are coverage gates only; missing Ringlock ratings, joint laws, support basis and Stage release remain `INCOMPLETE`/`NO_GO`; no capacity or confirmation is inferred |
| `frameLoadTransfer.ts` | Recomputes upstream soffit reactions, verifies completeness/coordinates/revision and maps individual signed forces and bearer moments to actual frame nodes with offsets | Requires originating stage/load case and explicit physical head/rigid-transfer assumptions; no contact or bearing verification |
| `frameWorkflow.ts` | Strict nullable draft graph, explicit authored assembly-to-component geometry, actual node/member/joint/action definitions, same-stage/case head transfer, explicit SERVICE/FACTORED demand basis, optional same-revision P–Delta screening, source/revision invalidation, role-specific required checks and frozen results; preserves produced-frame identity when a later contract overlay is attached | UNKNOWN is not zero; no inferred properties/fixities/springs, P–Delta remains a demand screen; full installed bracing/contact/support models, ratings and engineering validation required |
| `frameBinding.ts` | Captured research or supplier straight-CHS geometry, original/edit replay, explicit separate E/G hypothesis and per-member resolved A/I/J in the frame input | Only Standard/Ledger/Brace straight gross segments; no jack/spigot/end/joint properties, automatic weight, finished-product certification or rating |
| `coverage.ts` | Coverage by member/check/load case/revision; explicit applicability equality and N/A evidence | Caller must supply the authoritative required-member/check set; strings are not trusted engineer review |
| `coverageReview.ts` | Complete generated requirement matrix, draft representative/N/A groups, strict exact-applicability or local same/reversed 1D input comparison, unknown/duplicate/stale target diagnostics | All representative results and N/A claims remain unverified; a numerical 1D match does not establish physical mirror, material/resistance, contact, connection or bracing applicability |
| `model.ts` | Schema, explicit legacy adapter, null unknowns, new draft revision IDs and invalidation of applicability/review; maps actual assembly/head-bearing/support results and captured Stage IDs into the contract audit | No silent migration or reinterpretation of footing ties as column clamps; all engineering release remains blocked |
| `snapshot.ts` | Frozen model+reference+preview content, SHA-256, deterministic content identity, stale detection and integrity/recompute checking | Local draft integrity only; a hash or typed review field is not backend authority |

`WorkflowV07Panel.tsx` provides five element-type choices, geometry/pair diagrams, explicit nullable
DL/LL inputs, reference selection, numeric Custom with reason/evidence, and a bound draft
report/drawing/JSON export. Original/effective reference values stay separate. Changing the selected
product clears Custom. Any changed draft or unapplied coordinate edit disables the old download.
`SoffitLayoutEditor.tsx` now authors actual rectangular one-way beam/slab candidates and their
owned load ledger. Stage, load case, ownership/source evidence, all physical endpoints, bearing
lines, head stations, stiffness/axis evidence, component self-weight and analysis/base elevations
must be supplied explicitly. Empty stiffness/weight inputs remain unknown; no test fixture is
inserted into the UI. The selected Ringlock module remains a geometric reference. Physical head
coordinates are supplied separately; mismatched spacings remain a configuration blocker.
Complete Ringlock assembly/height/bracing authoring and full product tie-assembly UI are still pending.
The side face/member/tie-route editor is implemented in preview.4 as described below.
AI extraction continues through the existing draft workflow; no new AI optimizer/provider call
was added. Authoring a candidate does not save to the legacy project or Firebase.

The frozen draft includes the exact selected catalogue records and applicable check specifications.
The report lists missing required specifications instead of treating the 62 definitions as 62
completed checks. The draft diagram depicts pair corridors, not approved tie routes or installation
details. Actual analysis members, when supplied to the domain model, use unchanged node coordinates;
the legacy display offsets are not imported into these analysis results.

## Continuation: actual soffit analysis (preview.2)

`SoffitResults.tsx` draws the exact member/head XY geometry and tabulates individual signed head
reactions, node coordinates, source members, concrete/DL/LL/component self-weight totals and
force/first-moment residuals. Frozen reports use only their snapshot's model and recomputed
preview. This is an analysis plan, not an installation drawing. Joist and bearer analysis nodes
share one idealized horizontal plane; real section depths, seating, engagement, offsets,
head/base installed-height closure and bearing compatibility require separate verification.

For slabs, `gamma * thickness` acts on the declared rectangular concrete footprint. For
monolithic beams, the downstand `gamma * (h-t)` over the actual beam width and slab
`gamma * t` over the owned Bc strip are separate patches. Bc includes the beam; DL and LL use
their own explicit widths and Y origins. No beam/slab area outside that owned strip is inferred.
This is a single element/owned-strip draft; project-wide multi-element ownership reconciliation
is not implemented. Actual joist/bearer self-weights are applied exactly once from explicit kN/m
values, including explicit zero only when provided. Plywood, hardware and Ringlock weights,
equipment/placement loads, wind, load combinations and stage envelopes remain incomplete;
separate evidence and load entries are required before any complete system calculation.

Midpoint strip reactions assume transverse simply spanning panel strips with joists on both
concrete X edges. Unsupported panel cantilevers are rejected because silently assigning their
loads to the nearest joist would lose the global first moment. Physical joist/bearer ends and
overhangs remain explicit and are analyzed. Uplift/moment transfer to another member is rejected;
terminal uplift is retained as a blocked signed nodal demand, not averaged away.

Candidate members/actions/legs/required checks are deterministically regenerated for validation.
Editing geometry, loads, the revision or the generated graph invalidates old analysis. Users must
explicitly analyze the candidate again. Unapplied layout edits immediately disable freeze/export,
including when an older snapshot is visible. Actual member/check/load-case/revision requirements
are generated without adding favorable coverage results. Panel/side/connection requirements not
modeled remain listed as unassigned. This continuation introduced `0.7.0-preview.2`; the updated
Ringlock integration introduced preview.3, followed by side-layout preview.4 and frame integration preview.5. Older frozen previews
remain original artifacts but must be recalculated and frozen again to view with this engine.

## Updated Ringlock research integration (preview.3)

At the owner's instruction, the updated local file
`artifacts/ringlock-research-2026-10-15/ringlock-reference-data.json` was copied byte-for-byte to
`src/reference/workflow-v07/ringlock-research-2026-10-15.json`. SHA-256:
`7ce08c7280340a1ab748746bb7a973cf3724fb66bdf7def1d1a9e3b5b0800a13`.
The original 46-row Doka geometry/mass catalogue and its null capacities remain unchanged.
The supplemental research supplies five nominal gross tube sections, three separate feedstock
grade references (Q235B/Q345B/Q355B), an explicitly selectable Eurocode elastic reference, product
groups and source metadata. This chat read the research JSON, not the original external webpages
or its PDF tables; their validation/provenance assertions belong to that research record and do
not constitute independent certification by this integration.

`RinglockResearch.tsx` exposes the updated references with empty choices. A product group/role
only offers section assignments actually declared in that group. TNV metric section/grade gaps
stay unknown; TCB foot-based dimensions are not silently assigned to TNV metric stock. Grade and
elastic choices are separate explicit hypotheses, never automatic Fy assignment. Changing the
product group clears those choices. A typed evidence/reason field never grants product approval.
The current selector stores one research role hypothesis at a time; it is not a complete actual
Standard/Ledger/Brace schedule or a per-member frame property assignment.

The selected original group/section/material/elastic/source records and dataset hash are embedded
in the model/snapshot and shown by the frozen report. Module labels are compared exactly with
the selected plan; matching labels alone still leave brace bay/lift, installed datums, actual
stock and connection verification blocked. Gross A/I/W/r are recomputed from D/t for consistency.
No feedstock strength, E, nominal section property or foreign AT-PAC brace example is transferred
into a system resistance, a generic SWL or the joist/bearer analysis. `ringlockRating` remains null.

Seven further domain/UI tests cover byte preservation, independent annulus identities,
inconsistent/tampered section records, missing TNV properties, exact module mismatches,
explicit grade/elastic choices, frozen provenance and revision invalidation. They pass as part
of the focused 61-test suite. Root failures are the separately retained upload-test typo above.

Two chats briefly overlapped while integrating the same research. The duplicate import and
parallel reference/UI/model additions were detected; this chat stopped writes, asked the owner
to select one integration owner, and received authorization to coordinate by message. The other
chat then withdrew its duplicate integration additions and became idle. The combined source was
read back and typechecked/built/tested after coordination. Its earlier module presets and four
plan tests remain intact. A later direct owner request in the Ringlock chat authorized supplier
UI development there while this chat worked in separate frame-core files; the combined additions
were read back and verified as described below. No subsequent duplicate implementation was removed.

## Reference provenance

Sixteen reference JSON files were copied byte-for-byte from the owner's archive at
`Text Book/RC-FormWork_Workflow_Ringlock_v0.7.zip` into `src/reference/workflow-v07/`.
The original archive and databases were not edited. Included are 182 sections, 39 materials,
46 geometry/mass Ringlock components, the blank rating template, 89 parameter definitions,
62 check definitions, source register, package manifest, UI policy and seven synthetic fixtures.
Tests check key copies against the original package manifest SHA-256.

No advertised 60 kN/leg, catalogue jack length, nominal timber dimension or raw Fy was promoted
to an equipment/assembly rating. No external source was fetched or independently certified here.
Historical source/reference flags are retained; model preview does not confer verification.

## Actual side layout and shared reanalysis (preview.4)

`SideLayoutEditor.tsx` now authors physical face layouts with actual stud positions, paired waler
levels, separate support stations at each level, plywood actual thickness/grain/directional
effective E, individual stud/rail E/I and evidence, and an explicit heavier-rail load share.
No engineering property is populated from synthetic test values or legacy demonstration inputs.
The declared waler members span the whole physical face; opposing-pair region boundaries do not
add joints. Unsupported panel cantilevers and continuous-sheet joint models are rejected rather
than silently changed. Physical stud overhangs above/below the waler levels and waler overhangs
past their supports are retained in the continuous-beam analysis.

Plywood demand is a separate envelope of simply spanning horizontal segments between studs,
normalized to a 1m vertical design strip at peak hydrostatic pressure. Its M/deflection/stress
demand is displayed without a resistance/utilization verdict. It is not an extra applied load:
the actual triangular vertical hydrostatic load is integrated through each stud only once.
Effective E must correspond to the explicitly supplied product/grain/moisture assumption.
Rolling shear, plate orthotropy, fasteners, bearing, durability and code resistance remain open.

The existing `sidePanel.ts` now accepts independent support lists at each waler level and checks
the total force plus local face/height first moments. It requires edge studs for the explicit
simply spanning transverse-panel assumption. Its two rails are independent noncomposite beams
with the declared uniform share; that declaration does not verify plate/contact load distribution.
Applied source pressure is independent of additional vertical DL/LL, and the global summary
uses the authored pour head when a current side analysis exists. A stale authored side layout
reports unknown pressure instead of falling back to a different full-height assumption.

Users can join actual face/waler/support endpoints into straight orthogonal tie routes with
explicit sleeve/tie envelope diameters. The model checks opposite physical face normals, equal
endpoint height, route containment, duplicate endpoint use and route collisions. Rebar/forbidden
zone verification is still separate. Both end forces remain visible. Only balanced nonnegative
opposite ends without restraint moments yield a single full tie-force demand; incompatible ends
return unknown demand and require a coupled model. They are not averaged, summed or replaced by
a favorable scalar. Unassigned supports and omitted physical faces are individually blocked.
Column yoke/clamp and ground-brace topologies retain their own missing-system blockers and reject
substitution with ordinary tie routes.

The domain can bind a supplied complete segmented Inner/Outer assembly to the computed full
service force using the existing serial-component screen. It does not invent product capacities
or accept reduced local-waler assembly demand without a validated contact model. An unfavorable
screen propagates FAIL; favorable entered numbers remain BLOCKED. Complete Form Tie product data,
through-rod rules and the full product/compatibility/engagement UI are still required. Editing
tie endpoints/envelope in the UI clears any previously attached assembly data.

`SideResults.tsx` renders the actual face elevations, member responses, signed nodal demands,
projected tie routes and individual tie end forces from the same frozen report model/preview.
The diagrams are analysis drafts, not installation drawings. All source nodes retain their
actual XY projection and explicitly entered concrete-base elevation. The side preview is bounded
to 400 strip/member analyses and 1000 support nodes per case; a larger case is explicitly blocked.

`regenerateDraftLayouts` is called only by an explicit Analyze action. Ordinary model edits leave
both authored layouts stale. Pending fields from both editors are checked and applied atomically;
an incomplete second form is reported rather than dropped. Both side and soffit are then rebuilt
for one revision, avoiding a loop where reanalyzing one forever invalidates the other. Restore
buttons let users discard pending fields explicitly. Export/freeze is disabled immediately while
either editor or geometry text has unapplied edits. Different side/soffit stages or load cases
and unverified physical vertical datums/contact closure remain explicit system blockers.

Sixteen new domain/React tests verify independent hand solutions, per-face and closed-pressure
vector/moment equilibrium, real unequal-level supports, full serial tie force, unbalanced ends,
tie collisions, L-face continuity, clamp separation, missing inputs, vertical DL/LL independence,
stale stamps, actual check assignment, frozen source coordinates and combined two-editor reanalysis.
The final focused suite passes 77 tests. Root failures remain only the owner-retained upload typo.
No construction drawing/PDF, live browser, Firebase service, material certification or independent
engineering acceptance was performed by this chat.

## Standalone spatial frame numerical core (pre-integration)

`frameLinear.ts` implements a first-order small-displacement prismatic Euler–Bernoulli/St Venant
3D beam-column stiffness matrix with six DOFs at each node, axial-only bars and linear six-DOF
coincident-node joint springs. Translational spring values are N/mm and rotational spring values
are Nmm/rad. Actual node coordinates, local-axis references, E/G/A/Iy/Iz/J, actions, restraints,
stage/load-case/revision and idealization evidence must be explicit. Unknown stiffness/boundary
values are rejected; zero spring stiffness is a declared release, and `FREE` is a declared free
boundary. No stock, grade, support stiffness, fixed base, load factor or capacity is inferred.

Shared beam nodes are rigid within the declared idealization; releases/compliance require explicit
separate interface nodes/springs. Unknown extra fields such as silently ignored end releases,
distributed loads, authority flags or second-order method claims are rejected. Loads in this core
are nodal actions only; member self-weight/distributed action generation still requires a separate
declared adapter. It supplies no automatic material or equipment resistance.

The solver uses diagonal scaling and Cholesky factorization without penalty supports or epsilon
stiffness. Singular/indefinite/ill-conditioned systems are rejected instead of reporting low
utilization. Unloaded rotational DOFs with exactly zero stiffness are listed as unmodeled and
exposed as null, not fixed zero rotations; a load on such a DOF is rejected. Unrestrained zero-
stiffness translations are rejected even when unloaded. A numerical pivot is not a buckling factor.
Recovered local member-end actions use the force/moment applied **to the element** by its nodes;
axial force is positive in tension. All node and global force/moment residuals are checked with
separate force/moment units. Offset actions retain both the original couple and `r × F`.

`frameLoadTransfer.ts` independently recomputes the complete upstream U-head reaction set before
accepting it, rejecting altered, omitted or stale reactions. Each actual signed downward-positive
soffit reaction becomes a signed global-Z frame action; uplift is retained. Source bearing-point
coordinates and links must match the upstream beam supports. An actual target-node offset needs
an explicit transfer assumption and produces its moment in the frame engine. The upstream bearer
restraint moment also remains: X-directed bearer → global +Y couple; Y-directed bearer → global
−X couple under the existing downward-positive beam convention. Case/stage provenance still needs
the eventual workflow adapter, since the existing beam reaction record carries a revision but no
standalone stage/case fields.

Twenty new independent synthetic tests cover EA/L and strain energy, cantilever axial/biaxial
bending/torsion, mesh subdivision, simply supported central loading, signed pin-truss force,
linear axial/rotational connection springs, arbitrary spatial rotation/translation, reversed
member orientation, strong/weak axes, Maxwell–Betti reciprocity, prescribed settlement, support
point loads, eccentric force couples, mechanisms, inactive rotations, null/zero distinctions,
stale cases, unsupported ignored fields and actual unequal head-force transmission. A six-column
synthetic example retains the 2.413125/7.05375 kN demands and 23.76 kN total. Its fixed bases and
properties are test assumptions, not an assumed field Ringlock configuration.

At this pre-integration stage, the numerical core was not exposed as a new MCP tool, added to the legacy
engine or bound to WorkflowModel/report/drawing UI. Preview.5 subsequently adds the isolated binding
described below, without changing legacy/MCP APIs. The core returns
`DEMAND_PREVIEW`, `confirmed=false` and `NO_GO` with unconditional missing-method blockers. It does
not close the handoff's ENGINEERED_FRAME route or GLOBAL_STABILITY/STANDARD/BRACE/JOINT checks.
Actual assembly segmentation (including jacks/spigots), nonlinear/asymmetric/gapped joints,
imperfections, P–Delta/P–delta, contact/uplift/sliding, self-weight/wind/stages/combinations,
member/connection resistance, coverage and independent engineering benchmarks remain required.
Frozen frame integration was subsequently added in preview.5. A regression explicitly demonstrates that axial compression does
not modify bending stiffness in this first-order method, preventing a second-order scope claim.

## Combined supplier additions

During this frame work, the owner asked the separate “อธิบายมาตรฐาน Ring log” chat to put its
supplier data into the app. That chat added `ringlockSuppliers.ts`, `RinglockSuppliers.tsx`, its
CSS, `RinglockSystemReferences.tsx`, three supplemental source JSON files and two test files,
and extended the existing research selection/summary. Those changes were preserved. Its eleven
new tests are included in the current 108-test focused total, separately from this chat's twenty
frame tests. Supplier/family/component selection and evidence-backed edit history stay in the
private draft; originals and updated values remain separate. The source has four suppliers,
five families, twenty-one components and thirty null capacity placeholders. User-filled values
do not become verified project data or `ringlockRating`. External AT-PAC joint examples remain
separate from Thai stock. This frame core imports none of those supplier resistance values.

## Frame graph, authoring and frozen results (preview.5)

`frameWorkflow.ts` adds an optional, backward-compatible frame layout to the private draft.
`FrameLayoutEditor.tsx` authors up to 80 actual nodes, 240 members/joints and 1,000 explicit nodal
actions. The limits reject oversized graphs; no heads/members/actions are silently truncated.
Node coordinates, six boundary conditions, material/section/axis values, six local joint stiffnesses,
action vectors and application offsets preserve explicit unknowns. Physical roles distinguish
Standard, Ledger, Brace, head/base jack, spigot and ledger/brace joints. Changing a physical role
clears prior material/section/stiffness/evidence values. Selection does not create verified stock.

Geometry capture copies only known head/base coordinates and the originating stage/case from a
current authored soffit. It creates no frame members, fixities, stiffness, strength or default
prismatic whole legs. Actual assembly segmentation, rosettes, spigots, jack engagement/extension,
installed datum closure, head/seat contact and connection models still need project evidence.
Properties must be supplied explicitly; supplier capacity fields are not stiffness or resistance
inputs to this engine. Synthetic six-column fixtures are test assumptions, never UI defaults.

For poured cases, the workflow requires the same source stage/case and complete individual head
mapping. `frameLoadTransfer.ts` rechecks actual source reactions before transfer and retains force
signs, bearer moments and documented physical offsets. A separately declared frame-only case needs
an omission reason and cannot discard soffit loads from the same stage/case. Extra nodal actions
need explicit ownership, evidence, force/moment vectors and location; duplicate source ownership
is rejected. The workflow does not generate self-weight, wind, imperfections or load combinations.

Ordinary source edits invalidate frame results. Explicit Analyze regenerates authored side/soffit
layouts and stamps the frame against the finalized common revision/source. Pending edits from
all three layout forms are applied together; unparsable pending definitions prevent application.
Incomplete frame data can be retained and frozen as BLOCKED with no invented solution. If an
upstream layout cannot regenerate during this partial save, its old graph remains stale and its
reactions cannot be used by the frame. Saving an incomplete draft never closes missing checks.

`FrameResults.tsx` shows XY/XZ undeformed analysis projections, actual known coordinates and
boundary conditions, displacements, rotations, signed support reactions, local member-end actions
and force/moment residuals. Unknown coordinates are omitted from diagrams and listed as UNKNOWN;
unmodelled rotations stay null. Report and drawing use the same frozen model/recomputed preview
and SHA-256. Pending frame edits disable freeze/export immediately; source edits make prior results
stale. Old engine snapshots require recalculation. Hash integrity is not engineering approval.

Eleven domain and five React regressions add actual unequal reaction transmission, null/incomplete
draft retention, current/stale/rebuilt sources, stage/case omission protection, duplicate ownership,
missing mappings/offset evidence, mechanisms, actual role-based check requirements, recomputed-hash
tampering, old model compatibility, geometry-only capture, role-change clearing, pending-edit
preservation and cross-layout atomic application. The synthetic slab carries 23.76 kN with
2.413125/7.05375 kN individual heads, not equal total/leg allocation. UI tests run in jsdom; no live
browser or visual acceptance was performed.

Every frame result remains BLOCKED / NO_GO. First-order linear analysis does not satisfy the supplied
ENGINEERED_FRAME contract. Geometric second order, P–Delta/P–delta, imperfections, nonlinear/gapped
and asymmetric connections, contact/uplift/sliding, actual assembly completeness, member/joint/base/
ground resistance, stage/combination coverage and independent engineering validation remain open.
The subsequent reference-edit guard below adds parent-level pending-state registration for local
Custom and supplier forms. Their frozen content uses only applied values. The feature remains off by default.

At initial preview.5 verification, 124 focused tests passed; root tests reported 340 pass / 5 fail and eight errors
from the owner-retained upload-test typo. Typecheck, app build, Functions build, MCP build and direct
local MCP smoke pass. App build retains the >500 kB warnings (lazy preview approximately 751 kB,
legacy main approximately 1,038 kB). Original baseline source inventory still differs only at the
earlier `main.tsx`/`vite-env.d.ts` preview integration and the retained upload-test typo. This
continuation modified five previously added preview files and added the frame binding/UI/tests.

## Applied reference data and pending form consistency

At this UI-only continuation the calculation engine remained `0.7.0-preview.5`; the numerical
inputs, results and snapshot content schema do not change. `WorkflowV07Panel.tsx` now tracks
each section/material/equipment Custom editor independently, and `RinglockResearch.tsx` forwards
supplier-edit state from `RinglockSuppliers.tsx`. Any Custom field, including an incomplete
reason/property selection, and any open supplier edit immediately disable freeze/export.
One form's cancel cannot clear another form's pending registration. Successful application or
explicit cancel clears only that form. Unmounting on type/case changes clears its registration.

Reference selectors and supplier record replacement are disabled while their edit is pending,
preventing an unrelated selection from discarding local fields. Custom has an explicit discard
action. Failed supplier validation keeps its values and pending state, and does not alter the
applied draft. Analyze also refuses unapplied geometry, Custom or supplier data, so it cannot
silently calculate against older reference values while edited fields remain visible.

Frozen reports show selected Standard/Custom source versions and their original/effective
properties, units as named in the source, and Custom reason/evidence. These records remain
reference data; they are not yet per-member section/material bindings. A changed applied record
invalidates the previous snapshot through the existing revision/content identity. Canceling an
unapplied edit can restore download of the unchanged snapshot, preserving its original hash.
The report/diagram hash still has one shared identity. Supplier values remain unverified and do
not become frame stiffness, manufacturer ratings or construction approval.

Five new React regressions cover blank/incomplete Custom edits, preserved pending fields across
unrelated draft changes, independent simultaneous forms, original/effective frozen values,
invalid supplier data, explicit cancel/save, blocked record replacement and type/case cleanup.
At that stage, focused verification passed 129 tests in sixteen files; root verification reported
345 pass / 5 fail and eight errors, all in the owner-retained upload-test problem. Typecheck
and app build pass, with existing >500 kB warnings (lazy preview approximately 755 kB, legacy main
approximately 1,038 kB). No domain, Functions or MCP source changed, so their prior preview.5 build/
smoke results are retained without repeating those commands. Baseline source and AGENTS/typo
hashes confirm preservation. Evidence is in `artifacts/workflow-v07-reference-pending-verification.json`.

The larger v0.7 delivery remains incomplete: physical paired-waler fitting and two-rail/contact
definitions, product-bound member properties, full tie assembly authoring, actual Ringlock
segmentation/datums, nonlinear/second-order and resistance methods, complete representative
coverage and independent engineering validation are still required. This guard closes an output
consistency gap and does not substitute for those engineering requirements. The supplied archive
contains `baseline/RC-FormWork_FormTie_Addendum_v0.6.2/engineering/Form_Tie_Design_Manual.md` only
for the v0.6.2 baseline; it does not supply the complete machine-readable product/assembly pack.

## Separate physical rails and fitting envelopes (preview.6)

`walerPair.ts` adds a strict optional independent-pair definition to each actual waler row.
Every pair has exactly two named rails, `compositeAction=false`, explicit family, 0/90-degree
orientation, positive E and chosen bending I in MPa/mm4, separate section/material/axis references,
continuity and actual splice stations. Orientation describes the supplied I; it does not derive
or rotate catalogue properties. Values are manually evidenced member inputs and are not yet
linked to selected Standard/Custom catalogue snapshots. Changing family clears incompatible
properties/evidence; changing orientation clears the previous I/axis evidence.

Each level has its own explicit rail-1 fraction and sharing evidence; rail-2 receives the
complement. Rail 1 may be lighter than rail 2 and is never reordered by a governing-value shortcut.
The engine neither infers sharing from EI nor combines the rails into 2I or a composite section.
`sidePanel.ts` applies each actual stud reaction to the two separate beam analyses using those
declared fractions and E/I values, then sums their signed support demands. Existing common-property
preview inputs remain an explicit compatibility path with a missing-physical-pair-data blocker.
No unknown common E/I/share is used as fallback when explicit pairs cover every level.

Splice stations are retained but are not ignored: unknown continuity, declared splices or a station
on a supposedly continuous rail prevent a usable side solution until a splice-transfer model is
implemented. A pair boundary still creates no hinge or beam break. Unknown numeric values remain
null. The strict pair schema rejects extra release/approval fields, duplicate rail/fitting IDs,
invalid values and unsupported composite action, including when supplied through model parsing.

The editor also captures actual clear gap/separation axis, geometry evidence and a fitting record
by each actual support ID: plate width/thickness, clear hole, required radial installation
clearance and contact references. No default gap, clearance, thickness, material or capacity is
provided. The physical row's support stations remain shared idealized bearing lines; rail depth,
centroid/contact positions, actual tie offset, torsion and the cross-rail moment transfer are not
modelled. Drawing double lines remain symbols and do not depict installed rail spacing.

For an explicitly vertical pair gap, `screenWalerTieFit` compares the actual tie outside envelope
with the clear gap; it separately compares the clear plate hole and doubles an explicitly entered
radial clearance to obtain the required diametral clearance. A plate whose across-rail width
cannot bridge the gap is adverse geometry. Negative envelopes or unmet declared clearances
produce FAIL and propagate through side/root status without changing or dividing serial tie
force. Unknown values stay null, and a successful envelope screen remains BLOCKED. Normal-stacked
pairs, CHS saddles/retainers, C-lip effective/local/distortional methods, contact loss, plate
bending, edge distances, tie eccentricity and capacity remain separately unresolved.

`PairedWalerEditor.tsx` authors this information per physical waler row; `PairedWalerSummary.tsx`
and `SideResults.tsx` show its frozen source/unknown values, the E/I/share actually analyzed and
dimensional outcomes. Newly authored independent-pair layouts can be retained as incomplete
BLOCKED drafts with no usable force result. The same explicit Analyze action still collects
pending side/soffit/frame definitions; invalid pending lists are not dropped. Unsupported or
missing source data does not promote previous forces to a new revision. Frozen report/diagram
still share one hash, edits invalidate old results, and prior engine snapshots require recalculation.

Eleven domain and four React regressions verify independent EI response scaling, unequal physical
rail shares, per-level differences, exact common-property compatibility, splice/release rejection,
strict nullable/authority schema, adverse gap/hole/radial-clearance screens, unverified curved/
cold-formed contact, no silent fallback, frozen/tampered data, source changes, family/axis clearing,
actual fitting IDs, pending-edit preservation and incomplete draft retention. Test E/I values,
plates and references are synthetic assumptions, not stock engineering data.

At initial preview.6 verification: root tests 360 pass / 5 fail, eight unhandled errors in the retained upload-test
problem; focused suite 144 pass in eighteen files. Typecheck, app build, Functions build, MCP
build and direct temporary-directory MCP smoke pass. Existing chunk warnings remain (lazy preview
approximately 779 kB, legacy main approximately 1,038 kB). AGENTS and the upload-test file are
unchanged from this continuation's baseline; the original source inventory still differs only
at the prior main/vite-env integration and retained upload-test changes. No live app/provider,
configuration, master engineering dataset, construction issue or deployment changed.

That stage did not complete the paired-waler design requirement. Per-member catalogue bindings,
complete fitting/contact geometry and coupled mechanics, splice models, torsion/local resistance,
full product tie assemblies, project basis/combinations and independent engineering validation
remain required. The broader Ringlock second-order/system/ground and Typical coverage work also
remains open. Every favorable result remains BLOCKED / NO_GO.

## Bound elastic member inputs (preview.7)

`elasticBinding.ts` adds optional captured section/material bindings to side stud groups, the shared
side-rail compatibility input, each independently authored physical waler rail, and the generated
soffit joist/bearer groups. A binding stores cloned original/effective Standard/Custom snapshots,
source versions, explicit principal orientation and material elastic-property key, actual-product
match evidence, service/moisture reference and axis evidence. The selected generic references are
copy sources: later generic selection changes never replace already bound records automatically.
Adopting a replacement requires copying/applying it explicitly, with a new draft revision.

For catalogue steel, the section must be explicitly candidate-selectable; null/inherited and
quarantined flags remain blocked. Only C and C-lip currently have explicitly selectable rows in
the supplied section dataset (42 rows). Binding does not rewrite those master QA flags. Local
source Ix/Iy cm4 values convert to mm4 and the explicit 0/90-degree orientation selects the actual
axis. Known nonzero Ixy is rejected by this scalar beam method. Section role, material product
family and published product thickness applicability must match; Fy/G/shear or other numeric
properties cannot substitute for E. CHS contact and C-lip effective/local/distortional rules remain
unverified; the gross reference values create no member-capacity approval.

Measured timber is a separate geometry source, not a promotion of inherited catalogue rows.
Actual dressed B/H and measurement evidence are mandatory; nominal inch text is retained as a
label and never parsed into dimensions. The rectangular I=b*h^3/12, area=b*h and S=b*h^2/6 use
the explicit orientation. A compatible timber material, parallel grain and explicit E0_mean_MPa
or E_ref_MPa are required. An unknown/null modulus is not zero. The geometry and reference E do
not verify certified grade, wet-site adjustment, duration factors, bearing, strength or service
suitability; those conditions remain mandatory engineering blockers.

Bound members have one E/I source: simultaneous manual E/I overrides are rejected. `sideLayout.ts`
passes resolved stud/shared-rail inputs to the actual analyses, and `walerPair.ts` resolves each
individual rail independently while preserving its declared force fraction and continuity rules.
`soffit.ts` uses resolved inputs in every generated member of the corresponding explicit joist or
bearer group. Self-weight remains separately entered with its own evidence and ownership ledger;
binding does not synthesize density/weight. In the soffit editor a changed captured section/material
or measured dimension clears prior self-weight/evidence so it must be stated again, including an
explicit zero when appropriate. Grain/axis or service references do not act as engineering approval.

`ElasticBinding.tsx` supplies the reusable controlled editor and frozen source summary. All binding
edits participate in existing layout pending-state/atomic analysis guards. Manual E/I fields are
disabled while bound. Binding removal requires manually entering E/I again; a family/axis change
does not silently reuse incompatible stiffness. Unknown bindings can be retained in BLOCKED drafts
with no usable load path. Frozen side/soffit reports show the captured original/effective records,
source versions and actually analyzed E/I. Source edits remain stale until explicit reanalysis,
and model/reference/result tampering is checked by snapshot integrity and recomputation.

The catalogue constructor also fixes a discovered partial-property bug: changing only one material
property now merges it with unchanged properties instead of dropping them. Strict imported-snapshot
validation reconstructs legal numeric overrides and rejects removed/added property keys, changed
Standard values, identity/authority edits, bad provenance and extra approval metadata. These
checks preserve data structure and provenance; they do not establish a trusted source certificate.

Thirteen domain and five React regressions cover partial Custom preservation, forged snapshots,
source-axis/unit conversion, QA/quarantine and coupled-axis rejection, hand-derived measured timber
geometry, grain/E selection and product thickness scope, separate manual/bound sources, actual
side/per-rail/soffit response changes, immutable source copies, explicit adoption revisions,
force/first-moment closure, frozen/tampered inputs, unknown drafts, pending edits and renewed
self-weight authoring. Synthetic source-match/measurement statements do not certify field stock.
The synthetic slab still carries 23.76 kN and retains the unequal 2.413125/7.05375 kN U-head forces.

At initial preview.7 verification: 162 focused tests passed in twenty files; root tests reported 378 pass / 5 fail
and eight errors from the unchanged upload-test typo. Typecheck, app build, Functions build, MCP
build and direct local MCP smoke pass. Build retains >500 kB warnings (lazy preview approximately
798 kB, legacy main approximately 1,038 kB). Original source inventory and AGENTS/upload-test hashes
confirm preservation. A simultaneous UX/UI task was inspected: its edits target a separate Codex
visualization folder, and repository source edits here started after that separation was verified.
No live application, provider, Firebase configuration, master dataset or deployment changed here.

Remaining scope includes directional plywood/product binding, frame E/G/section/torsion and actual
Ringlock product binding, variable properties per individual soffit member, full paired contact/
splice/plate mechanics and resistance, product tie assemblies, second-order/nonlinear and support/
ground checks, complete load combinations/Typical coverage and independent engineering validation.
This elastic binding does not complete those requirements or authorize construction use.

## Directional plywood and actual soffit strip flow (preview.8)

`plywood.ts` adds separate plywood product binding rather than using steel/timber elastic fields.
The captured Standard/Custom material must be PLYWOOD and applicable to PLYWOOD_GROSS_STRIP.
Measured thickness must match the product reference thickness; no tolerance, interpolation or
thickness-scaling rule is invented. The method uses I=1000*t^3/12 and S=1000*t^2/6 for a full
1 m gross strip. No second reduction of I or implicit E factor is applied. Manual directional E
is still an explicit unbound reference route, and cannot override E simultaneously with a binding.

The source contains separate Eb0_mean_MPa and Eb90_mean_MPa. Their labels alone do not establish
field face-grain direction: the binding requires an explicit parallel-to-grain key and mapping
evidence, plus actual product/DoP/thickness and service/moisture references. The complementary Eb
is selected when the actual span is perpendicular to face grain. Strength, in-plane Etc moduli,
MOR, and other fields cannot substitute. Complete strings remain unverified evidence and never
become product certification or engineering approval. Side strips map ALONG_FACE/VERTICAL grain
to their actual local-X span, changing only directional panel response; their peak-pressure
envelope is not fed into studs a second time.

The optional soffit plywood definition records actual thickness, manual E or product binding,
grain X/Y, simple joints on every joist, actual board start/end Y, self-weight in kPa, weight
ownership and source evidence. Unknown is null. Continuous/two-way/cantilever panels need another
model; simple joints are explicit user input and are not inferred from grid or pair boundaries.
Board extents must lie on the actual joist length and cover every surface action that passes
through the panel. X edges remain supported by the first/last actual joists.

The engine subdivides the board at each actual joist-X span and every concrete/DL/LL/plywood
weight boundary in Y. It analyzes every resulting 1 m normalized simple strip under that zone's
actual summed q, including explicitly unloaded board zones. Source action IDs and true X/Y
extents are retained. The normalized strip reactions are converted to N/mm line patches over
the real Y zone and feed the actual joist graph. Coincident intervals add forces without averaging
across zone boundaries. Joist self-weight enters once after panel transfer; bearer self-weight
enters its own member. Resultant force and both first moments close at the panel, whole soffit,
head and declared first-order frame layers. The 400 strip/zone cap rejects oversize graphs without
truncating zones. A definition with unknown stiffness/weight has no usable generated load path.

Plywood weight is explicitly SEPARATE_ACTION or IN_ADDITIONAL_DL. Separate weight adds one actual
surface patch and spatial owned action. Included weight is documentary, linked to the owning DL
action, and creates no second surface load. The owning DL pressure and region must cover it
fully; missing/doubled separate mapping or insufficient included-DL coverage is rejected. No
weight is synthesized from density/thickness. Zero is accepted only when explicitly entered.
Other hardware/frame weights, point equipment, placement/wind/stage envelopes and combinations
remain incomplete. Old drafts without plywood use their existing direct tributary-load route
with a missing-plywood-analysis/self-weight blocker; no panel result or zero panel weight is implied.

`PlywoodBinding.tsx`, `SoffitPlywoodEditor.tsx` and `SoffitPlywoodResults.tsx` author and display
these data. Pending inputs block freeze/export. Incomplete definitions can be retained as BLOCKED
drafts without converting old reactions to the new revision. Frozen reports show product original/
effective records, selected Eb, actual span/zone responses, dimensional load-zone diagrams,
actual strip-to-joist transfers and declared/added weight. Report and drawing share one frozen
revision/hash; source changes require explicit reanalysis and altered serialized results are
recomputed. Required SOFFIT-03/04 and Typical entries are assigned to every actual span/zone,
with no favorable outcome/representative generated automatically.

Fifteen domain and five React regressions cover independent simple-strip M/V/deflection/stress
formulas, explicit source axes and thickness scope, side grain changes, actual reaction-fed
joist patches, nonuniform spans, eight asymmetric beam/slab/DL/LL Y zones, translated global
moments, separate/included weight, actual DL footprint coverage, unloaded zones, unsupported
panel geometry, schema authority rejection, bounded size, actual coverage, stale/rehashed results,
UI authoring/unknowns/pending edits and the full force path into a declared synthetic frame.
The synthetic slab remains 23.76 kN with explicit zero panel weight; adding .1 kPa over 3.6 m2
gives 24.12 kN, including 7.160625 kN at its synthetic middle head/base. Included weight does not
increase the 23.76 kN case. An asymmetric synthetic beam example closes at 20.856 kN across all
zone boundaries. These are software benchmarks, not design acceptance of real plywood or Ringlock.

Current checks: focused suite 182 pass in twenty-two files; root tests 398 pass / 5 fail and eight
errors from the unchanged upload-test typo. Typecheck, app/Functions/MCP builds and local MCP smoke
pass. Existing >500 kB warnings remain (lazy preview approximately 824 kB, legacy main approximately
1,038 kB). Original source inventory and protected AGENTS/upload-test hashes are unchanged from
this continuation baseline. The other active repository task was inspected and was performing
a status audit, with no source fixes; no overlapping source-edit task was started here. No live
app/provider, Firebase/MCP configuration, master dataset or construction release changed here.

Remaining plywood work includes verified wet/service/duration basis, bending and rolling-shear
resistance, shear deformation when applicable, fasteners/local bearing, continuous/two-way/edge
models and product-specific independent validation. At preview.8, frame product/E/G/torsion binding
remained open; preview.9 adds the straight gross tube scope below. Nonlinear/second-order systems,
complete fitting/tie assemblies, variable member inputs, ground/support,
load combinations, complete representative coverage and owner acceptance also remain open.
The added strip flow does not satisfy those wider requirements. Favorable results stay BLOCKED / NO_GO.

## Individual frame tube references (preview.9)

`FrameTubeBinding` is an optional backward-compatible per-element copy. The author explicitly
copies either a selected research group/role/section or one selected Thai supplier/family/component,
then separately copies a selected elastic reference. No reference or E/G value is selected by default.
Supplier copies retain only the selected original rows, their relevant replayable edits and sources;
capacity rows are excluded. New user-entered rows retain null originals and their complete selected
parent/component edit history. SHA/version metadata are provenance labels, not certification.

The member must have explicit straight-segment I–J extent, product-matching and elastic-basis
evidence. Standard and Ledger use beam-column idealization; Brace may use beam-column or axial-bar
idealization. Actual local axes, node coordinates, node restraints and joints remain authored inputs.
Gross annulus A/I and St Venant J=2I are recomputed from the selected D/t, with exact role matching,
section/source consistency and explicit E/G/nu consistency. A straight-tube copy cannot supply
thread-root jack, spigot, rosette end/net section, spring stiffness or installed assembly properties.
The published supplier E and grade remain visible and separate from the selected elastic hypothesis;
different supplier E raises a blocker. Neither Fy nor a catalogue capacity becomes E/G or system SWL.

Bound manual E/G/A/I/J must all be null; conflicting data prevents solving. Missing dimensions,
elastic references or evidence remain unknown/BLOCKED. UI source changes clear the affected evidence
and member idealization evidence; unbinding leaves blank manual properties. Physical-role changes
clear the old binding. Global reference changes invalidate current results but do not silently mutate
existing member copies. Pending edits disable freeze/download and survive upstream restamping.
Each binding is limited to 100,000 canonical characters, with 1,000,000 total across the frame;
exceeding limits is rejected without dropping members or truncating audit history.

The resolved input property table, per-member captured originals/edits/evidence and actual force
results appear in the frozen report/drawing snapshot. Software fixtures check annulus identities,
EA/L, cantilever bending/torsion, independent member sources, source/audit/schema tampering,
missing/partial drafts, revision invalidation and UI authoring. The existing unequal 23.76 kN fixture
still delivers 7,053.75 N to the middle head/base with these references; this is a synthetic first-order
benchmark, not an installed Ringlock system check. Frame status remains BLOCKED / NO_GO.

Current verification: 415 root tests pass, five fail with eight unhandled errors from the preserved
upload typo. Typecheck, app/Functions/MCP builds and local MCP smoke pass. The application remains
flag-off and refuses Firebase production. Self-weight ownership/reconciliation, finished product
and fitting evidence, genuine joint/base/ground models, second-order stability, resistance rules,
complete stages/combinations/coverage and independent engineering/Owner acceptance remain open.

## Actual requirement matrix and representative planning (preview.10)

The private draft now exposes every generated Member × Check × Load case × Revision row and the
catalogue specifications still missing actual entity assignments. Unassigned, duplicate, incomplete,
non-equivalent, stale, representative-pending and N/A-pending rows remain visible. No longest-span
or favorable-result envelope is substituted for the actual set. The matrix contains the complete
set in the frozen JSON; the UI paginates 100 rows with explicit counts and filters. Pagination does
not change or truncate the engineering data. Empty required sets remain blocked.

`coverageReview` is an optional backward-compatible field with strict schema and no approval/status
inputs. Authors select a representative and exact actual requirement references, a comparison mode,
and applicability evidence. A separate N/A mode records a geometry/rule claim for review. The plan
allows partial drafts; unknown/stale references and duplicate targets are diagnosed without omitting
any required row. Limits are 2,000 groups, 20,000 targets, 4,000,000 canonical group characters and
2,000,000 source-definition characters; an oversized plan is rejected, never silently reduced.

`BeamAnalysis.input` captures the actual input by value, including downstream transferred point
loads, rather than an earlier unloaded member definition. The local comparator removes only input
IDs/order and normalizes an omitted rotational-fixity flag to its existing explicit pinned meaning.
It requires identical length, separate E and I, support stations/fixity, individual point forces and
linear patch locations/intensities in one revision. Reversed comparison uses x'=L-x, reverses patch
end intensities and preserves support fixity. There is no tolerance merging, resultant-only matching,
load aggregation, unit substitution or automatic reversal. Changed E/I with equal EI still differs.
Ambiguous duplicate actual analysis IDs prevent proof rather than selecting one silently.

This establishes only prismatic 1D elastic demand-input equivalence for actual supported side/soffit
beam entities and listed checks. It does not establish material/product/orientation, local bearing,
contact, torsion, physical normal/axis reflection, unbraced length, real end restraint, joint stiffness,
corner/transition/opening or global frame equivalence. Frame/system checks cannot use this local
proof. Exact applicability mode retains every field, including member identity where present; it
does not remove identity to manufacture a match. Even exact or local matches have zero verified
engineering checks. N/A evidence strings also have zero verified N/A results. Legacy serialized
`CHECKED_IN_SCOPE` claims are not trusted by this matrix or used to create a release.

Plan-only saves retain the design revision and existing source analyses; the frozen content/hash
changes. Edits to design inputs invalidate the plan by revision and complete source identity.
Explicit reanalysis retains old plan references as stale; it never rewrites them to the new revision.
The UI preserves pending plan edits across upstream restamps, disables freeze/download until saved
or restored, and refuses saving a plan over pending geometry/member/frame source buffers. Applied
matrix and group data are included with the same frozen report/drawing snapshot.

Nineteen new software regressions (14 domain, five React) cover asymmetric reversed-load/support
equations, transferred-load capture, equal-EI/input differences, full inventory, edge/interior joists,
opposite-face local-only matches, per-check/case scope, duplicate/unknown/stale references, N/A and
authority rejection, bounded plans, pending edits, pagination and frozen/tampered/reimported data.
Root tests: 434 pass, five retained upload-test failures and eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (lazy preview
863.37 kB, main 1,038.11 kB). No live application, provider, production state or construction issue
was used. The full v0.7 workflow, actual engineering coverage and Owner acceptance remain incomplete.

## Installed Ringlock datums and component geometry (preview.11)

The soffit definition can explicitly use complete `baseDatumsByHead` instead of a shared base. Each
record contains the actual head ID, local X/Y, signed ground elevation and evidence. All actual heads
must match exactly; unknown, extra, missing or moved head records block analysis with no fallback
to the shared base or zero. Shared base must be null in this mode. The editor starts unknown values,
retains old elevations only for identical ID/X/Y on an explicit refresh, and clears a moved point's
old elevation/evidence. Partial maps can be retained as BLOCKED drafts. Head Z remains the common
reduced analysis plane; uneven ground is not interpreted as a sloping head/bearer plane.

`ringlockAssembly` is optional, local and backward-compatible. Capture copies only current verified
soffit head/ground geometry and stage/case. It never supplies a standard count, stack/rise, upper
layer depth, board thickness, jack extension/engagement, limit or tolerance. The author explicitly
declares whether the analysis head plane represents the U-head bearing surface and records evidence.
Individual physical soffit elevation, seven nonoverlapping installed contributions and declared
tolerance are then checked per leg. Base-installed height runs from sole-board top to the first
standard's lower datum; any collar included there must not be added again.

Each Standard has its catalogue label separately from measured bottom-to-top installed rise. Every
adjacent pair has a separately identified splice, exposed end gap and lower/upper insertions. The
stack height is the sum of measured standard rises plus exposed gaps once. Inserted spigot lengths
are inside the tubes and are not added again. A known overall spigot length is checked against both
insertions plus gap. Manufacturer minimum insertions, contact and actual splice stiffness remain
unverified. Removing or renaming a standard does not silently retarget recorded splice evidence.

Base/Head Jack catalogue length, installed height, measured extension and measured engagement are
independent fields. Recorded product-specific max extension/min engagement need their own evidence;
missing fields remain BLOCKED. A known adverse recorded limit is shown as FAIL even if an unrelated
engagement field is unknown. Favorable values and evidence strings never certify the product or
configuration. A nominal 600 mm jack never becomes a 600 mm allowable extension.

Height closure within an authored measurement tolerance is only a geometry screen. Preparing the
frame additionally requires head and soffit residuals to close within numerical precision; the
program does not move a head, alter a jack height or snap a measured stack to force closure. The
model's actual soffit source is reconstructed and compared before current geometry can be claimed.
Stale/unknown legs, stage/case changes and moved head/ground coordinates block the component graph.

An explicit button in an empty frame editor prepares separate base-jack, standard, spigot and
head-jack components. The BASE analysis node is at sole-board top, not automatically at the ground.
A zero exposed splice gap retains two coincident nodes plus an unknown six-DOF joint spring; a
nonzero gap is a separate beam-column geometry with unknown properties. All fixities, material/
section properties, local axes, spring stiffnesses and analysis acknowledgements remain unset.
The generator does not overwrite an existing frame or copy a straight tube binding to jack/spigot.
Extra ledgers/braces may be authored separately; unmapped extra vertical assembly members, altered
component roles/ends, missing nodes or changed head mapping prevent an assembly-based frame solve.

The editor retains pending assembly data across restamps. Explicit Analyze actions combine pending
side/soffit/assembly/frame definitions in one revision. Missing data can be saved as a blocked draft;
freeze/download remain disabled while buffers are pending. Applied per-leg measurements, recorded
limits/evidence, closure results, component coordinates and individual head forces appear together
in the same frozen report/drawing data. Limits are 80 assembly records, 20 standards/19 splices per
leg and 1,000,000 canonical detail characters; the frame remains capped at 80 nodes/240 elements.
Overflow is rejected without truncating a leg, head or physical piece.

Twenty-one new regressions (16 domain, five React) check six uneven bases; null/stale/moved base
records; seven-term and spigot closure; nominal/installed separation; known adverse limits; unknown
and tolerance behavior; exact component mapping; bounded graphs; pending UI data; frozen source and
result tampering; and serial force/displacement mechanics. The synthetic 36-node/30-component frame
retains the 23.76 kN total and 7,053.75 N middle-leg force. Its head displacement independently agrees
with sum(NL/EA) plus N/k for the declared splice spring. These are software fixtures with synthetic
properties/fixities, not real jack/thread/spigot or installed Ringlock validation.

Current tests: 455 pass, five owner-retained upload-test failures, eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (preview 900.77 kB,
main 1,038.11 kB). No live application/provider, Firebase/MCP configuration, dependency install or
construction issue occurred. Real upper-member centroids/contact/fit, joint/bracing and restraint
models, manufacturer/system configuration and limits, support/ground resistance, second-order and
stage/combination analysis, independent engineering checks and Owner acceptance remain open.

## Explicit same-stage load cases (preview.12)

The optional `loadCases` book holds up to eight named cases. Each explicitly records stage/case IDs,
SERVICE or FACTORED basis, coefficient/Design Basis evidence, shared-layout applicability evidence,
and nine coefficient slots: vertical concrete, additional DL, construction LL, separated self-weight,
side hydrostatic pressure, wind, placement, other frame actions and imposed support movements.
Every slot starts null. There are no normative presets, implicit zero coefficients or default factors
for a declared case. Negative coefficients are accepted only for explicitly signed vector actions
and imposed translations/rotations. The existing source calculation remains unfactored when there
is no case context, preserving its legacy API behavior.

The compiler requires a project Design Basis reference and explicit physical-layout sharing evidence.
All source side/soffit/frame/assembly layouts must belong to the same authored stage; the new case
must have its own name. A factor does not create an erection, stripping, reshoring, different support
or unbalanced-pour layout. Those cases need their own stage-specific physical definitions. Book
schemas prohibit authority/status fields, duplicate IDs or stage/case names, nested case books,
more than eight cases, more than 100,000 canonical definition characters or a source definition
over 2,000,000 characters. Limit violations are rejected without dropping cases.

Each compiled case deep-copies the physical source, retains the design revision, clears review/
representative claims and rebuilds its authored layouts, member/action graph, individual reactions,
assembly validation and frame demand input. Physical gamma, section/material properties and source
layout loads remain unchanged. Vertical concrete, DL and LL coefficients act on their own surface
loads/owned totals; separated plywood/joist/bearer weights are factored once. Plywood recorded as
included in additional DL follows the owning DL coefficient and is not added a second time or
multiplied by the separated-weight coefficient. Physical ownership/extent checks still apply.

Hydrostatic side action has its own coefficient. Vertical DL/LL/concrete coefficients never become
an extra lateral surcharge. Explicit zero actions can produce an unloaded panel/member/head case;
unknown source loads, factors, offsets or boundary movements remain unresolved even when another
coefficient is zero. Additional frame force and couple vectors are factored once, geometry offsets
are unchanged, and r×F is formed from the resulting force. The already factored individual head
reactions are not multiplied again in the frame. Negative vector coefficients reverse the declared
action; generated zero vector entries are normalized to 0 rather than -0. Numeric overflow is an
explicit blocked calculation, not Infinity/null-converted output or a zero force.

Prescribed support translations and rotations use their own explicit coefficient. Source boundary
values remain in the case model, while the frame input carries the scaled values. A report table
shows both. Unknown movement values are not erased by a zero coefficient. This is still the current
one-way rigid-support soffit-to-frame demand method: support settlement/contact does not feed back
to redistribute soffit reactions. That coupling and geometric second order remain required.

SERVICE/FACTORED basis stays visible in case and frame results. Factored tie demands use the DESIGN
comparison category, so ALLOWABLE component entries do not supply a matching strength. Factored
Ringlock demands are not screened against SERVICE/ALLOWABLE ratings; a matched design-resistance
method remains required. Reanalysis does not invent or promote configuration ratings. Original
unfactored vertical-load quantities remain source data, identified separately from the calculated
case member forces. Favorable numbers never create a system approval.

The root matrix retains base and case requirements by actual member/check/case/revision. Unresolved
cases retain an explicitly unresolved expected inventory and errors instead of borrowing base-case
reactions or concealing missing coverage. Local representative comparison indexes analysis by case
as well as member/revision; the same physical member ID in another case cannot supply its result.
No single longest-member or combined M/V/deflection envelope replaces the individual case outputs.

Source edits leave the book STALE until an explicit source review/reapplication. Case-factor edits
create a new design revision and invalidate old snapshots/review. Pending coefficient edits survive
source restamps and disable freeze/download. Saving a book over pending physical/reference buffers
is refused; those buffers must be applied/restored first. UI case selection changes only which result
is displayed. All definitions, compiled models, case forces and complete coverage stay in the same
frozen report/drawing JSON; rehashed forged case results are rejected by calculation recomputation.

Twenty-two new regressions (17 domain, five React) cover separated action totals, full serial head/
frame forces, shared revision/source preservation, separated/included weights, explicit unloaded
cases, independent hydrostatic action, signed wind force/couple/offset, imposed translations and
rotations, unknown/overflow behavior, stage/basis constraints, unresolved and case-specific coverage,
stale/reimported sources, schemas/size bounds, basis-aware rating screening, pending UI data and
frozen/tampered results. Arbitrary SYNTHETIC coefficients produce 31.032 kN and 14.76 kN in the two
fixture cases; those coefficients are not proposed code combinations or engineering recommendations.

Root verification: 477 pass, five retained upload-test failures and eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (preview 920.56 kB,
main 1,038.11 kB). No live app/provider, dependency install, Firebase/MCP configuration change or
construction issue occurred. Complete project/code combinations, independently authored stages,
partial/unbalanced loading, nonlinear/coupled support analysis, verified hardware resistance and
independent engineering/Owner acceptance remain incomplete. Construction release remains NO_GO.

## Independent physical Stage studies (preview.13)

`stageStudy.ts` stores the actual authored input of each Stage separately from generated member
graphs, load arrays and numerical results. Capture retains the source revision/engine and explicitly
authored scope evidence. Human review, representative plans and derived reactions are cleared. Side,
frame, assembly and case-book source stamps are normalized rather than storing an expanding history
of prior stamps. An existing rating claim is retained as source evidence but is not rebased to a new
revision or used as Stage approval; it requires a separate revision-specific review.

Every Stage is rebuilt from its own soffit/side coordinates, member stiffness/bindings, frame nodes,
connections, restraints, actions and assembly. Every additional case is then independently compiled
from that Stage. All output uses the current project Design Revision. No force, displacement, material
age, prestress or support-removal history transfers between Stages. A FRAME_ACTIONS_ONLY Stage can
be studied after explicit soffit removal and new source/method declarations; its declared frame loads
do not receive copied concrete forces. Missing magnitudes/restraints still prevent a solution.

Project ID, final concrete geometry/density, source and Design Basis, element type and check catalogue
must match the shared project definition. A shared geometry/basis edit blocks incompatible saved
Stages until they are explicitly recaptured; no transformation or assumption is supplied. Layout
Stage IDs must match the record. Duplicate Stage IDs, nested studies, compiled-case captures,
unknown authority fields and unbounded records are rejected. The bounds are six Stages, one million
canonical characters per captured input and four million for all records. No data is truncated.

An applied-input fingerprint also detects whether the current editor matches a saved Stage. Source
edits make the study STALE; reapplying the book does not silently overwrite a captured Stage. The
editor must explicitly capture changed inputs. Requirements use `STAGE:<record-id>:<physical-id>`
for identity while retaining original member IDs and Stage ID in applicability. Case IDs remain
separate. A captured active editor is counted once; uncaptured editor requirements remain alongside
saved Stage requirements with an explicit blocker. Stale/missing-evidence Stages keep their own
expected inventory where reconstructable, with unresolved status and no solved beam lookup. A core
geometry mismatch or absent captured input can make inventory unresolved, which is explicitly reported.
Typical local 1D comparisons cannot cross physical Stages, even when numbers match. Within a Stage,
the actual Stage/case analysis is used and favorable comparisons remain REPRESENTATIVE_PENDING.

The Stage editor offers explicit capture, load for editing, copy to a distinct proposed Stage ID,
and removal of side/soffit layouts. Loading brings back input only and leaves analysis stale. Copying
requires the current applied inputs to be captured first and clears the additional case book and
frame-method acceptance. Removing soffit clears its generated graph/actions, assembly, head mapping
and frame load-source/method declarations; it does not silently select a frame-only solution. Existing
saved Stage records remain separate. Pending physical/reference/case/review buffers prevent context
switching and capture/save; pending Stage metadata prevents freeze/download and typical-plan save.
All source Stages, compiled cases, diagrams and results remain in the common report/drawing snapshot,
with integrity and calculation recomputation. Selecting a result changes only the display.

Nineteen new regressions (14 domain, five React) cover different physical head layouts and stiffness,
independent frame-only wind/movement inputs, a mechanism confined to one Stage, uncaptured/stale inputs,
core mismatches, unresolved inventory, exact Stage/case coverage, prohibited cross-Stage typical proof,
input-only restore/copy/removal, whole-book freezing, reimport/tamper rejection and pending UI guards.
Synthetic stages conserve 23.76 kN at six heads and 18.36 kN at eight heads. Their joist I values differ
by a factor of two and their deflections follow the independent load/stiffness ratio. These are
software fixtures, not proposed project stages, equipment ratings or engineering validation.

Root verification: 496 pass, five retained upload-test failures, eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (preview 938.92 kB,
main 1,038.11 kB). The feature stays off and construction release stays NO_GO. Actual construction
transitions, age-dependent concrete, support/reshoring redistribution, partial/unbalanced pours,
nonlinear/coupled analysis, verified hardware resistance and independent engineering/Owner acceptance
remain incomplete. No live app/provider, Firebase/configuration change or construction issue occurred.

## Spatial Stage placement and actual member actions (preview.14)

`SoffitLayout.loading` is an optional, strictly validated input definition. When absent, the previous
full-strip load route is preserved. When present, the author must explicitly declare complete surface
scope for the Stage and cite both placement/load evidence and omitted/unloaded-area evidence. Its
region list replaces all full-strip concrete/DL/LL distributions. An empty category is explicitly
unloaded within that declaration; an incomplete declaration blocks analysis rather than reverting to
full-area defaults. A known zero is retained, while raw missing pressure/depth/magnitude remains
unknown even for an empty or zero-factored case.

Concrete region pressure is gamma times actual placed depth. Final concrete geometry/density remains
unchanged, and placed depth cannot exceed the local final beam/slab depth. Beam regions crossing
different depth zones must be split appropriately. Each DL/LL region uses its separately declared
source pressure, within its own BDL/BLL strip; concrete remains inside Bc. Placement/other rectangles
have explicitly authored pressures. Coordinates use the same local XY origin as the physical layout.
All regions must lie on the actual plywood/joist extent. Duplicate ownership and overlapping same-kind
regions are rejected rather than silently merged. Loads of different kinds can share physical area.
Spatial surfaces require actual plywood analysis; midpoint tributary allocation cannot substitute.

The plywood engine retains each source X patch within the real joist span and partitions at actual Y
load boundaries. Its ordinary beam solver analyzes the corresponding partial distributed loads, then
transfers each unequal reaction as a line action along the actual Y zone of the receiving joist. Force
and both first moments are checked through plywood, joists, bearers and individual heads. No load is
spread to the full span or nearest member. The displayed mean q is a visual/table summary only; input
patch bounds/pressures and exact analysis loads are retained. Included plywood self-weight must be
covered by raw owning DL in every X/Y zone, including when the case DL factor is zero. Separate weight
is added once over the actual full product extent.

Direct point/line actions require the exact real member ID, local station/interval, raw downward N
or N/mm, independent ownership/source evidence, explicit exclusion from already-counted surface/member
weights, and an explicit declaration that the force acts on the member analysis line. Unknown
eccentricity is not zero. There is no invented plywood effective width or target snapping. These loads
are direct-bearing assumptions requiring local/contact/torsion checks. Each category uses its own
case factor exactly once; direct DL/LL/self-weight contributes to its corresponding aggregate, with
Placement/Other reported separately. All applied forces, centroids, raw definitions and ownership
ledger records remain in the frozen output. Negative downward case actions, overflow, invalid target
or unsupported geometry block the result.

The complete path is rebuilt for every affected input edit, additional case and independent Stage,
including assembled head/jack/frame base reactions. New spatial fields participate in existing source
definitions, coverage and snapshot hashing. A changed spatial input invalidates old graphs/review and
documents. The physical layout editor applies all spatial fields atomically; pending spatial buffers
block freeze/download, case saves and Stage capture/context switches. The plan and report show actual
patch extents, input/applied magnitudes, force categories, target members and explicit direct-load
centroids (a line centroid marker is not a point-load substitution). The single frozen hash and
calculation-recomputation checks remain intact.

Bounds: 40 surface regions, 80 direct member actions, 200,000 canonical input characters, 80 plywood
surface entries and 400 actual span/Y-zone analyses, plus existing beam/model station limits. No
truncation, hidden simplification, pressure conversion from unrelated loads or normative combinations
are supplied. The model remains limited to one-way simply spanning plywood on rigid joist lines and
separately declared static Stages. Point/line loads on plywood without a justified physical transfer
model, two-way/local plate effects, impact/dynamic magnitude, nonlinear/contact redistribution and
construction-history/young-concrete/reshoring checks remain incomplete. A simultaneous side layout
also retains an explicit blocker for matching concrete placement to its side-pressure profile.

Sixteen new regressions (12 domain, four React) cover partial-span unequal statics, real XY force/first
moments and translations, half placement, direct point/line paths, beam/slab depth and Bc/BDL/BLL
ownership, unknown/zero behavior, overlap and excessive-depth rejection, included weight coverage,
separate factors/category accounting, actual assembled frame bases, independent Stage/case placement,
stale/tampered snapshots, bounded schemas, form authoring/cancel/pending guards and whole report/drawing
content. An arbitrary 10 kPa strip patch from X100–400 mm on a 600 mm span gives 1,750/1,250 N per metre
support demands. The independent synthetic half-pour/dead/live/direct-load fixture totals 19.48 kN;
adding its explicit placement rectangle gives 19.88 kN at actual frame bases. No fixture magnitude is a
project recommendation, equipment rating or independent engineering validation.

Root verification: 512 pass, five retained upload-test failures and eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (preview 965.73 kB,
main 1,038.11 kB). AGENTS.md and the current upload typo are unchanged. No dependency install, live
app/provider, Firebase/configuration change, production persistence or construction issue occurred.
The feature stays off and release remains NO_GO. The full v0.7 workflow remains incomplete.

## Per-face pressure fields and actual side plywood transfer (preview.15)

Each `SideFaceLayout` can optionally hold a strictly validated `pressure` definition. Without it,
that face retains the prior common-head hydrostatic route. With it, the author must declare complete
face/Stage replacement scope and cite both pressure sources and omitted/unloaded portions. The
common head does not fill gaps or override a declared field. Mixed layouts keep the common head for
legacy faces only; all-explicit faces can leave it null. An empty source list is explicitly unloaded
only within a complete declaration. Raw unknowns remain unknown, including after zero case factors.

HYDROSTATIC sources use their own actual X interval, raw concrete gamma and local head from the panel
base. A known zero head is retained as zero; a missing head or gamma blocks that source. Separate
DECLARED_LATERAL/WIND/PLACEMENT sources specify actual X and Z extents, pressure at both Z endpoints,
ownership, evidence and their own mapping/design basis. The pressure direction is the physical face's
outward normal. Non-hydrostatic pressure is not derived from vertical DL/LL or a nominal material
property. Sources use HYDROSTATIC_SIDE/OTHER/WIND/PLACEMENT factors respectively, once. Raw definitions
are preserved alongside applied pressure patches/resultants. Same-owner sources and overlapping
concrete hydrostatic regions are rejected. Different explicitly sourced pressure kinds may add.
Normal-inward/suction or an invalid outward factor is blocked because contact/coupled behavior is not
modeled. Geometry, source method validity, dynamic magnitudes and combination completeness still
require independent engineering review.

The new path analyzes one-way, simply spanning X plywood strips on the actual stud coordinates.
Each source retains its actual partial X extent. The panel is partitioned at every actual Z source
boundary. Both endpoint-Z pressure fields are analyzed in each zone. Every response is affine in Z
within that zone, so the pair bounds the absolute elastic response throughout it; the two endpoint
load shapes are retained rather than replaced by a mean pressure. Actual plywood support reactions
become affine-Z line loads on the receiving studs, then travel through actual waler levels, two
independent rails and actual support nodes. Individual patch, plywood-to-stud and full-face force and
both first moments are checked. Source and face centroids use actual first moments, and zero force
has no invented centroid. Uniform full-face hydrostatic fixtures reproduce the old statics without
adding the plywood load a second time. Waler continuity is still independent of opposing-pair regions.

A nonuniform base pressure field has no single scalar base pressure; the scalar is null and the UI
labels it as varying along X while showing each patch and the actual maximum. The original legacy
peak-pressure strips remain envelopes for that legacy route only. New explicit faces instead retain
all actual endpoint-strip IDs and complete member/check/case/revision coverage. Unequal forces at
opposite ends of a tie remain separate and the tie demand stays unresolved; no average, maximum or
assumed mirror proof substitutes for a coupled model. All favorable scope/material/system results
remain BLOCKED/NO_GO.

The per-face editor starts scope, source kind, head, pressure, coordinates and mapping evidence
unknown. It clears competing hydrostatic/ramp fields on method changes and preserves independent
faces. Pressure inputs apply atomically with physical side members; pending inputs survive source
restamps and block freeze/download, case saves and Stage context operations. Changing a source
invalidates old graphs/review/snapshots. The common report and explicit `documentView.drawing.side`
contain the same pressure definitions, source resultants, endpoint analyses, transfers and real
restraints/routes from the frozen revision. Rehashed forged results fail recomputation. Source
pressure/case fields also participate in independent Stage capture and case reanalysis.

Bounds: 40 sources and 150,000 canonical characters per face, with the existing aggregate limit of
400 actual side strip/member analyses and 1,000 supports per case. Both endpoint analyses count;
unloaded zones are retained and no zone is truncated. One-way simple plywood, rigid stud support
lines and declared rail sharing remain assumptions. No two-way/continuous/cantilever panel, rolling
shear/fastener/bearing resistance, contact redistribution, closed clamp/yoke/ground brace system,
construction history, side-to-soffit placement correspondence or trusted design approval is added.

Seventeen regressions (13 domain, four React) cover legacy/full-field equivalence and mixed faces,
partial-X unequal plywood reactions, real X/Z force and global moment closure, disjoint hydrostatic
heads and nonuniform base pressure, endpoint response bounds against an independent uniform-load
benchmark, separate factors/mapping and raw values, unknown/zero/empty sources, overlap/extent/size
and authority rejection, unresolved opposite tie forces, complete Stage/case coverage, stale/imported/
forged frozen outputs, unknown initial controls, atomic/cancel/pending UI behavior and common report/
drawing identity. A synthetic patch X100–400, Z200–700 mm with 10→0 kPa carries 750 N at local X250,
Z366.6667 mm. Two 500 mm-wide hydrostatic regions with 500/1,000 mm heads at a synthetic gamma of
20 kN/m³ carry 1.25/5 kN. These are mechanics fixtures, not real pressure recommendations or engineer
validation of a project pour method, material or equipment.

Root verification: 529 pass, five retained upload-test failures and eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (preview 986.58 kB,
main 1,038.11 kB). AGENTS.md and the owner-retained upload typo are unchanged. No dependency install,
live app/provider, Firebase/configuration change, production persistence or construction issue
occurred. The feature stays off and release remains NO_GO. Full v0.7 integration is incomplete.

## Segmented tie product dossiers and actual body/interface records (preview.16)

The existing v0.6.2 source available in the archive is
`baseline/RC-FormWork_FormTie_Addendum_v0.6.2/engineering/Form_Tie_Design_Manual.md`.
The archive's baseline manifest lists that manual only for the Form Tie addendum; it does not
provide the full machine-readable product/rating pack or name its missing individual database files.
No catalogue filename, manufacturer table, legacy book strength, minimum engagement or equipment
capacity was invented to replace it. The new UI therefore offers authored unverified reference
records and numeric Custom changes rather than a supposed certified stock catalogue. Manual
sections on complete serial load paths, distinct tensile/stiffness areas, engagement, length datums,
Custom provenance and common-revision reports informed the implementation. No linked vendor website
or book PDF page was independently opened/re-certified during this continuation.

An optional `SideTieDefinition.dossier` is available only for the actual SEGMENTED_TIE topology.
It cannot compete with the old `assembly` field or substitute for a through rod, clamp/yoke or anchor.
Its 13 functional rows cover Inner, both Outer/end/thread/nut/plate functions and both local-waler
functions. These rows are not automatically counted as 13 physical BOM pieces. Each row starts with
unknown capacities/areas/modulus/lengths and empty identity/source fields. Product ID, manufacturer,
model, lot/inspection/reuse reference, material, thread mark, source version/reference, rating basis/
scope and length datum remain explicitly authored. Working/design/ultimate-test bases stay distinct.
Steel length, order length, outer exposure and cone recess are separate from the actual concrete
chord. No cut/order length, gross tensile area or capacity is inferred from that chord or thread name.

Custom changes are restricted to the named numeric properties. The original reference is retained,
the effective values are reconstructed from a continuous before/after history, and each edit records
reason, evidence, declared actor, canonical UTC time and draft revision. Identity/material/thread/
basis cannot be changed through a numeric override. The original source fields become read-only in
the UI once Custom history exists. Rewriting an original after editing breaks the stored reference
definition/history validation; forged effective/status/approval fields are rejected. Actor/time/
revision are client-declared audit data and confer no authentication, review or approval authority.

The dossier is explicitly bound to the actual selected support endpoints, physical vertices/height,
Stage, base datum, tie ID and outside diameter. Its binding also captures effective product identity/
geometry, rod gauges, thread interfaces and their measurement/datums. Moving a route, renaming a tie,
changing product geometry/areas or editing a thread/gauge makes that binding stale until explicitly
rebound. Capacity/E changes still invalidate the global model/review/snapshot and recalculate their
own indicators; they do not masquerade as a physical-route move. Binding is an input association,
not engineering approval. A stale binding supplies no current tie force or body indicator. The
balanced single tie demand is supplied by actual current waler reactions, never an entered demand,
average, two-face sum or half-force shortcut. If opposite demands differ, no single demand is selected.

Every serial row carries that full N. Numeric comparisons use only a matching ALLOWABLE or DESIGN
basis; ULTIMATE_TEST is not reduced or compared as a working resistance. A declared weak/zero value
can show a relative numeric FAIL even while other information is missing; missing rows never disappear
from a minimum. A complete same-basis minimum is explicitly an arithmetic minimum of authored
unverified values, not a certified assembly SWL. All favorable comparisons remain BLOCKED. Numeric
overflow is reported as an unavailable indicator, preserving independent known adverse conditions.

The thread-interface register records the actual product roles on each side, standard/designation,
nominal diameter, pitch-mm or TPI system/value, hand and male/female fit-class references. Known
nominal diameter/pitch/hand mismatches and a short entered effective engagement remain FAIL relative
to those declared inputs. Different notations, standards, lead systems or male/female fit classes are
not automatically converted into compatibility. Actual and required engagement have independent
measurement/producer-method evidence. No universal engagement, stripping formula, torque/preload
coefficient or complete physical interface graph is inferred. Completeness against the vendor's
actual system drawing remains unverified even when the register is declared complete.

Rod-body gauges use signed axial S coordinates from face A. They select actual nonoverlapping Inner/
Outer body portions and reference the separate captured At, stiffness area and E. Indicators are
`stress=N/At` and `body_extension=N*L/(E*A_stiff)` with explicit N/mm/MPa units. Missing At does not
erase an independently known EA extension; missing EA does not fabricate extension from At. The
combined selected body-gauge extension is null for missing gauge/elastic/datum information, overlap,
stale binding or contradictory known steel extent. Known selected gauge length exceeding a declared
steel length with a compatible datum remains an adverse screen. Individual scalar indicators never
certify yielding/rupture. Thread slip, seating, plates, cone/sleeve deformation, preload and total
assembly/wall movement remain unknown; no automatic doubling or sum into a wall tolerance occurs.

Explicit legacy migration retains the exact old source, copies only full-N capacity statements and
preserves unknown metadata/measurement evidence. Reduced local demand fractions are not promoted to
full-N capacities. The old engine/input remains intact until that explicit private-editor action.
Copying product data to another tie preserves reference/Custom history but clears route binding,
actual gauge coordinates and actual engagement measurements; producer-required engagement values
remain reference data. Every actual role, gauge and interface adds its own SIDE-09/typical coverage
target. Shared physical demand definitions exclude unrelated full dossier histories; entity-specific
records retain the actual product inputs, and any source edit still stales the global review plan.

The side editor applies dossier data with physical side fields. Nested unsubmitted Custom buffers
remain pending even if unrelated fields return to their saved values, survive revision restamps,
block parent/atomic case/Stage operations and disable freeze/download. Stable UI row keys prevent a
pending Custom edit from moving to a different tie on rename or earlier-row deletion. Explicit Custom
discard and whole-side restore clear those buffers. Report and drawing show the same frozen source/
effective/history data, full N, thread/engagement/length screens and body-only indicators. Rehashed
forged favorable results fail calculation recomputation.

Bounds are 13 functional component rows, 16 Custom edits per row, 20,000 characters per row, 40 body
gauges, 12 thread interfaces, 100,000 characters per dossier and 500,000 dossier characters across the
side layout. No data is truncated. Twenty-two regressions (15 domain, seven React) cover unknown
defaults, full serial N and independent At/EA, matched/missing/ultimate/zero capacities, adverse thread/
engagement/length conditions, stale route/product bindings, audited Custom reconstruction, legacy
migration/template reset, basis-aware Stage/case coverage, numeric bounds/overflow, frozen forgery
checks and real-panel nested pending/restore behavior. The synthetic fixture uses N=3.5416667 kN,
At=50 mm², A_stiff=80 mm², E=200,000 MPa and 1,250 mm of selected nonoverlapping body gauges, giving
70.8333333 MPa and 0.2766927083 mm. Those arbitrary mechanics values and 100 kN declared row values
are tests only, not product data, allowable stress recommendations or engineering validation.

Root verification: 551 pass, five retained upload-test failures and eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (preview 1,028.22 kB,
main 1,038.11 kB). AGENTS.md and the owner-retained upload typo are unchanged. No dependency install,
live app/provider, Firebase/configuration change, production persistence or construction issue
occurred. The feature stays off and release remains NO_GO. Full v0.7 integration is incomplete.

## Preview.17 — one-way side support demand handoff

`sideFrameTransfer.ts` transfers current actual support demands from `analyzeSideLayout` to a
separately authored downstream frame. Only explicitly selected `COLUMN_YOKE` or `GROUND_BRACED`
topology with no tie routes is supported. This is a demand handoff, not the missing coupled
ClampAssemblyDesign, closed-column-yoke, contact/anchor or complete frame resistance method.
All those system blockers remain. Plywood/stud/waler supports are still idealized by the upstream
side analysis; displacement of the receiving frame is not fed back to them. The user must declare
that the downstream frame excludes those already analysed members and provide scope evidence.
Client-authored references are not authenticated acceptance or proof of the physical idealization.

Each mapping names the actual face, waler, support and receiving `SIDE_SUPPORT` frame node. The
upstream side analysis is recomputed and compared against all supplied nodes. Missing, extra,
duplicate, stale and tampered sources/mappings are rejected. Connection evidence is required even
for coincident points; nonzero physical offsets require separate rigid-transfer evidence. Different
source application points cannot be collapsed into one receiving frame node, even with a declared
offset reference, because this would hide the member path between opposing forces. Multiple forces
at one actual coincident application point remain separate actions. No support demands are averaged.

Outward-positive side force is projected using the actual face normal. The waler couple uses
tangent × outward normal, while the actual source-to-receiving-node arm is passed to the frame
kernel to apply r×F once. Signed force and full XYZ moment resultants are checked against the
independent pressure-field resultants on the authored faces, using an origin near the source points.
All actual forces and world points, source revision, mappings, connection/offset references and
equilibrium evidence are retained in `frame.sideTransfer`. Missing physical face IDs remain visible;
source completeness over all surfaces, corners, openings, contacts and stages is not approved.

Frame source choices now include `SIDE_REACTIONS` and `SOFFIT_AND_SIDE_REACTIONS`. The combined
choice preserves both current actual head and side actions in the same Stage/case/revision. Side
forces already carry their pressure-source case factors; the transfer adds no second factor. A side
source cannot omit a same-Stage/case soffit source; a frame-only choice cannot omit either source
from the same Stage/case. An older soffit-only frame remains a partial preview with an explicit
side-not-included blocker. Extra frame actions cannot reuse a transferred side pressure ownership ID.
The Ringlock stack datum/member guards still apply to the combined source without relaxing actual
head, standard, jack or spigot checks. No brace/clamp is substituted for a tie or Ringlock standard.

`frameGeometryFromSide` captures only actual support datums and empty-evidence mappings. It creates
no anchors, bases, members, stiffness, material values, fixities or method acceptance. It rejects an
empty capture or more than 80 support nodes without truncation. Frame authoring is now available
for all five element types. Existing node/element/action bounds remain (80/240/1,000); the side
mapping schema allows up to 1,000 rows and 500,000 canonical characters, rejects authority/unknown
fields and preserves explicit unknown draft inputs. Full current analysis still requires every
source to have a valid receiving node within the frame limits.

The new `SideFrameMappingEditor` uses actual source selections and explicit connection/offset
references. A change of source/receiving node clears that row's old references; switching to a
source choice that excludes side actions clears its side mapping. The geometry capture button is
disabled for a nonempty graph or pending source edits. Side removal clears the side mapping and
frame method acceptance and requires an explicit new source choice. The existing atomic apply,
pending-edit/freeze/download guards and restamp-preserved draft behavior apply to the new fields.
`FrameResults` shows every transferred source, signed action, actual point, offset, source revision
and reference from the same frozen report/drawing hash. SIDE-10 and Typical requirements include
the actual downstream members/support nodes; none is automatically covered or checked.

Eighteen regressions (14 domain, four React) cover unknown capture, independent synthetic cantilever
forces/deflections, pressure resultant conservation, offset moments once, distinct receiving points,
stale/tampered/missing/duplicate source mappings, unknown stiffness/boundaries, topology isolation,
combined head/side actions with independent factors, ownership/source omission, actual coverage,
schema/bounds, translated/reversed axes, snapshot recomputation and pending UI/frozen report data.
The synthetic rectangular example uses gamma=20 kN/m³ and face heads 0.6/1.0 m over 1 m width,
giving 3,600/10,000 N and a 6,400 N unbalanced global Y force. One lower support carries 1,575 N;
its arbitrary 2,100 mm fixed cantilever with E=200,000 MPa and I=1,000,000 mm⁴ has 24.310125 mm
linear displacement. An explicitly shifted 100 mm force arm produces a 157,500 N·mm base couple.
These deliberately synthetic elasticity and support assumptions are not physical yoke/anchor
verification, recommended stiffnesses, rated products or approved serviceability limits.

Root verification: 569 pass, five retained upload-test failures and eight unhandled errors. Typecheck,
app/Functions/MCP builds and direct local MCP smoke pass. Chunk warnings remain (preview 1,044.67 kB,
main 1,038.11 kB). AGENTS.md, the current upload typo, shared Ringlock imports and the research/supplier
JSON hashes remain unchanged. There is still no `.git` in the inspected workspace. No dependency
install, live app/browser/provider, Firebase/configuration change, production persistence, deploy or
construction issue occurred. The feature stays off, release is NO_GO and full v0.7 remains incomplete.

## Preview.18 — offline coordinate proposal, human review and atomic apply

`layoutCandidate.ts` adds a strict local handoff for coordinates proposed by an AI or another external
source. It connects candidate intake to the actual side/soffit authoring and reaction pipeline without
calling a provider, modifying legacy AI APIs or using incomplete ratings to search for a passing layout.
It is not the remaining catalogue-driven candidate optimizer, AI extraction/provider integration,
validated resistance engine or trusted backend revision-review workflow.

`createLayoutCandidateRequest` copies the current model before awaiting SHA-256 and binds its entire
input identity, model/revision IDs, engine version, explicit physical Stage/case and millimetre units.
Existing authored layouts must share that Stage/case; compiled cases cannot receive proposals. The
read-only request context contains the actual concrete polygon/height, physical faces and human-selected
topology. The response template contains only editable coordinates. Concrete geometry, topology,
material/section/product data, loads, stiffness, manufacturer limits, stock, capacities and Design Basis
are locked. No source JSON can add forces, strength, E, approval or unknown fields at accepted levels.
Source citations and rationale are retained as unverified external claims, never executed instructions.

Scopes SIDE, SOFFIT and BOTH support the shared actual face/stud/waler/tie and joist/primary-bearer/head
pipelines. Side stations are local to the named actual face and the concrete base, while soffit XY
stations are offsets from polygon minima with the currently supported Y joists and X primary bearers.
Geometry checks require all physical faces (including ends), actual edges, sorted distinct stations,
waler/support bounds, unique IDs and complete tied support routes for a selected tie topology. Tie
centerlines must connect opposite supports at the same height through the concrete. This does not
certify diameter/clearance/collision, thread/fit/contact or product assembly behavior. Yoke/ground-braced
topology cannot be silently replaced by ties. A paired-waler or tie ID carrying product/history data
cannot be removed by a coordinate proposal; the owner must explicitly edit that data in its own editor.

Soffit candidates remain within the supported rectangular one-way model, with actual edge joists,
explicit member ends, bearer stations and individual head positions. Joist/bearer IDs cannot collide.
Direct member-bearing loads are protected by actual ID, axis, line and span: unrelated geometry changes
are allowed only when each loaded physical member retains that geometry. A moved, reindexed, resized
or removed loaded member requires manual load-location review. Head/base datums, plywood product data,
pressure definitions, load ownership and all existing engineering sources are preserved. Newly proposed
side/soffit components get null stiffness/weights/dimensions, empty evidence and other explicit unknowns;
no old nominal spacing, 50/50 rail sharing, pressure, tie diameter, base level, anchor or capacity is inferred.

`reviewLayoutCandidate` validates the entire source binding and reports the full coordinate changes
without changing the model or analysing an unaccepted AI layout. Applying requires the same reviewed
proposal hash and a separate explicit human coordinate-review action. The operation creates one new
draft revision, rebuilds available actual side/soffit analyses and retains all missing properties as
BLOCKED. Human input review is reset; a coordinate-review click is not approval of all engineering
inputs. Existing frame, Ringlock assembly, case book, Stage study and applicability review data are
retained byte-for-byte in memory with their old stamps, rather than being automatically rebased to
changed supports. They remain stale until their own explicit review/reapply. No old physical datum or
force graph is silently shifted into a new candidate.

The optional `model.layoutCandidate` records the latest full applied proposal, its original input
binding/hash, proposal hash and application revision. It is client-authored provenance, not authenticated
review, an immutable audit ledger, a full revision history or engineering acceptance. Import resets
human review and keeps the original provenance historical. The common frozen report and drawing carry
the same proposal record; later input edits invalidate output freshness as before.

`LayoutCandidateEditor` exposes manual request copying, strict JSON intake, a complete before/after
coordinate table, invalidation notices and an explicit review checkbox before apply. An edit to the
proposal or current inputs cancels its reviewed state. Unapplied proposal work blocks freeze/download;
other pending source editors block request/review/apply. Candidate application also rechecks both the
current model and pending source buffers after asynchronous work, so a buffer opened in another editor
cannot be discarded by a late result. Input controls are disabled while the candidate operation is in
flight, and explicit discard restores the current frozen-output availability without applying a proposal.

Bounds: 150,000 canonical proposal characters, 8,000,000 source characters, 64 faces, 40 stations per
line, 12 waler levels, 1,000 side supports/ties, 400 baseline side analyses and 400 soffit heads. Existing
actual-engine and frame bounds still apply; no layout is truncated or snapped to make it fit.
Twenty-two regressions (17 domain, five React) cover source/revision/engine binding, immutable async
capture, locked/forbidden fields, geometry bounds/scope/routes, no-op proposals, raw unknown new
components, product/history preservation and stale actual tie geometry, atomic BOTH application,
independent reaction recomputation, protected direct bearing and unrelated member changes, retained
stale frame/assembly/case/Stage inputs, explicit human gates, changed text/source invalidation,
pending-buffer races in the real panel, common frozen provenance and escaped external source text.

The first full test run while the builds were active recorded two additional 5-second timeouts in
the side-UI and spatial-load Stage studies. Their unchanged focused rerun passed all 15 tests, then
an unchanged full `npm test` run after builds finished passed 591/596, leaving only the five retained
upload-test failures/eight unhandled errors. No test timeout, assertion or test configuration changed.
The initial log is retained separately. Typecheck, app/Functions/MCP builds and direct local MCP smoke
pass. Chunk warnings remain (preview 1,069.60 kB; main 1,038.11 kB). AGENTS.md, the retained upload typo,
legacy source inventory and shared Ringlock reference data are preserved. No dependency install,
live app/browser/provider, Firebase/configuration mutation, deployment or construction issue occurred.
Feature default remains OFF, release remains NO_GO, and the complete v0.7 work is not finished.

## Preview.19 — actual base wrenches and conditional support contact

The owner answered “ยังไม่มี” for support Design Basis / soil / young-slab evidence. No values
were invented or taken from the Ringlock geometry/mass references to fill this gap.

- `supportLayout.ts` supplies strict draft-only support schema, `captureSupportLayout`,
  `stampSupportLayout` and `evaluateSupportLayout`. Capture transfers only actual BASE IDs and
  Stage/case from a current produced frame. It creates no plate dimensions, soil stiffness,
  pressure limits, orientation, weight or engineering evidence.
- `frameWorkflow.ts:currentProducedFrame` uses ephemeral object lineage and current input/output
  fingerprints. A copied, altered, serialized or stale frame result cannot become a support source.
  This proves local calculation lineage only; it is not authenticated engineering approval.
- Every restrained frame node must be accounted for, including zero-force nodes and non-BASE
  restraints. Each row retains signed `F=[Fx,Fy,Fz]` N and `M=[Mx,My,Mz]` N.mm acting from frame
  onto support, opposite the reported frame reactions. At another actual plane,
  `M2 = M1 + (r1-r2) cross F`, once. Reactions are never divided equally across legs.
- A direct path requires explicitly zero sole-board thickness and one Jack-to-support plane.
  A sole-board path requires two serial planes with actual top/bottom elevations, thickness,
  local horizontal orthonormal axes, rectangle geometry and evidence. The upper footprint must
  fit the actual lower board rectangle; no assumed 45-degree spreading is introduced. If an
  installed Ringlock assembly exists, the path must close its actual base/ground datums too.
- Weight at each plane is either explicitly added with raw N, ownership, source and actual CG,
  or references an existing current SELF_WEIGHT frame action. Known zero is distinct from
  unknown; a positive raw weight requires its CG even in a zero-factor case. Added weights have
  distinct ownership and use SELF_WEIGHT coefficients once. A known wrench can continue when
  only a pressure-law hypothesis is unknown; unknown component weight blocks downstream totals.
- `bearingContact.ts:analyzeBearingContact` implements only the explicitly declared law
  `p=max(0,a+b*x+c*y)` over an actual rigid horizontal rectangle. Coordinates are normalized for
  the solve. Exact clipped-polygon area/first/second moments and a scaled Newton solve recover
  compression-only equilibrium; independent full-contact and triangular-contact fixtures verify
  statics. Partial contact is solved without replacing tensile corner pressure by a fabricated
  averaged demand. A resultant outside/on the footprint or tensile normal force fails relative
  to this unanchored law; near-edge/ill-conditioned/out-of-range solves stay unavailable.
- Results retain the compressed polygon, eccentricity, peak/corner pressures, area and force/moment
  residuals. MPa is N/mm2; the UI converts kPa exactly once. Full transfer equilibrium is separately
  checked for each base and both serial planes. Unknown values are never serialized as zero,
  Infinity or NaN. A known unloaded plane is explicitly identified.
- Optional pressure limits require a stated source and matching SERVICE/ALLOWABLE or
  FACTORED/DESIGN basis. Exceedance is a relative FAIL; favorable values remain BLOCKED.
  CHARACTERISTIC/TEST values are not converted to approved resistance. Limits are unverified
  draft inputs, not an authoritative capacity pack.
- Optional positive, sourced uniform subgrade `k` in N/mm3 produces only conditional rigid-plane
  displacement/gap from `p/k` at the soil interface. It cannot substitute for timber or slab
  stiffness. Plane gradients have units mm/mm. No default k, friction coefficient, settlement
  criterion, slab-age strength or reinforcement is provided. H/N and Mz remain demands only.
- Each actual base/interface has distinct member/check/case/revision identity for applicable
  RINGLOCK-15/16/17, SIDE-10 and Typical checks; structured IDs avoid punctuation collisions.
  This is requirement coverage, not a completed engineering check.
- The root model, explicit cases and independent Stage studies recalculate support paths from
  their own frame result. Copying a Stage clears support scope evidence and young-slab evidence.
  Offline coordinate proposals preserve support inputs with old stamps as stale data. A support
  edit is included atomically in manual layout analysis, and blocks coordinate requests,
  Stage/coverage capture and snapshot freeze/download while pending.
- `SupportLayoutEditor.tsx` exposes draft data with no engineering defaults. `SupportResults.tsx`
  renders signed demands, conditional contact areas and missing information in current results,
  every selected case/Stage and the common frozen report/drawing. The contact schematic is a
  demand illustration, not an installation or construction drawing.

The 35 new tests comprise 9 contact-kernel, 22 support-domain and 4 React tests. They include
unequal legs, two serial interfaces, rotated axes, eccentric self-weight, moment reference changes,
missing CG/weight/soil basis, unmapped restraints, ownership duplication, measured assembly
closure, factor-once cases, independent Stage data, invalidated AI proposals, strict authority
rejection, numeric range guards, atomic pending data and common snapshot integrity.
All numbers and sources in these fixtures are explicitly SYNTHETIC, not project design data.

Verification: typecheck, app/Functions/MCP builds and local MCP smoke passed. Default full test
run: 625 pass / 6 fail including one 5000 ms spatial Stage timeout. Focused unchanged spatial
file: 12/12 pass. Complete run with maxWorkers=4: 626 pass / 5 owner-retained upload failures,
8 unhandled errors, 62 passing files / 1 failing file. New tests: 35/35 pass. No test configuration
or timeouts changed. Build retains the >500 kB warning (preview chunk 1114.49 kB; main 1038.11 kB).
Protected AGENTS, upload typo, shared reference imports and both updated Ringlock JSON files
remain unchanged. Original 52-file inventory retains the same three historical differences and
no removals. Workspace still has no Git metadata. Feature remains off; no app/provider, live
Firebase/emulator, dependency install, deployment or construction issue occurred.

Remaining boundaries: no footplate/sole-board bending, shear, local yielding or punching design;
no verified contact rigidity, friction/anchor/torsion resistance, soil bearing or allowable settlement;
no slab geometry/rebar/age/history/punching method; no settlement feedback to the frame, second
order or overall system certification. The new P–Delta screen is a conditional geometric-demand
iteration only; it does not replace those checks. Both serial surfaces remain a conditional demand study.
Full v0.7 remains incomplete and NO_GO pending actual data, reviewed methods and integration.

## Preview.20 — actual U-head opening and bearer contact demands

Requirement source: the owner-supplied archive's `engineering/Calculation_Workflow_v0.7.md`
sections 6.2, 9.3 and 11 require actual U-head width, seating, eccentricity, retention and traceable
individual reactions. The integration prompt requires preserving the legacy engine, a default-off
feature and explicit blockers for missing products/methods. No new source conflict was found.

- `headBearing.ts` provides `HeadBearingDefinition`, `emptyHeadBearing`, strict
  `validateHeadBearing` and `evaluateHeadBearings`. The optional record is attached to each actual
  installed leg in `ringlockAssembly.ts`, not to a generic catalogue head or an average tower leg.
  Old authored assembly inputs remain schema-compatible; current-engine snapshots must be regenerated.
- All product IDs, plate dimensions, actual centre/axis, minimum cavity width over the bearer
  envelope, cavity offset, actual bearer width/depth, contact rectangle, side clearance, blocking
  and contact-law evidence start unknown. No catalogue Jack length, nominal tube label or geometry
  library mass becomes a seat dimension, restraint or capacity.
- The source graph is rebuilt from the authored soffit, compared with current member/action/head
  data, and reanalysed once for authored contact records. Supplied terminal reactions must match
  the actual current U-head set exactly. Source revision, assembly stamp, Stage/case, actual bearer
  support and link must agree. Known upstream wrenches remain visible when contact properties are
  missing; no replacement force or equal-share leg allocation is introduced.
- Each row retains upstream analysis/support/station/head/revision/case identity. Signed global
  force and moment at the bearer point are translated to the shaft plane and contact centre with
  `M2=M1+(r1-r2) cross F` once. These are the bearer contribution only, not all actions or resistance
  of the Head Jack. Head/self-weight already belongs to its actual owning action; it is not added
  at this contact again. Case coefficients are already included upstream and are not reapplied.
- Geometry currently supports one declared flat bearer parallel to the head's explicitly entered
  unit open axis. Local Y is its mathematical right-handed perpendicular. Unknown, nonunit or
  oblique axes remain unavailable. Multiple bearers/rails and bound CHS curved seats remain
  BLOCKED for a coupled or actual saddle/retainer method, rather than using an equivalent rectangle.
- Body width is distinct from flat contact width. The body-centre offset from the analysis line is
  explicit too: null blocks geometry and a declared 0 is required for concentric alignment. Left and right clearances are checked separately
  against the declared minimum; sufficient total spare gap cannot hide one inadequate side.
  All contact corners must lie on both the actual plate and the bearer face/real end bounds.
  A support at the cut end does not acquire an imaginary bearing extension. Geometry conflicts
  produce relative FAIL with the actual margins, without shortening, snapping or spreading contact.
- Actual bearer depth must match the installed upper stack. Where an elastic catalogue/measured
  binding exists, B/H and its declared orientation must match the measured body envelope. Measured
  timber uses actual dimensions, never its nominal label. Missing geometry is not inferred from E/I.
- Explicit flat-rigid pressure-law evidence enables only the existing conditional rectangular
  compression-only solver. It retains eccentricity, partial contact, exact area and equilibrium
  residuals. Geometrically impossible pressure equilibrium fails relative to that declared law;
  a favorable pressure stays BLOCKED with no manufacturer rating or allowable stress supplied.
  Unknown law/evidence retains the known wrench and no pressure result.
- A BOTH_SIDES declaration without actual evidence, NONE or unknown retention remains an explicit
  blocker. Presence of a record does not prove blocking strength, fixity, friction or lateral restraint.
  Plate thickness is recorded geometry, not a plate bending/resistance calculation.
- Actual head identities add SOFFIT-06/07/08, RINGLOCK-01/02/05/15 and applicable Typical rows to the
  member/check/case/revision matrix. Applicability includes actual head Jack extension/engagement,
  datum, contact definition and source link. Missing contact records still retain mandatory rows.
  The existing multi-case regression now checks every physical head in every case explicitly.
- `HeadBearing.tsx` supplies draft fields inside the existing assembly editor and results inside
  `RinglockAssemblyResults`. Its existing pending/atomic-apply guards cover the new fields. An edit
  blocks snapshot freeze/download and coordinate proposals; analysis applies pending assembly and
  frame data together. Cases and independent Stages recalculate their own contact demand.
- Copying a Stage retains measured physical dimensions but clears contact-law and side-blocking
  evidence for review in the new Stage. Offline coordinate apply retains the old assembly and
  head-seat data as stale inputs. Frozen drawing/report include the same `headBearings` result;
  rehashed forged pressures fail recalculation verification.

The 25 new tests comprise 21 domain and 4 React tests, with SYNTHETIC geometry/assumptions only.
They cover unequal head forces, side-by-side clearances, real beam ends/contact face, eccentric
partial contact, impossible resultants, axis reversal/obliquity, unknowns, product/datum/envelope
mismatch, actual timber dimensions, curved CHS/multiple rails, source tampering, factors once,
independent Stage data, stale AI proposals, strict authority rejection, pending atomic apply and
common frozen output. No numeric fixture is an actual head rating or approved installation detail.

Validation: 25/25 new tests and 17/17 focused load-case tests pass. Final complete run using
maxWorkers=4: 651 pass / 5 retained upload failures, 8 unhandled errors, 64 passing files / 1 failing
file. Initial complete run: 650 pass / 6 fail; its extra failure was the outdated requirement-inventory
assertion, now extended and strengthened for actual heads. No timeout/config or upload-test edits.
Typecheck, app/Functions/MCP builds, local MCP smoke and native NodeNext imports passed. Vite retains
the >500 kB warning (preview 1137.09 kB; main 1038.11 kB). Source preservation is recorded in
`artifacts/workflow-v07-preview20-source-hashes.json`. AGENTS, owner upload typo, shared imports,
updated Ringlock JSON and the original 52-file inventory retain the same prior state.

Still required: real product/configuration and engineering evidence; plate bending/local yielding,
actual bearing resistance, arms/retainer/fastener strength, friction/rolling/torsion, thread/spindle
buckling, connection slip and coupled deformation, full second-order/global-system checks, support Design
Basis/soil/young-slab data, independent engineer-reviewed benchmarks and trusted review/issue
integration. Full v0.7 remains incomplete; feature remains off and NO_GO. No live app/provider,
Firebase/permission/MCP-tool change, dependency install, Git mutation, deployment or construction
issue occurred. Owner manual acceptance and live-use authorization remain separate boundaries.

## Preview.21 — explicit P–Delta geometric stiffness screening

Requirement source: `engineering/Calculation_Workflow_v0.7.md` section 9.3 calls for stage-by-stage
second-order stability, while the migration prompt requires unknown physical data to stay blocked.
The implementation adds a numerical geometric-demand path without turning missing Ringlock ratings,
connection behaviour or support contact into assumptions.

- `frameSecondOrder.ts` accepts a current `LinearFrameInput` plus an authored
  `SecondOrderDefinition`. Every actual frame node must have an explicit signed imperfection vector
  and evidence; a missing row is `UNAVAILABLE`, not an assumed zero. Iteration limits and numerical
  tolerances are explicit controls, not material properties. Compression uses signed geometric
  stiffness; tension stiffening is off unless the author declares it.
- The solver reuses the exact validated first-order member matrices and action vector, assembles
  local 3D beam-column geometric stiffness in both bending planes, applies the declared initial
  imperfection once, solves a scaled tangent system, and reports iteration/residual/axial-force
  changes. Loss of positive definiteness is an explicit relative `FAIL`; an unconverged screen stays
  `BLOCKED`. A bounded elastic tangent-loss multiplier is reported when the signed force state
  permits it; that multiplier is explicitly not an SWL, K-factor or member/system resistance. No
  penalty spring, generic restraint or capacity is inserted.
- `frameWorkflow.ts` carries the optional second-order definition and current result on the same
  Stage/case/revision lineage. Enabling it changes requirement applicability to the P–Delta method,
  but result status remains a demand preview with `NO_GO`; stale source edits still invalidate the
  layout and frozen report/drawing still recompute from one shared snapshot.
- `FrameLayoutEditor.tsx` exposes evidence, iteration controls and per-node imperfection records.
  Incomplete method evidence or node records remain `BLOCKED` during analysis, while nonnumeric
  fields are rejected on apply. `FrameResults.tsx` shows the first/second-order axial comparison,
  convergence state and blockers without presenting a utilization or construction verdict.

The new synthetic tests cover explicit-node completeness, signed compression iteration,
optional tension stiffening, authority/range rejection, same-revision workflow integration,
freeze/revision consistency and
the pending UI authoring path. Values are software fixtures only; they are not Ringlock material,
imperfection or resistance data. The method still lacks distributed member-curvature imperfections,
joint slack/contact, uplift/sliding, brace/connection nonlinearity, actual system ratings, global
wind/load combinations and independent engineering benchmarks. Those remain required before any
stability claim. Focused verification is 25/25 including the Stage-copy and freeze/revision guards. The complete current run is 660 pass / 5 retained
upload failures out of 665 with 8 unhandled errors; the only failing file is the owner-retained
`tests/source-upload.test.tsx:21` identifier. No test configuration, timeout or upload assertion
was changed. Typecheck, app/Functions/MCP builds and direct local MCP smoke passed. Vite retains
the >500 kB warning (preview 1154.29 kB; main 1038.11 kB). Source hashes are recorded in
`artifacts/workflow-v07-preview21-source-hashes.json`; the structured command record is
`artifacts/workflow-v07-preview21-verification.json`.

## Preview.22 — member N–M–V–T demand ledger

The Ringlock analysis contract requires every standard, ledger, brace and connection target to
retain signed N/M/V/T actions before a compatible resistance rule can be selected. Preview.22 adds
`frameDemands.ts` as a demand-only adapter over the current validated linear result.

- Each member keeps both local end force/moment vectors, signed axial force at I/J and absolute
  N, Vy, Vz, T, My and Mz envelopes in N/N·mm. The row carries the same input revision, Stage,
  load case and SERVICE/FACTORED basis as the frame solver.
- Role mapping links STANDARD, LEDGER, BRACE, SPIGOT, HEAD_JACK and BASE_JACK to the existing
  Ringlock check IDs. Missing effective-section, buckling, connection, joint, jack or resistance
  evidence is listed per row; no nominal catalogue value becomes a capacity or utilization.
- If P–Delta is present, its explicit axial result is shown beside the linear demand. End bending
  and shear are not reconstructed from the axial-only second-order screen and remain an explicit
  blocker. The ledger status is always `INCOMPLETE` / `NO_GO` until a reviewed rule pack exists.
- `FrameResults.tsx`, frozen report/drawing content and the frame revision lineage expose the same
  rows. Synthetic tests cover signed extraction, role mapping, optional second-order axial carry,
  revision identity and the UI table; fixtures are software checks only.

Preview.22 still lacks manufacturer/member/connection resistance, support contact capacity,
distributed imperfections, nonlinear joints, global load-combination completeness and independent
engineering benchmarks. It does not change the feature gate or construction release boundary.

## Preview.23 — explicit resistance evidence gate

Preview.23 keeps the Preview.22 demand ledger and adds `resistanceEvidence.ts` as a strict input
gate. A frame member may carry one explicit record for each axial compression/tension, shear-Y/
shear-Z, torsion and moment-Y/moment-Z quantity. Each record declares its unit, action basis,
resistance basis, method, source reference and revision, evidence reference and review reference.
The editor starts every row with null capacity and `REFERENCE_ONLY`; it never fills a supplier,
Ringlock, timber, plywood or Form Tie value.

- `SERVICE` actions can only be compared with an explicit `ALLOWABLE` record and `FACTORED`
  actions only with an explicit `DESIGN` record. `CHARACTERISTIC` and `ULTIMATE_TEST` records
  remain `INCOMPLETE`; no factor, interpolation or conversion is inferred.
- A complete reviewed row is labelled `SCREENED` and may show a utilization computed from the
  supplied capacity. An exceeded supplied capacity is `FAIL`. Both paths remain `NO_GO`, carry
  `confirmed: false` by the surrounding workflow boundary, and do not grant construction release.
- Evidence source revision must match the analyzed frame revision. Missing, duplicate, stale,
  unreviewed, unknown-basis, unknown-capacity or unit-mismatched rows remain explicit blockers;
  `FrameResults` shows the per-quantity gate beside the demand ledger.

The editor and domain tests use synthetic values only. No manufacturer rating, Form Tie strength,
Ringlock system resistance, support/soil capacity or construction material record was added. The
owner's support Design Basis remains unavailable and the complete Form Tie v0.6.2 machine-readable
pack remains missing.

The four-file focused frame suite passes 24/24. Full verification preserves the five owner-retained
upload failures and eight unhandled errors (670 pass / 5 fail out of 675); no test configuration or
upload-test source was changed. Typecheck, app build, Functions build, MCP build, direct local MCP
smoke and compiled NodeNext imports pass. The app build retains the Vite chunk warning (Workflow
chunk 1,168.69 kB; main 1,038.11 kB). Command details and source hashes are recorded in
`artifacts/workflow-v07-preview23-verification.json` and
`artifacts/workflow-v07-preview23-source-hashes.json`.

## Preview.24 — explicit frame SLS evidence gate

Preview.24 adds `frameSls.ts` to retain the frame solver's per-node translation and rotation
demands against explicit project serviceability limits. The frame layout stores the limit rows
separately from member resistance, so a node limit cannot be mistaken for a member rating.

- Each actual node receives six named quantities with explicit `MM` or `RAD` units. Missing rows,
  unknown limits, stale source revisions, duplicate rows, non-reviewed evidence and a FACTORED
  frame basis remain `INCOMPLETE`; an unavailable rotation is never replaced with zero.
- Only a reviewed `SERVICE` limit with matching source revision is comparable. An exceeded limit
  is `FAIL`; a within-limit comparison is `SCREENED` with a blocker that it is not construction
  approval. The frame result remains `NO_GO` and the frozen report/drawing carries the same rows.
- The editor starts rows with blank node/quantity/limit and `REFERENCE_ONLY`; it does not create a
  deflection code, settlement limit or support feedback model. Copying a physical Stage clears
  SLS source/review evidence so the new stage cannot inherit an old limit decision.

The synthetic SLS fixtures are software checks only. No project deflection limit, soil settlement
law, slab age/punching basis or engineering approval was added.

The authoritative `ringlock-analysis-contract-1.0` still marks all 12 checks (`LOAD_PATH`,
`GLOBAL_STABILITY`, `STANDARD_N_M_V`, `LEDGER_MEMBER`, `BRACE_T_C`, `LEDGER_ROSETTE`,
`ROSETTE_WELD`, `SPIGOT`, `JACK_HEAD_BASE`, `SUPPORT_CONTACT`, `SLS`, `STAGE_RELEASE`) as
`PROPOSED_NOT_IMPLEMENTED_BY_THIS_HANDOFF` with `INCOMPLETE` on missing input. Preview.24 adds
screening gates around current frame outputs; it does not claim to close that solver handoff.

## Preview.25 — contract audit and revision-scoped case inventory

Preview.25 adds `contractAudit.ts` and attaches a deterministic twelve-row audit to every current
frame preview. The rows follow `ringlock-analysis-contract-1.0` (`LOAD_PATH`, `GLOBAL_STABILITY`,
`STANDARD_N_M_V`, `LEDGER_MEMBER`, `BRACE_T_C`, `LEDGER_ROSETTE`, `ROSETTE_WELD`, `SPIGOT`,
`JACK_HEAD_BASE`, `SUPPORT_CONTACT`, `SLS`, `STAGE_RELEASE`) and carry the same input revision,
physical Stage and load-case identity as the frame result. A named load-case preview receives its
own audit, and the frozen report/drawing carries the same audit inventory. `WorkflowDocuments`
shows the inventory even when a frame layout has not yet been authored, so an absent frame cannot
silently hide the contract gap.

The audit preserves a known `FAIL`, lets a partial P–Delta or SLS route remain `SCREENED`, and
keeps any other missing row `INCOMPLETE`; aggregate status therefore cannot hide incomplete
coverage behind a partial screen. Every row remains `NO_GO`, `confirmed: false`, and carries
explicit missing-input/blocker text. No manufacturer rating, connection law, support capacity,
serviceability limit or Stage release was inferred.

## Preview.26 — downstream contract overlays

Preview.26 keeps the frame calculation object in its in-process lineage while attaching the later
workflow results to the contract audit. `JACK_HEAD_BASE` now carries the actual assembly nodes and
jack segments plus the head-bearing rows and their existing geometry/contact issues. `SUPPORT_CONTACT`
now carries each actual base, frame mapping and contact interface plus the signed support-transfer
issues. These rows remain `INCOMPLETE` when the user has supplied only demand/geometry and no reviewed
connection, soil, slab, settlement or resistance basis; an existing known failure stays `FAIL`.

When a Stage study is present, `STAGE_RELEASE` is overlaid for the active audit and each captured-stage
preview with the actual `STAGE:<record-id>` entity and stage evidence. The same revision/stage/case
identity is retained in the report, drawing and case inventory. The overlay is traceability only:
it does not add a capacity, convert `BLOCKED` to PASS, set `confirmed`, or change `NO_GO`.

## Validation and release boundary

New regression fixtures cover rectangle/L/U pairing, transformations, unsupported geometry,
tie paths/crossing, units, concrete ownership overlap, null loads, catalogue preservation,
material thickness bands, Custom restrictions, continuous beam analytical benchmarks, discrete
load transfer to unequal U-head reactions, serial tie force, missing Ringlock ratings, coverage,
frozen/stale/tampered snapshots, feature isolation and React DOM editing/download behavior.

The first pre-change `npm test` run had two Firebase mock import hooks time out (16 suites and
181 assertions passed; 40 tests skipped). A subsequent unchanged test configuration ran successfully.
No test timeout was increased and no assertion was removed to obtain a pass. Final command evidence
is recorded in the completion message. Root tests include mocked Firebase/provider adapters; rules
and authenticated emulator suites are separate and were not run for this isolated change.

Initial preview combined workspace: `npm test` passed 260 tests in 23 files. This chat added 35 tests in
three files. A separate chat added Ringlock plan selection/drawing and four tests during this
work; it was idle when detected in the final inventory. Its files and shared-panel additions
were preserved and included in the final compile/test/build verification. The plan presets do
not add actual head reactions, supplier compatibility or configuration ratings.

The soffit continuation adds 15 independent numerical/domain/React tests: 275 tests now pass in
25 files. The synthetic slab fixture conserves 23.76 kN and produces 2.413125/7.05375 kN outer/
middle head demands on continuous bearers rather than equal total/leg allocation. Other fixtures
exercise asymmetric beam ownership patches, explicit self-weight, translated/irregular geometry,
physical member overhangs, unsupported uplift, missing inputs, stale/tampered generated graphs,
actual requirement assignment, old engine snapshots and full field authoring→freeze→load-edit
invalidation. Numeric fixture properties are test assumptions and carry no real product rating.

`npm run typecheck`, `npm run build`, `npm run build --workspace functions`, `npm run mcp:build`
and `node scripts/test-mcp.mjs` passed. Build retains the >500 kB chunk warning, including the
lazy reference-data panel. See `artifacts/workflow-v07-verification.json` for the command record.

Independent mathematical fixtures are software verification, not engineer validation of the real
assemblies. No browser/mobile visual QA, printed PDF acceptance, live provider use, production
operation, physical component testing or construction issue occurred.

## Engineering and integration work still required

1. Obtain the complete Form Tie v0.6.2 machine-readable product/assembly data and compatible
   Inner/Outer/thread/nut/plate evidence; the attached baseline contains its manual only.
2. Confirm design basis/edition/load combinations, actual wet plywood/product conventions,
   timber dimensions/grade and site conditions, steel member resistance and connection methods.
3. Build/review product-specific resistance rule packs, actual candidate placement and the full
   required-member/check catalogue mapping; add independent engineer-reviewed examples before
   any CHECKED_IN_SCOPE system claim. Numeric input completeness is insufficient.
4. Obtain manufacturer/system/configuration Ringlock ratings, installed head/base datums and
   engagement/extension limits, nodal/bracing stiffness, wind/imperfection/second-order basis,
   ground or young-slab checks, and erection/stripping/reshoring inputs. Then integrate a
   validated frame/rating method; do not extrapolate the geometry/mass library.
5. Extend the side/soffit editors to full product/connection fitting and local axes, timber/plywood
   rules, complete tie assemblies and Ringlock configurations. Add bounded catalogue-driven AI
   candidate explanation/search only after its data/method prerequisites exist. The offline coordinate
   proposal/review/apply handoff is available, without provider invocation or rated candidate search.
6. Separately scope trusted persistence/review/issue integration and immutable artifact storage.
   This implementation intentionally creates no Firebase migration or permission changes.
7. Complete real visual/PDF/installation drawing QA and owner manual acceptance in a separately
   authorized environment. All current exports remain DRAFT / NO_GO.

## Closure Pack v1 integration after Preview.26

The owner supplied `RC-FormWork_Closure_Pack_preview26_v1`. Its machine-readable references are
preserved under `src/reference/workflow-v07/closure/`, with the full handoff copy under
`docs/closure-pack-preview26-v1/`. The six Form Tie v0.6.2 baseline JSON files were copied
byte-for-byte according to the pack manifest. `workflowV07References.ts` now loads and validates
the 11-record Form Tie bridge, six topology templates, 13 canonical check slots, five input
templates and the separate 17-record Ringlock component sidecar at application reference-load
time.

`closurePack.ts` is an adapter over the existing `TieDossier` and Ringlock domain types. It maps
only explicit product properties, engagement evidence and source references into a draft closure
contract; it never guesses a reference record, fills a missing capacity, treats a separator as an
Outer/Nut/Plate rating, or converts a breaking load into an allowable value. `BEARING_PLATE_LEFT`
and `BEARING_PLATE_RIGHT` have only the explicit mappings to `PLATE_LEFT` and `PLATE_RIGHT`.
Continuous through-rods and Custom templates remain `UNSUPPORTED_TEMPLATE`. Ringlock lookups are
exact selector matches only, and the sidecar remains a component reference rather than a complete
configuration rating. All adapter results retain `confirmed: false` and `constructionRelease:
NO_GO`.

The new adapter regression file is `tests/workflow-v07-closure-pack.test.ts` (7 tests). It covers
asset inventory/hash-compatible loading, slot aliases, unknown draft fields, explicit TieDossier
mapping, exact Ringlock lookup, the 105 kN·cm → 1.05 kN·m reference, and untrusted support/SLS/
stage template gates. The full verification record is `artifacts/closure-pack-integration-report.json`.
The package data closes the loader/schema/reference gap only; actual Form Tie assembly capacity,
Ringlock configuration/head/base/joint behavior, soil/slab/young-slab basis, serviceability
criteria, rule-pack review, Stage release and construction approval remain owner/engineer inputs.
