# Owner Input Packet — RC-FormWork Workflow v0.7

เอกสารนี้เป็นแบบกรอกข้อมูลสำหรับปิดงาน Production Case และหลักฐานวิศวกรรมของ Workflow v0.7 โดยไม่เติมค่าที่ไม่มีในเอกสารต้นทาง ทุกช่องที่ยังไม่มีหลักฐานต้องคงเป็น `UNKNOWN` และผลระบบต้องคง `DRAFT / INCOMPLETE / NO_GO`.

## 1. Production Case reconciliation

เปิดเมนู **Audit & Settings → Production Case Reconciliation** แล้วนำเข้า/กรอก decision template สำหรับโครงการ `CMG-002` (`0d4fa640-8849-4dd2-aa54-ba0120b6209b`) จาก backup [CMG-002-project-backup.json](<F:/Downloads/CMG-002-project-backup.json>)

| Case | ID | Stored type | Type suggested by name | Owner decision |
|---|---|---|---|---|
| F01 · ฐานราก | `4f9d6cf3-d655-48aa-88e3-15f6d08b730c` | WALL | FOOTING | `UNKNOWN` |
| F03 · ฐานราก | `aa0179a2-323d-4ee0-866c-f91db9eb04c3` | FOOTING | FOOTING | `UNKNOWN` |
| F03 · ฐานราก | `053d505d-b1ce-4dd6-8a82-85db43ac7b3c` | FOOTING | FOOTING | `UNKNOWN` |
| C02 · เสา | `0214e914-c50d-4c3b-945a-4ba7bd85abcf` | WALL | COLUMN | `UNKNOWN` |
| W02 · ผนัง | `96f9ce5c-4920-46ee-88b4-a4d9cb5b346b` | SLAB | WALL | `UNKNOWN` |
| W02 · ผนัง | `54603c4d-d748-478a-819e-e7a81bc28b4c` | SLAB | WALL | `UNKNOWN` |
| B02 · คาน | `7dce3438-9e61-4aee-9d4d-0019c5b9275a` | SLAB | BEAM | `UNKNOWN` |
| S02 · พื้น | `a65f58ef-800e-489e-8370-6c393eeceb38` | FOOTING | SLAB | `UNKNOWN` |
| B02 · คาน | `e66c5d19-2068-49ba-9bc8-6c24e4228bfc` | BEAM | BEAM | `UNKNOWN` |

Allowed decisions are enforced by the app. The exported template must retain `applyToProduction=false`. Before any reviewed write, create a new backup, record the approving person/time/reason, and re-run:

```text
npm run audit:reconciliation -- --ready
```

## 2. Product and material evidence

The app can import the public capture (15 rows) and Closure Pack capture (11 Form Tie rows + 17 Ringlock rows) as DRAFT properties. These are reference rows only; they do not populate Registry limits or project capacities.

For each item actually used on the project, complete all fields below in **คลังวัสดุ/วิธีคำนวณ**:

- manufacturer, system generation, product code, model and batch/lot;
- exact source document, edition/revision, page/table or certificate number;
- project-stock identity check and installation configuration;
- allowable/design basis, action basis, scope and serviceability limits;
- reviewer identity, review date and review note.

Required assemblies remain separate records: complete Form Tie (Inner/Outer/End connection/Nut/Plate), Ringlock standard/ledger/brace/node, U-head, Jack Base, shoring tower, anchors, braces and bearing/support plates.

## 3. Design Basis

ใน Workflow v0.7 ของ Workspace มีส่วน **ข้อมูลวิศวกรรมโครงการ · กรอกและแก้ไขได้** ที่ขั้น **ตรวจ · รายงาน** สำหรับแบบ Ringlock, ดิน/ฐานราก/แผ่นรอง, พื้นรองรับ, Serviceability และ Stage กรอกแล้วบันทึกร่วมกับ Draft ของ Case ได้ หรือส่งออก/นำเข้า JSON เพื่อกรอกต่อภายนอกได้ รายงาน Snapshot จะแนบค่าที่บันทึกไว้และแสดง Revision ที่ผูกอยู่ หาก Design Revision เปลี่ยน แบบฟอร์มเดิมจะแสดง Revision เก่าและให้ผู้ใช้สั่งผูกใหม่ การกรอกฟอร์มนี้ยังไม่ส่งค่ากำลังเข้า Solver และไม่แทนการกรอก/ตรวจโมเดลทางถ่ายแรงจริง

Fill one reviewed Design Basis reference per Design Case:

| Field | Value |
|---|---|
| Design Basis document/revision | `UNKNOWN` |
| Design code and national annex | `UNKNOWN` |
| Concrete unit weight | `UNKNOWN` |
| Concrete temperature / slump / pour rate / vibration | `UNKNOWN` or not applicable with evidence |
| Additional Dead Load | `UNKNOWN` |
| Construction Live Load | `UNKNOWN` |
| Load combinations and action basis | `UNKNOWN` |
| Soil/foundation bearing basis | `UNKNOWN` |
| Young-slab support/bearing basis | `UNKNOWN` |
| Settlement, uplift and lateral restraint limits | `UNKNOWN` |
| Engineer reviewer and approval scope | `UNKNOWN` |

## 4. Engineering closure checks

The following must have project-specific evidence before a construction release can be considered:

- load path from plywood → stud/joist → paired waler/bearer → tie or U-head → Ringlock → Jack Base → support;
- face pairing, corner/end transfer, tie spacing and complete assembly force path;
- member bending, shear, bearing, deflection and buckling at actual length and restraint;
- connection stiffness, slip, thread engagement, plate/nut bearing, anchor shear/uplift and global stability;
- staged pour, multi-level shoring and support feedback where applicable;
- drawing, calculation, Review and issue record using the same Design Revision and snapshot hash.

## 5. Release boundary

No Owner input packet entry changes a result to `PASS` by itself. The application must keep favorable numerical screens as `SCREENED`/`INCOMPLETE`, keep `confirmed=false` until the authored model is reviewed, and keep `constructionRelease=NO_GO` until the engineer-approved evidence set exists.
