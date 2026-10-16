# Capability matrix — v0.3

| Capability | State | Limits |
|---|---|---|
| Project/case management | Implemented | Local browser drafts; owner Firebase adapter |
| Rectangle/L geometry | Implemented + analytical fixtures | Constant-height extrusion |
| PDF page render/text/image upload | Implemented | Browser QA not performed |
| Live AI extraction adapter | Implemented, NOT live-tested | Server config required; selected PNG/JPEG page |
| Human geometry confirmation | Implemented UI | Full immutable dimension-evidence revision workflow pending |
| Layout proposals | Implemented deterministic | DEMO_ONLY; no AI size selection |
| Hydrostatic pressure and face forces | Mathematical validation | Top-pour static baseline only |
| Plywood/RHS/simple beam | SCREENING_ONLY | Homogeneous nominal properties; no component approval |
| Waler pair RHS/unlipped C | Implemented + analytical fixtures / SCREENING_ONLY | Independent pinned bays; selectable 50–100% member share; no buckling, connection or continuous-beam validation |
| Stud-point loads and waler support reactions | Implemented + equilibrium fixtures | Actual equal grids; end supports are unverified CORNER supports, not through-ties |
| Rectangle footing tie demand/body/net/assembly screen | Implemented / SCREENING_ONLY | One-wall waler reaction; Ae/SWL unknown by default; thread stripping and hardware method not validated |
| Continuous waler and fabricated assemblies | INCOMPLETE | Do not substitute pinned bays for a physically continuous beam |
| Rectangular column normal corner demands | Implemented + independent fixtures / SCREENING_ONLY | Vector X/Y/resultant at each corner; one maximum-pressure row; no auto bolt or hardware design |
| Column conditional pinned-ring axial/bending | Implemented + equilibrium fixtures / SCREENING_ONLY | Explicit model choice; rejects inconsistent end axial forces; four-pin mechanism/stability remains unverified |
| Corner X/Y capacities and interaction | Implemented as user criteria | Unknown by default; typed source/linear envelope are unverified; no construction approval |
| Column physical corner system and stability | INCOMPLETE | Full joints, offsets, restraints and equipment validation required |
| Braces/anchors/foundation/global stability | INCOMPLETE | 34mm description unresolved |
| Server recomputation/snapshots | Implemented backend | Functions integration tests pending |
| Firebase Security Rules | Implemented | See VALIDATION.md for execution status |
| Team/project-scoped access control | Implemented | Assign/ถอด Assign พร้อมสิทธิ์ดู/แก้ไข/จัดการรายโครงการ; MasterAdmin เห็นทั้งหมดและลบโครงการได้; review/issue workflow ยังไม่ครบ |
| HTML report/print PDF | Implemented + React SSR smoke checks | Formulas, reactions, M/V/deflection graphics and assembly diagrams; browser pagination/fonts/visual QA pending |
| Legacy draft/backup migration | Implemented + fixtures | Adds conservative parameters; restores need for geometry confirmation |
| Fabrication/installation release | BLOCKED | Required methods/evidence/review missing |

No professional engineering approval is implied by this software package.
