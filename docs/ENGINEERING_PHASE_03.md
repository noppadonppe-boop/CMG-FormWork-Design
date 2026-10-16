# v0.3 — rectangular column yoke demand and conditional ring screen

The private Site continues with the same owner-only audience. No Firebase production, paid AI or
construction issue is performed. This phase adds numerical demand checks; it does not establish an
approved corner connection, stable yoke, or safe pouring arrangement.

## Supported scope and default behavior

- Constant-height rectangular COLUMN only. L columns remain unsupported for yoke/corner design.
- DEMAND_ONLY is the default. It collects the maximum-pressure row's side-beam corner reactions;
  it does not silently introduce axial force capacity or a closed-ring structural model.
- PINNED_RING is an explicitly selected first-order equilibrium assumption. Side beams still carry
  transverse point loads and bending; they are not treated as two-force truss members.
- An unrestrained ring of four pin-connected sides has a mechanism. Force equilibrium alone cannot
  prove its in-plane or out-of-plane stability. Restraints, real joints, offsets and second-order behavior
  remain required, with permanent INCOMPLETE construction gates even when all numeric screens pass.

## Calculation contract (N/mm/MPa internally)

Use the v0.2 nominal independent face beams under constant pmax and actual tributary grids.
Each column face has two idealized CORNER supports, with no footing through-ties.
At corner i, previous face ends and current face begins. The normal-load contribution is

    Qi = Rprevious_end nprevious + Rcurrent_start ncurrent

Q is the sum of the pressure contributions before closing equilibrium with axial forces; it is not
an unbalanced external force on the completed ring or an automatically assigned single-bolt force.
For the rectangular pinned-ring assumption with perpendicular unit tangents ti and tj,

    Qi + Ni ti - Nj tj = 0
    Ni = -Qi dot ti
    Nj =  Qi dot tj

Tensile Ni/Nj must agree at both ends of each unloaded axial side. Asymmetric end forces unsupported
by this topology throw rather than being averaged. Each corner's residual Fx/Fy is reported.
The force exerted on the pin by the current member is Rcurrent ncurrent + Ni ti; the previous member
exerts its equal/opposite. Interface forces are shown separately from Q when ring mode is selected.

The governing individual member receives alpha of both pair N and pair M:

    sigmaN = alpha N / A
    sigmaB = alpha M / S
    eta = sigmaN / (Fy/Omega_t) + sigmaB / (Fy/Omega_b)

This is a gross-section elastic yield screen, not a complete design-standard interaction check.
Net rupture, section buckling/torsion, local bearing, bolts, welds and eccentricity remain incomplete.

## Corner working-capacity criteria

Cx/Cy are user-entered hypothetical allowable working capacities of the complete corner assembly,
in the named global axes, using the minimum directional capacity across all four corners as installed.
They default to unknown (0), never to breaking load or steel-bar capacity.
Component demands are |Qx| and |Qy|. Numeric component shortfalls show FAIL even if the combined
interaction rule is unknown. Under this rectangular model these magnitudes match the corresponding
current-member interface force components; their signs/directions are shown separately.

UNKNOWN is the default combined-load rule. Selecting LINEAR explicitly uses

    eta_joint = |Qx|/Cx + |Qy|/Cy

The application's linear envelope is a chosen screening criterion, not verification of the real
product's permitted interaction envelope. A source-reference text field records the user's draft note;
typing a reference never makes it verified, and favorable checks still remain INCOMPLETE.
No bolt diameter, bolt count or plate thickness is inferred from the scalar resultant.

## Independent fixtures

Square1000x1000x1000mm, gamma20kN/m3, vertical span500mm, stud250mm: pmax20kPa,
row load10N/mm, side row force10kN, each side reaction5kN. Corners are
(-5,-5), (5,-5), (5,5), (-5,5)kN; resultant sqrt(50)=7.071067812kN.
Ring axial forces are5kN in every side; gross pair bending moment1,250,000Nmm.

Rectangle2000x1000mm, same height/loads: X corner demand5kN, Y demand10kN,
resultant sqrt(125)=11.180339887kN. Horizontal-side axial forces5kN, vertical-side forces10kN.
For square5kN+5kN demand and Cx=Cy=8kN, separate checks fit but linear interaction is1.25 FAIL.

## Reference and verification limit

Basic frame/free-body interaction methodology (not approval of this formwork system):
Engineering Statics, Section6.6 Frames and Machines:
https://engineeringstatics.org/frames-and-machines.html
The source explains separating multi-force members and showing equal/opposite interaction forces.
The rectangular-yoke equations above are this application's stated first-order inference for its
idealized topology, not a manufacturer's validated yoke design.

Software verification includes65 numerical/schema/static-render checks and TypeScript builds.
Browser/mobile interactions, actual hardware testing and printed-PDF visual QA are not performed.
Project backups now use schema3; v1/v2 migrate with new unknown capacities and reset confirmation.
