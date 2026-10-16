# v0.2 — paired waler and tie screening

This is a software-calculation phase, not engineering acceptance or fabrication release.
All favorable member checks remain INCOMPLETE. Any unfavorable numeric check remains FAIL.
The owner authorized continuation of the existing private cloud Site; its audience is unchanged.

## Mechanical contract

Units: pressure kPa, dimensions mm, forces N internally (kN in tables), stresses/E MPa, I mm^4.
The source face resultant uses triangular hydrostatic pressure: F = gamma H^2 b / 2.
Member screens deliberately use a constant full-height pmax = gamma H as a conservative load envelope.
Consequently summing the vertical row envelope loads gives twice the static triangular resultant.
No set-time reduction, bottom pumping, impact, pour-rate formula or other load combination is introduced.

The vertical grid divides H into ceil(H/requested waler spacing) equal bays.
Row tributary height is half the adjacent upper and lower spans; top/base rows have half a bay.
Each stud receives its actual horizontal tributary width, with half-width at the face ends.
The governing row applies Pj = pmax (N/mm^2) x bj x hv to the pair of walers.

Rectangular footings: face support grid divides each face into equal bays no longer than requested tie spacing.
Interior supports represent idealized through-ties; both face ends represent unverified corner supports.
Columns and L shapes use only two idealized corner supports per face, with no through-tie substitute.
Corners, offsets, overhangs, end conditions and tie intersections must be physically designed separately.

Each waler bay is independently pinned at both ends. This is not a continuous beam solver.
Loads exactly at a support are added once directly to that support, with no duplicate bay loading.
Interior point loads give RA = sum[Pj (L-aj)/L], RB = sum[Pj aj/L].
Interior support reaction is the sum of adjacent bay reactions plus any direct support load.
Full-pair reactions satisfy sum R = sum P and moment equilibrium.

M(x) = RA x - sum[Pj max(x-aj,0)]. The moment maximum is evaluated at load coordinates.
For downward-positive displacement, C = [RA L^3 - sum Pj(L-aj)^3]/(6L),
EI delta(x) = Cx - RA x^3/6 + sum Pj max(x-aj,0)^3/6.
Maximum deflection is found from the monotone slope zero for nonnegative point loads.
No sampled maximum is used to determine pass/fail; curve samples are only for the graphic.

The governing member receives share alpha (0.5–1.0); the other receives 1-alpha.
The default alpha=1.0 does not assume equal sharing. Pair sections are not composite.
Moments/shear/deflection are scaled by alpha; support reactions and tie force use the whole pair.
Sharp-corner, uniform-thickness RHS and unlipped C properties are nominal screens only.
H denotes the bending depth normal to the form face. C torsion/lips/effective properties remain unverified.
Average shear is V/Av screened against Fy/(sqrt(3) Omega_v), not code-complete shear strength.

## Tie contract

For a rectangular footing T is the maximum interior support reaction of one wall.
Equal opposing wall reactions act on the same rod; they are not added to double its tension.
The illustrative body length is the distance between concrete faces normal to the governing wall,
not the fabricated rod length. The extension screen uses gross area only and excludes thread/outside length.

Gross yielding screen: Py = Fy Ag / Omega_y. Effective-net rupture screen: Pu = Fu Ae / Omega_u.
Ae defaults to unknown (0), never to gross area. Assembly allowable working load defaults unknown (0).
The combined numerical capacity is known only when both Ae and SWL are supplied;
min(Py, Pu, SWL) still cannot approve the assembly without hardware/connection checks and evidence.
The listed candidate diameter checks gross yielding only; it is not an approved rod selection.

Material examples SD40 (Fy390, Fu560 MPa) and SR24 (Fy235, Fu385 MPa) come from
Tata Steel Thailand's producer catalog for TIS24-2559 / TIS20-2559, pages3–4:
https://www.tatasteelthailand.com/wp-content/uploads/2020/07/Seismic-Bar-SD40-Super-Ductile1561008786.pdf
These are historical catalog examples, not validation of today's standard or any specific lot/thread product.
CUSTOM allows certified values; the application still has no authoritative material-evidence workflow.

ASD divisor concept: Duncan/Fenves/Iwankiw, AISC Engineering Journal (2006), Table1:
https://ej.aisc.org/index.php/engj/article/download/888/887/887
This conceptual source is not a declaration that an AISC building tension-member method applies
to fabricated or proprietary threaded form ties. Applicable current methods and certified ratings remain required.

## Verification boundaries

Analytical fixtures cover central/asymmetric/two-point beams, support loads, diagram stations,
nominal sections, full load/reaction equilibrium, actual grid remainder, pair sharing, tie force/length,
capacity governors, legacy import, and permanently incomplete construction gates.
React server rendering checks component/report serialization for footing, L and column cases.
This is not mobile/browser interaction or printed-PDF visual acceptance.

Security rules and runtime integrations are unchanged. The cloud still uses browser-local drafts;
Firebase production and live AI are not connected. Paid providers and construction issuance were not invoked.
