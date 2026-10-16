# คำสั่งส่งต่อ Codex — ปิดช่องว่างข้อมูล/การเชื่อมต่อหลัง preview.26

เป้าหมาย: ทำงานต่อใน `F:\Project Code\RC-FormWork-app` จากระบบจริงที่มีอยู่ ไม่สร้างแอปใหม่ ไม่ถือว่าแพ็กเกจนี้เป็นผลอนุมัติออกแบบก่อสร้าง

## ขอบเขตที่ Owner ขอในรอบนี้
เพิ่ม Form Tie machine-readable, ข้อมูลอ้างอิง Ringlock/connection, แบบรับข้อมูลดิน-พื้นอายุน้อย/เกณฑ์การเสียรูป และการรายงาน blocker ที่ระบุสิ่งที่ต้องส่งเพิ่มให้ชัดเจน เพื่อปิดงานซอฟต์แวร์ที่ตรวจได้ โดยไม่ปลดล็อกงานวิศวกรรมจากค่าที่ไม่มีหลักฐาน

ให้เริ่มจาก README.md, docs/ENGINEERING_CLOSURE_MAP.md, baseline/manifest.json และ OWNER_DECISIONS.json ในแพ็กเกจนี้
เลข `closure-v1` เป็นเวอร์ชัน handoff ไม่ใช่เลขรุ่นแอปที่จะบังคับใช้

## 0. ตรวจฐานจริงก่อนแก้ไข
1. ยืนยัน workspace ข้างต้น ตรวจคำสั่งใน AGENTS.md และ docs/WORKFLOW_V07_IMPLEMENTATION.md ที่มีจริง
2. อ่าน artifacts/workflow-v07-preview26-verification.json และ artifacts/workflow-v07-preview26-source-hashes.json หากมี ตรวจ hashes เทียบไฟล์ปัจจุบันก่อนอ้างฐาน preview.26 หากมีงานใหม่/Agent อื่นกำลังแก้/ไฟล์ไม่ตรง ต้องรายงานและไม่เขียนทับ
3. ตรวจ model.ts, contractAudit.ts, frameWorkflow.ts และ tests ที่เกี่ยวข้องตามไฟล์จริง ห้ามสร้างชื่อ import/API จากข้อเสนอในเอกสารนี้โดยเดา
4. Workspace ไม่มี .git ตามรายงาน Owner: ตรวจยืนยัน แต่ไม่ git init/commit/push/reset
5. คง AGENTS.md, tests/source-upload.test.tsx และ Ringlock reference JSON เดิมทุก byte จนมีคำอนุมัติเจาะจงต่างหาก
6. คง revision/stage/load-case lineage, confirmed:false, constructionRelease:NO_GO และ baseline behavior เดิม ไม่เพิ่ม PASS เพื่อปิด issue

## 1. แก้ Form Tie ที่เป็น packaging / migration gap
พบหลักฐานใน archive ว่า v0.6.2 มี JSON อยู่แล้ว แต่ archive v0.7 นำไปเฉพาะคู่มือไทร์ ดู baseline/manifest.json
การพบนี้ยังไม่พิสูจน์สาเหตุของ issue ในแอป ให้ตรวจ path/loader/schema ของแอปก่อน

- ใช้ baseline/formtie_v0.6.2/ เป็นสำเนาต้นฉบับที่ไม่แก้ และ data/form_tie_machine_bridge.json เป็นข้อมูล normalized แบบแยกไฟล์
- ฐาน normalized: 11 references (4 legacy + 7 Okabe), 6 topology templates; numerical draft helper รองรับ segmented B/C/BC/D เท่านั้น ระบบก้านทะลุและ Custom ที่ยังไม่มีโมเดลต้อง BLOCKED_UNSUPPORTED
- เชื่อม source ID / property units / data provenance กับระบบปัจจุบันผ่าน adapter หลังอ่าน type จริง ไม่แทนที่ทุก model
- แยก 13 check slots จากจำนวนอุปกรณ์ใน BOM: THREAD_END และ WALER_LOCAL เป็นการตรวจ ไม่ใช่ชิ้นส่วนที่ต้องนับเพิ่ม
- map BEARING_PLATE_LEFT/RIGHT -> PLATE_LEFT/RIGHT แบบ explicit; รักษาชื่อเดิมใน baseline; ตรวจ duplicate หลัง normalize
- อย่า map field demand_basis='ALLOWABLE' เป็น FACTORED หรือ WORKING ในข้อมูลจริงโดยไม่มีหลักฐาน: การแก้ชื่อเป็น WORKING ในตัวอย่าง synthetic นี้เป็น migration เฉพาะตัวอย่างที่ทราบที่มา
- ค่า Separator-only ใช้ประกอบ INNER_UNIT เท่านั้น ไม่เติมลง Outer/Nut/Cone/Plate/Thread แยกโดยอัตโนมัติ ไม่ตั้ง min engagement จากชื่อเกลียว
- ต้องได้ actual reaction ของ Waler และบริบทเดียวกันก่อนผูกแรงไทร์; p*spacing*spacing เป็น allocation ไม่ใช่ governing reaction ทุกกรณี; ไม่คูณสองเพราะสองหน้า ไม่หารสองเพราะสองก้านภายนอก
- ขาดกำลังใด ให้มี issue ที่ผูก entity/check นั้นและระบุ field ที่ขาด ไม่แสดง UNKNOWN แบบรวมที่แก้ไม่ถูกจุด

## 2. เพิ่ม Ringlock sidecar โดยไม่แก้ JSON เดิม
- เพิ่ม data/ringlock_component_rating_sidecar.json เป็นเอกสารอ้างอิงแยกต่างหากพร้อม source/edition และ source hash
- เป็น 17 component references จาก Doka 11/2020 หน้า31 ไม่ใช่ manufacturer/configuration rating ที่รับรองเครื่องมือของ Owner
- 6 standard spacing rows, 7 brace rows ที่ lift 2000mm เท่านั้น, 4 single-action joint limits
- moment 105 kN.cm -> 1.05 kN.m; แกน joint ต้องตรงรูปต้นทาง อย่าจับจากชื่อ My ใน global model อย่างเดียว
- exact lookup เท่านั้น: ห้าม interpolation/extrapolation, ห้าม copy 60kN/leg ของผลิตภัณฑ์เฟรมอีกระบบ
- หมายเหตุ source ระบุ gammaM1.1/gammaF1.5 แต่ heading กับ note ใช้ถ้อยคำต่างกัน ให้คงข้อความต้นทางและเปิด issue การตีความฐาน; ไม่ปรับกำลังด้วย factor ใหม่เอง
- ยังไม่ทราบ joint stiffness/interaction, head/base rating ตาม extension, actual equipment match และ full configuration scope ให้คง blocker
- ให้เลือกได้สองทางที่ตรวจจริง: (A) configuration rating ที่ตรงองค์ประกอบ/ความสูง/brace/extension/restraints/load patterns พร้อมขอบเขตครบ หรือ (B) verified analysis + manufacturer connection/head/base rules + engineering review
- ความครบของ field string ไม่ใช่ engineer acceptance; ข้อมูล reference ไม่ใช่ project-approved resistance

## 3. ปิดช่องว่าง contract โดยรักษา preview.26 lineage
ตรวจ mapping กับชื่อ field จริงก่อนลงมือ:

JACK_HEAD_BASE:
ผูก actual head/base assembly, bearing entities, contact areas, extension/engagement, directions, ratings และ evidence; geometry/mass reference ไม่ปิด capacity issue

SUPPORT_CONTACT:
รักษา signed action/reaction ที่จุด datum/coordinate frame เดียวกันและ context เดียวกัน ทั้ง force และ moment; แสดง error เมื่อไม่สมดุล ไม่ abs() แรงยกให้เป็นแรงกด; full-contact trial qmin<=0 ต้องเข้าสู่กรณี contact model แยก ไม่ clamp แล้ว PASS
รองรับ soil, elevated slab และ slab-on-ground ตามแบบจำลองจริง ใช้ templates/support_soil.json และ support_slab.json หลัง mapping; ห้ามเอาดินค่าเดียวหรือ fc อายุ28วันมาเติมทุก support

STAGE_RELEASE:
ผูก stage record, accepted evidence, designSnapshotHash, revision, load-case และ active/captured stage แยกกัน เมื่อไม่ตรงต้อง STALE/BLOCKED ไม่ relabel stage เก่าเป็นใหม่เพื่อปิด issue
ค่าอายุคอนกรีต/ผล maturity ที่ไม่มี actual mix calibration และ temperature history ไม่ถือเป็นผลกำลังตรวจแล้ว
ไม่ให้ UI/JSON confirmed:true ทำหน้าที่ trusted approval

## 4. SLS / settlement / punching / rule packs
- เพิ่มแบบรับ input Standard-reference / Custom ที่คงค่าเดิม เหตุผล หลักฐาน และ invalidate ผลเก่าเมื่อเปลี่ยน
- ค่า deflection ratio, absolute limit, tie opening, total/differential settlement และ punching เป็นคนละรายการ; ต้องมีแหล่งและกรณีโหลดที่ถูกต้อง ห้ามตั้ง 5mm/10mm settlement หรือ L/240 ทุกองค์ประกอบ
- Caltrans L/240 ใน data/serviceability_reference_options.json เป็น reference-only ของ falsework beam และ load scenario ที่ระบุ ไม่ใช่มาตรฐานไทย/ไม้อัด/settlement
- punchingAverageStress เป็น average demand เท่านั้น ห้ามใช้เป็น concrete capacity; ต้องมี b0/d ที่ตรวจแล้ว, edges/openings/group loads/moment transfer และ code-specific resistance
- src/closure-core.mjs เป็น pure arithmetic/contract reference ให้ review แล้ว port/adapt ตามโครงสร้างแอป ไม่ใช่ replace engine หรือ general frame solver
- Rule pack ต้องมี ruleId/version, source/edition/clause, units/basis, applicability, independent benchmark, reviewer/evidence, acceptance scope และ hash; tests ผ่าน != engineer-reviewed

## 5. Test blocker ที่ห้ามแก้โดยพลการ
รายงาน Owner กล่าวถึง rejecnืt ใน tests/source-upload.test.tsx:21 (5 failures/8 unhandled) แต่แพ็กเกจนี้ไม่ได้อ่านไฟล์จริง
- อ่าน test/error traces แล้วพิสูจน์สาเหตุก่อน ห้ามสรุป 5 failures ทั้งหมดมาจาก typo โดยไม่ตรวจ
- ขณะ OWNER_DECISIONS.json test_typo_fix.allowed=false ห้ามแก้ไฟล์นี้
- ห้าม skip/exclude test, global alias/shim, test runner transform ให้ผ่าน, ปิด unhandled rejection หรือเปลี่ยน assertion เพื่อหลบ
- หาก Owner อนุมัติเจาะจงภายหลัง ให้แก้เฉพาะ identifier/reference ผิดตาม callback ที่ประกาศจริง เก็บ assertions, รัน focused แล้ว full suite และบันทึกหลักฐานใหม่; ไม่เดาว่าเปลี่ยนคำใดเป็น reject โดยไม่อ่าน code
- ระหว่างยังไม่แก้ Full Suite = RED หรือ KNOWN_BLOCKED_NOT_GREEN ไม่ประกาศ ALL TESTS PASS / SOFTWARE_CLOSED

## 6. ลำดับพัฒนาและตรวจในขอบเขตที่อนุญาต
A. Audit/Mapping + backup hashes (ไม่เขียนทับไฟล์เดิม)
B. Tie data bridge + schema + alias + regression
C. Ringlock reference sidecar + exact-lookup/context restrictions
D. Support/SLS/young-slab input forms + issue ownership + stage lineage
E. Focused regression, typecheck, existing offline builds; ก่อนรันอ่าน scripts ว่าไม่มี side effects/network/deploy ใช้ deps ที่มีอยู่ ไม่ install เพิ่ม ไม่เปิดแอป/live MCP/Firebase
F. Full suite เมื่อ script อยู่ในขอบเขตที่อนุญาต รายงานตามจริง ไม่เปลี่ยนจำนวน failures เป็นผ่านด้วยการไม่รัน
G. สรุป data status / code status / test status / engineering status แยกกัน แล้วหยุดก่อน manual/live/field acceptance

ทุกขั้นห้ามแก้ Firebase/permissions, deploy, commit, app launch หรือ field use
หาก AGENTS.md หรือข้อห้ามจริงขัดกับขั้นใด ให้หยุดเฉพาะขั้นนั้นพร้อมทางเลือก ห้ามข้ามคำสั่ง Owner

## 7. เกณฑ์ส่งกลับเพื่อปิดงานอย่างตรงสถานะ
ต้องมีรายงานไฟล์เปลี่ยนจริง/คำสั่งและผลจริง/ข้อจำกัด/ข้อผิดพลาดคงค้าง/ข้อมูลที่ต้องให้ใครรับรอง
- Form Tie machine data AVAILABLE + schema/import verified ไม่ได้เท่ากับ TIE_ASSEMBLY_CAPACITY_VERIFIED
- Ringlock component reference AVAILABLE ไม่ได้เท่ากับ CONFIGURATION_VERIFIED
- Input UI implemented ไม่ได้เท่ากับ soil/slab basis approved
- Pure helper tests passed ไม่ได้เท่ากับ engineer-reviewed rule pack
- data/schema complete ไม่ได้เท่ากับ full app suite green
- stage/context match ไม่ได้เท่ากับ Engineer acceptance

ส่ง artifacts/closure-pack-integration-report.json (หรือชื่อที่ตรงโครงสร้างจริง) พร้อม hashes และ traceability ของทุก resolved/remaining issue
แจ้ง status แยก: DATA_PACKAGE / APP_INTEGRATION / FULL_SUITE / ENGINEERING_INPUT / CONSTRUCTION_RELEASE
CONSTRUCTION_RELEASE ต้องคง NO_GO จน workflow เชื่อถือได้และหลักฐานจริงครบ ไม่ใช้แพ็กเกจนี้ปลด gate
