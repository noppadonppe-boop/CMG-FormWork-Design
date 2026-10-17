# แผนงานสู่วัตถุประสงค์ทั้งหมด (ร่างเพื่อขออนุมัติ)

อ้างอิง `docs/OBJECTIVES.md` (ระบบแบบหล่อ 5 แบบ) และกฎการทำงานของ Master Prompt 1.1
สถานะตั้งต้น: engine `0.7.0-preview.32`, 784 tests, deploy แล้วบน rc-formwork.web.app

หลักการของแผน
- ทำทีละชั้นให้ "ใช้ได้จริง" ก่อนขยายวิศวกรรม: บันทึกข้อมูล → ข้อมูลตั้งต้น → กระบวนการตรวจ → ประสบการณ์ใช้งาน → ช่องว่างวิศวกรรม → หลักฐานการทดสอบ
- ทุก Phase มีเกณฑ์รับงานที่ตรวจได้ด้วยคำสั่ง/เทสต์ และไม่มี Phase ใดเปลี่ยน INCOMPLETE เป็น PASS ด้วยการลบการตรวจ
- งานที่ต้องการข้อมูลจากวิศวกร CMG (กำลังวัสดุ ผลิตภัณฑ์ วิธี) ระบุไว้ชัดว่า "Owner input" ระบบจะไม่ใส่ค่าเอง
- ไม่ระบุระยะเวลาเป็นวัน ระบุลำดับและเกณฑ์จบแทน

---

## Phase A — ความถูกต้องของข้อมูลผู้ใช้ (ทำก่อนทุกอย่าง เพราะเปิด production แล้ว)

สถานะ: A1, A2 ทำแล้วในโค้ด (`src/domain/workflowV07/storage.ts`, subcollection `projects/{id}/workflow/{caseId}`,
rules + functions deleteProject, ตัวบ่งชี้บันทึก/revision/stale ใน panel); A3 Owner เลือกไม่ขึ้น banner
ยังต้อง deploy rules + functions + hosting ก่อนที่ production จะบันทึกร่างได้

A1. บันทึก Workflow v0.7 ต่อ Design Case
- เพิ่ม `case.workflowV07` = {model (authored inputs เท่านั้น), engineVersion, revisionId, updatedAt}
- บันทึกผ่าน `saveProject` เดิม (Firestore) และ localStorage ในโหมดออฟไลน์; autosave เหมือน case อื่น
- โหลดกลับ: ถ้า engineVersion ต่างจากปัจจุบัน → ผลทั้งหมด stale ต้องกดคำนวณใหม่ (กลไก `stampXxxLayout` มีอยู่แล้ว)
- เอกสาร freeze (documentView) เก็บ hash ของ model และ engineVersion
- เกณฑ์จบ: กรอก layout → รีเฟรช → ค่าเดิมกลับมา; เปลี่ยน engine → เห็น stale; เทสต์ round-trip และ Firestore rules ไม่ปฏิเสธขนาดเอกสาร (ตรวจ 1 MB limit; ถ้าเกินให้แยก subcollection ต่อ layout)

A2. ตัวบ่งชี้สถานะบันทึก
- แสดง "บันทึกแล้ว / กำลังบันทึก / บันทึกไม่สำเร็จ" และ revision ปัจจุบันในหัวหน้า v0.7
- Conflict: ถ้า revision ใน Firestore ใหม่กว่าในเครื่อง ให้แจ้งและไม่เขียนทับเงียบๆ

A3. ลดความเสี่ยงบน production ระหว่างทำ A1
- banner ว่า v0.7 ยังไม่บันทึก (ถอดเมื่อ A1 เสร็จ)

---

## Phase B — ข้อมูลตั้งต้นที่รีวิวแล้ว (ให้ถึง SCREENED ได้จริง)

สถานะ: B1 และโครง B2 ทำแล้ว (`src/domain/workflowV07/registry.ts`, เมนู "คลังวัสดุ/วิธีคำนวณ", Firestore `root/registry`
พร้อม rules, ตัวเลือก "เติมจากคลัง" ในช่องหลักฐานคร่าว/คานรัด/คานรับ/ตรวจเฉพาะที่) ผู้ตรวจที่ Owner กำหนด: Noppadon P · Engineer
รายการเริ่มต้นเป็น DRAFT จากแหล่งเผยแพร่ (APA V345, ค้ำยัน 34 มม. UNKNOWN) ยังไม่มีขีดจำกัด
ค้างจาก Owner: ข้อมูลผลิตภัณฑ์จริงพร้อมเอกสาร เพื่อกรอกขีดจำกัดและกดรีวิว; B3 (legacy ฐานราก/เสา อ่าน catalog เดียวกัน) ยังไม่ทำ

B1. Registry ของวิธีคำนวณและเกณฑ์ (criteria/method registry)
- ตาราง method: id, ชื่อ, แหล่งอ้างอิง, revision, ขอบเขตใช้ (ช่วง, วัสดุ, ฐานแรง ALLOWABLE/DESIGN/SLS), สถานะ (DRAFT/REVIEWED/RETIRED), ผู้รีวิว, วันที่
- ใช้ร่วมกับ evidence schema ที่มีอยู่ (`beam-member-evidence-1`, `side-local-evidence-1`, resistance evidence, SLS evidence)

B2. Catalog ผลิตภัณฑ์/วัสดุพร้อมหลักฐาน
- ไม้อัด (เกรด, ความหนา, ค่าออกแบบต่อแถบ 1 m ต่อทิศเสี้ยน), RHS/SHS/C (ต่อยอด section stock เดิม + limit ที่รีวิวแล้ว), ไทร์ (dossier ที่มีอยู่), อุปกรณ์มุม (k, limit), Shoring (Ringlock รายการที่มี + U-head/base/brace), ค้ำยัน 34 มม. (ชนิด ความหนา ความยาว จุดยึด)
- แต่ละรายการมี sourceRef, sourceRevision, reviewRef, status; เลือกแล้วระบบเติม evidence ให้อัตโนมัติ แต่ผลยังเป็น SCREENED ไม่ใช่ PASS
- **Owner input**: วิศวกร CMG กรอกและรีวิวชุดแรก ระบบไม่สร้างค่าเอง; รายการที่ยังไม่รีวิวเลือกได้แต่ผลเป็น INCOMPLETE

B3. ผูก catalog กับ 5 ระบบ
- ฐานราก/เสา (legacy) อ่าน limit จาก catalog เดียวกัน เพื่อให้ผลสองรุ่นสอดคล้อง
- เปลี่ยน catalog revision → snapshot เก่าคงเดิม ร่างปัจจุบัน stale (เทสต์ตามข้อ 15 ของ Master Prompt)

เกณฑ์จบ B: Mock-up project ทั้ง 10 case ถึง SCREENED ได้เมื่อเลือกรายการที่รีวิวแล้ว และกลับเป็น INCOMPLETE เมื่อเลือกรายการ DRAFT

---

## Phase C — กระบวนการตรวจ/อนุมัติ/ออกแบบ และ audit

สถานะ: C1–C3 ทำแล้ว (`src/domain/workflowV07/review.ts`, Firestore `projects/{id}/review/{caseId}` พร้อม rules บังคับบทบาท/
ความเป็นอิสระของผู้ตรวจ/hash ผูกรอบ, ReviewPanel ในหน้า v0.7, เมนู Review & Issue, rules tests 83 รายการ)
บทบาทตาม default: Engineer ส่งตรวจ · Admin/MasterAdmin ตรวจและอนุมัติภายใน · MasterAdmin ออกเอกสารภายใน · ผู้ตรวจ/อนุมัติต้องไม่ใช่ผู้ส่ง
ยังไม่มี: การบังคับใน Cloud Functions (ปัจจุบันบังคับใน Rules), รายงาน/แบบ A3 แสดงสถานะและ hash ของ review (ไปทำใน G)

C1. สถานะเอกสารต่อ case: DRAFT → SUBMITTED → REVIEWED → APPROVED_FOR_INTERNAL_REVIEW → ISSUED (ยังไม่มี "FOR CONSTRUCTION" จนกว่า Owner กำหนดเกณฑ์)
- เปลี่ยนสถานะได้เฉพาะ role ที่กำหนด บังคับทั้งใน Functions และ Rules; Viewer/Engineer อนุมัติไม่ได้
- ISSUED ล็อก snapshot (hash) และบันทึก audit event ทุกการเปลี่ยน
- การแก้ไข input หลัง ISSUED สร้าง revision ใหม่ ไม่แก้ของเดิม

C2. หน้าจอ Review & Issue และ Audit
- รายการเอกสารรอตรวจ, blockers ที่ยังเหลือ (outstanding-information register), ประวัติการเปลี่ยนสถานะ
- รายงาน/แบบ A3 แสดงสถานะและ hash เดียวกับ snapshot

C3. เทสต์: rules + functions (emulator) สำหรับทุก transition, ผู้ใช้ข้ามโครงการ, viewer approve ไม่ได้, snapshot เดิมไม่เปลี่ยนเมื่อแก้ input

---

## Phase D — ประสบการณ์ใช้งานตามเส้นทางแรงของแต่ละระบบ

สถานะ: D1 wizard ตามเส้นทางแรง (ขั้นซ่อนแต่ไม่ unmount เพื่อรักษาสถานะ editor), D3 ทะเบียนข้อมูลที่ยังขาดต่อขั้นและรวม
(`src/domain/workflowV07/register.ts`), D4 แยก chunk (firebase/react/icons/reference-data; main 1.76 MB → 0.95 MB) ทำแล้ว
ยังไม่ทำ: D2 เมนูชุดเต็มตามข้อกำหนด (มีเพิ่มเฉพาะ Library และ Review & Issue) และ wizard ยังเป็นการจัดกลุ่ม editor เดิม ไม่ได้ออกแบบฟอร์มใหม่

D1. Wizard ต่อระบบ (แทน panel เดียว)
- ฐานราก: รูปทรง/ความดัน → ไม้อัด → คร่าว → คานรัด → ไทร์/แผ่นรอง → มุม → รายงาน
- เสา: รูปทรง/ความดัน → ไม้อัด → คร่าว → yoke → อุปกรณ์มุม → ค้ำยัน/เสถียรภาพ → รายงาน
- คาน: แบบข้าง (เหมือนผนัง) + ท้องคาน (ไม้อัด → joist → bearer → Shoring) → รวมแรงลง Shoring → รายงาน
- พื้น: ไม้อัด → joist → bearer → Shoring/เฟรม → แรงด้านข้าง/เสถียรภาพ → รายงาน
- ผนัง: ความดันสองผิว → ไม้อัด → คร่าว → คานรัด → ไทร์/เฟรม/มุม (coupled) → ค้ำยัน → รายงาน
- ทุกขั้นแสดงสามอย่างแยกกัน: ค่าที่กรอก / ผลคำนวณ / ข้อมูลที่ยังขาด

D2. เมนูตามข้อกำหนด: Dashboard, Projects, Upload & AI, Geometry, Preliminary Layout, Criteria, Library, Footing, Column, Beam, Slab, Wall, Connections & Bracing, Drawings & Quantities, Reports, Review & Issue, Audit & Settings (เมนูที่ยังไม่พร้อมต้องบอกว่าขาดอะไร ไม่ว่าง)

D3. Outstanding-information register รวมต่อ case (blockers ทุกระบบในรายการเดียว จัดกลุ่มตามองค์ประกอบ)

D4. ประสิทธิภาพ: แยก chunk, คำนวณ v0.7 นอก render path เมื่อจำเป็น (เป้าหมาย main chunk < 500 kB)

---

## Phase E — ช่องว่างวิศวกรรมที่เหลือ (ต่อระบบ)

สถานะ E1 (บางส่วน): ค้ำยันรับแรงดึงเท่านั้นแบบ active set ต่อกรณี, ledger จุดยึดปลายค้ำยัน (ดึง/อัดต่อปลาย) และ anchor ฐาน
(ดึงขึ้น/แรงนอนรวมจาก reaction) เทียบหลักฐานผู้ตรวจ (`src/domain/workflowV07/braceConnections.ts`) พร้อม editor/ผล และ benchmark
portal X-brace; แรงด้านข้างเข้าทาง frame-node actions และ second-order มีอยู่แล้ว
ยังไม่ทำ: ไม้อัด→คร่าวเข้ากันได้, ledger แผ่นรอง/นัต/เกลียว/bolt/weld/splice, re-solve contact loss, และข้อมูลค้ำยัน 34 มม. จาก Owner

E1. ร่วมทุกระบบ
- ค้ำยัน/Shoring: องค์ประกอบ truss/brace ในเฟรม 3D ที่มีอยู่, จุดยึดจริง, แรงด้านข้าง (ลม/ความเอียง/แรงเท) เป็น frame-node actions, second-order (มีแล้ว), anchor/ฐานรองรับเป็น evidence gate
- ไม้อัด → คร่าว ให้เข้ากันได้ (ขณะนี้รองรับแข็งทางเดียว) ตามแนวที่ทำกับคร่าว → คานรัดแล้ว
- จุดต่อ: แผ่นรอง/นัต/เกลียว/bolt/weld/splice เป็น local check ledger แบบเดียวกับ side local checks
- Stud/waler contact loss: re-solve แบบ active set แทนการรายงานอย่างเดียว

E2. ฐานราก: มุมและไทร์เส้นทางจริงสำหรับตัว L (เส้นทางที่ออก-เข้าพื้นที่ต้องปฏิเสธ), หลายเหลี่ยม orthogonal อื่น
E3. เสา: เสถียรภาพเต็มความสูง 1×1×8 ม. ด้วยเฟรม 3D + brace จริง, แบบจำลองอุปกรณ์มุมเป็น generic spring (มีแล้วใน v0.7) นำมาใช้กับเสา
E4. คาน: รวมแรงแบบข้างและท้องคานลง Shoring เดียวกันใน case เดียว (ปัจจุบันเฟรมรับได้แล้วแต่ยังแยกกรอก)
E5. พื้น: แรงด้านข้างมาตรฐานเป็น "ตัวเลือกจาก registry ที่รีวิวแล้ว" ไม่ใช่ค่าอัตโนมัติ, การเทเป็นขั้น (stage study มีแล้ว)
E6. ผนัง: ผิวเดี่ยว (ติดดิน) ด้วยค้ำยัน/เฟรม, ความสูงเททีละขั้นต่อผิว

เกณฑ์จบ E: แต่ละรายการมี benchmark อิสระ (สูตรปิดหรือสมดุล) และ blockers ที่หายไปต้องถูกแทนด้วยการตรวจจริง ไม่ใช่ลบ

---

## Phase F — AI อ่านแบบและเสนอการจัดวาง (ยืนยันกับ provider จริง)

F1. ทดสอบกับ provider จริงผ่าน Functions (emulator + secret ของ Owner), บันทึกผลเป็น fixtures
F2. เทสต์ตามข้อ 15A: prompt-injection ไม่เรียก tool/ไม่เขียน PASS, schema reject, มิติที่ขาดเป็น null, หน่วยสับสนถูกปฏิเสธ, consent/retention
F3. ขยาย extraction ให้คาน/พื้น/ผนัง (ความยาว ความหนา ความสูงเท) และ preliminary layout สำหรับ 5 ระบบ (deterministic + คำอธิบายจาก AI เท่านั้น)

---

## Phase G — รายงาน แบบ และหลักฐานการทดสอบ

G1. Report worker: PDF จริงฝังฟอนต์ไทย ค้นหาข้อความได้ เลขหน้า สูตร/ตาราง/รูปไม่ถูกตัด; เนื้อหาเดียวกับ snapshot (hash แสดงบนทุกหน้า)
G2. แบบ A3 สำหรับคาน พื้น ผนัง (ต่อยอด `formworkLayout` ที่ element-agnostic แล้ว) และ visual QA ด้วย rasterize ตาม AGENTS.md
G3. E2E (Playwright): สร้าง 2 โครงการ → case ทั้ง 5 ระบบ → criteria → check → save/reload → รายงาน → review gate; รันบน emulator
G4. ปรับ `CAPABILITIES.md`, `VALIDATION.md` ให้ตรงปัจจุบัน และสร้าง Owner manual acceptance checklist สำหรับ 5 ระบบ
G5. Demonstration package: Mock-up project ทั้ง 10 case ออกรายงานร่าง + แบบ A3 แสดง INCOMPLETE ที่ยังเหลืออย่างชัดเจน

---

## สิ่งที่ต้องการจาก Owner ระหว่างทาง

| เมื่อถึง | ต้องการ |
|---|---|
| B2 | ข้อมูลผลิตภัณฑ์/วัสดุจริงพร้อมเอกสารอ้างอิง และผู้รีวิว (ชื่อ/ตำแหน่ง) |
| C1 | นิยาม role ที่อนุมัติได้ และเกณฑ์ที่ยอมให้ขึ้นสถานะ ISSUED |
| E1 | สเปกค้ำยัน 34 มม. (ชนิด ความหนา ความยาว จุดยึด) และวิธี anchor ที่ยอมรับ |
| F1 | provider/secret สำหรับทดสอบ AI จริง และตัวอย่างแบบจริงที่อนุญาตให้ใช้ |
| G5 | ตัดสินใจว่าจะใช้ Mock-up หรือโครงการจริงเป็น demonstration package |

## การ deploy ระหว่างแผน
- ทุก Phase จบด้วย `npm test`, `typecheck`, `build`, `mcp:build` และ commit/push เมื่อ Owner สั่ง
- deploy production เฉพาะเมื่อ Owner สั่งเป็นครั้งๆ; ก่อน Phase A เสร็จควรขึ้น banner ว่า v0.7 ไม่บันทึก

## ลำดับที่เสนอ
A → B → C → D → E → F → G โดย D4 และ G4 ทำแทรกได้ทุกช่วง; E ขนานกับ D ได้บางส่วน
ถ้าต้องการเห็นผลเร็วที่สุดบน production: A1+A3 ก่อน แล้ว B2 เฉพาะไม้อัด/RHS/ไทร์ ที่ CMG ใช้ประจำ
