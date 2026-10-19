# RC-FormWork mock-up project

Import `RC-FormWork-Mockup-Project-v0.7.json` from the app's **นำเข้าโครงการ** control.
The import creates a new project and assigns new project and case IDs.

`Project-Example-v0.7.json` is the complete walkthrough named **Project Example**. It contains
the same ten cases with every legacy, beam, slab and wall field populated, catalogue section IDs,
and reference notes for ACI PRC-347, APA V345, PAP-TIS107, the Design Form Work timber table,
the Ringlock research file, and the Closure Pack Form Tie bridge. The app also creates this project
from **สร้าง Project Example** without importing a file.

Both files contain ten editable demo cases: two each for footing, column, wall, beam and slab.
The older `RC-FormWork-Mockup-Project-v0.7.json` leaves unknown capacities at zero.
The complete `Project-Example-v0.7.json` supplies populated layouts and **EX-DB-01 (MOCK)**
teaching values for capacities and supporting ground, with their origin explicitly identified.
These synthetic inputs do not constitute manufacturer certificates or actual site evidence;
all cases remain unconfirmed and NO_GO.

## Installation drawing book

Open **Project Example → แปลนและรูปตัด**. Each case has an A3 cover/index, installation plan,
A–A/B–B sections, assembly details, material/reference schedule, face elevations, and complete
position/tie schedules where applicable. The default ten examples produce **84 sheets**.
**รวมแบบทั้ง 10 ตัวอย่าง** combines the cases. Use the A3 print button to save PDF or
**ดาวน์โหลดชุดแบบ HTML (A3)** for a standalone printable file.

Save edits in the input form before reopening the drawings. Every sheet carries the saved
Design Revision, input SHA-256 and verified snapshot SHA-256. Waler heights are local to the
side face base and are converted to global Z in sections/elevations. Layout lines and dimensions
come from the model; unspecified fabrication joints, ledger/bracing, bolts and welds are not inferred.
NTS details identify schematic components, not fabrication dimensions. Check/approval names are
mock placeholders, not signatures or construction authorization.

Reproduce the example file with `node scripts/generate-project-example.mjs` and the complete
HTML drawing book plus raster QA images with `node scripts/render-project-example-drawings.mjs`.
The latter also accepts a local app project backup path as its first argument. Outputs are in
`artifacts/project-example-drawings/`. Geometry edited in an existing live example is preserved,
so that project's sheet count can differ from the default dataset.
