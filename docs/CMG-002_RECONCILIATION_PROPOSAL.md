# CMG-002 Design Case reconciliation proposal

แหล่งข้อมูล: [CMG-002-project-backup.json](<F:/Downloads/CMG-002-project-backup.json>) ซึ่ง export จาก Production เมื่อ 2026-10-18 เวลา 21:06 น. เอกสารนี้เป็นข้อเสนอสำหรับ Owner เท่านั้น ไม่ได้เขียนกลับ Firebase และไม่แทนการยืนยันจากวิศวกรโครงการ

| Case | ID | ประเภทที่เก็บ | ประเภทที่ชื่อบ่งชี้ | ปัญหา | Owner ตัดสินใจ |
|---|---|---|---|---|---|
| F01 · ฐานราก | `4f9d6cf3-d655-48aa-88e3-15f6d08b730c` | WALL | FOOTING | ชนิดไม่ตรง; มีร่าง v0.7 | ☐ ใช้ FOOTING  ☐ ใช้ WALL  ☐ แยกเป็น Case ใหม่ |
| F03 · ฐานราก | `aa0179a2-323d-4ee0-866c-f91db9eb04c3` | FOOTING | FOOTING | ชื่อซ้ำ | ☐ เก็บรายการนี้  ☐ เปลี่ยนชื่อ  ☐ รวมหลังตรวจเอกสาร |
| F03 · ฐานราก | `053d505d-b1ce-4dd6-8a82-85db43ac7b3c` | FOOTING | FOOTING | ชื่อซ้ำ | ☐ เก็บรายการนี้  ☐ เปลี่ยนชื่อ  ☐ รวมหลังตรวจเอกสาร |
| C02 · เสา | `0214e914-c50d-4c3b-945a-4ba7bd85abcf` | WALL | COLUMN | ชนิดไม่ตรง | ☐ ใช้ COLUMN  ☐ ใช้ WALL  ☐ แยกเป็น Case ใหม่ |
| W02 · ผนัง | `96f9ce5c-4920-46ee-88b4-a4d9cb5b346b` | SLAB | WALL | ชื่อซ้ำและชนิดไม่ตรง | ☐ ใช้ WALL  ☐ ใช้ SLAB  ☐ แยกเป็น Case ใหม่ |
| W02 · ผนัง | `54603c4d-d748-478a-819e-e7a81bc28b4c` | SLAB | WALL | ชื่อซ้ำและชนิดไม่ตรง | ☐ ใช้ WALL  ☐ ใช้ SLAB  ☐ แยกเป็น Case ใหม่ |
| B02 · คาน | `7dce3438-9e61-4aee-9d4d-0019c5b9275a` | SLAB | BEAM | ชื่อซ้ำและชนิดไม่ตรง | ☐ ใช้ BEAM  ☐ ใช้ SLAB  ☐ แยกเป็น Case ใหม่ |
| S02 · พื้น | `a65f58ef-800e-489e-8370-6c393eeceb38` | FOOTING | SLAB | ชนิดไม่ตรง | ☐ ใช้ SLAB  ☐ ใช้ FOOTING  ☐ แยกเป็น Case ใหม่ |
| B02 · คาน | `e66c5d19-2068-49ba-9bc8-6c24e4228bfc` | BEAM | BEAM | ชื่อซ้ำ; ยังไม่มีข้อมูล Beam ที่บันทึกใน backup | ☐ เก็บรายการนี้  ☐ เปลี่ยนชื่อ  ☐ รวมหลังตรวจเอกสาร |

กติกาการดำเนินการหลัง Owner ลงความเห็น:

1. เก็บ backup เดิมแบบ read-only และสร้าง backup ใหม่ก่อนทุกการเขียนกลับ
2. แก้ประเภทที่ผู้ใช้ยืนยันก่อน แล้วตรวจว่า `workflowV07.model.elementType` ตรงกับ `workflowElementType`
3. ห้ามลบร่างหรือ Review ที่ชนกันจนกว่าจะบันทึกเหตุผลและผู้อนุมัติ
4. เติม Beam/Slab/Wall input จากแบบจริง ไม่ใช้ค่าที่สร้างจาก prefix เป็นค่าคำนวณ
5. เปิด Review ใหม่เมื่อ Design Revision หรือ source hash เปลี่ยน

ผลจาก `npm run audit:backup -- F:/Downloads/CMG-002-project-backup.json` ถูกตั้งเป็น `safeToAutoApply: false` โดยเจตนา

Owner สามารถกรอกคำตัดสินใน [CMG-002_RECONCILIATION_DECISION_TEMPLATE.json](./CMG-002_RECONCILIATION_DECISION_TEMPLATE.json) ได้ โดยยังไม่เขียนกลับ Production จนกว่าจะระบุผู้อนุมัติ เหตุผล และ backup ก่อนเขียนครบ

ตรวจรูปแบบได้ด้วย `npm run audit:reconciliation`; โหมด `npm run audit:reconciliation -- --ready` จะล้มเหลวโดยเจตนาจนกว่าจะกรอกคำตัดสินและผู้อนุมัติครบ
