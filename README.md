# CMG Formwork Design — v0.3

Workflow v0.7 local development preview is available behind an off-by-default feature flag.
It includes topology/load-path primitives, reference adapters and frozen draft documents; the legacy
v0.3 calculation API is preserved. It cannot enable against Firebase production and does not add
verified Ringlock/tie capacities. See [implementation scope and remaining gates](docs/WORKFLOW_V07_IMPLEMENTATION.md).

แอปตั้งต้น Vite + React + TypeScript พร้อม Firebase backend สำหรับพัฒนาต่อจาก Master Prompt 1.1

**สถานะ: Preliminary engineering workspace / ยังไม่พร้อมออกแบบก่อสร้างจริง**

## ฟังก์ชันที่มีแล้ว

- หลายโครงการและหลายรายการฐานราก/เสา พร้อมร่างในเบราว์เซอร์
- รูปสี่เหลี่ยมและรูปตัว L พร้อมตรวจมิติและแสดงพิกัด
- รับ PDF / PNG / JPEG เลือกหน้า PDF และอ่านข้อความ/แสดงภาพจริงด้วย PDF.js
- ยืนยันมิติโดยผู้ใช้ก่อนเลือกข้อเสนอ
- ข้อเสนอจัดวางแบบ deterministic สำหรับเปรียบเทียบ พร้อมแก้ขนาดและระยะ
- คำนวณพื้นที่ ปริมาตร พื้นที่แบบ แรงดัน Hydrostatic และแรงตามด้าน
- คัดกรองไม้อัด/คร่าว RHS/คานคู่ RHS หรือ C ไม่มีปีกริม: ดัด เฉือนเฉลี่ย การโก่ง และแรงรองรับจากแรงจุดคร่าว
- Tie ฐานรากสี่เหลี่ยม: แรงจากคานคู่ ตรวจตัวเหล็ก/พื้นที่สุทธิ/Ae และ SWL ชุดครบ พร้อมขนาดตัวอย่างเฉพาะ body yield
- กำหนดสัดส่วนแรงคานคู่ เกรดตัวอย่าง SD40/SR24 หรือ CUSTOM; Ae/SWL ไม่ทราบยังเป็น INCOMPLETE
- กราฟ M/V/การโก่ง ตารางแรงมุม/Tie และหน้าตัดองค์ประกอบ ชื่อ English (Chinese)
- ชุดรัดเสาสี่เหลี่ยม: แรงมุม X/Y และแรงลัพธ์; สมมติวงปิด Pin เพื่อคัดกรองแรงดึงร่วมดัดเมื่อเลือกโมเดล
- กำหนดพิกัด Cx/Cy และเกณฑ์ Interaction จุดต่อ พร้อมข้อความอ้างอิงร่าง; ตัวเลขไม่อนุมัติจุดต่อหรือเสถียรภาพ
- รูปแปลนและรูปด้านร่าง ใช้รูปร่างเดียวกับข้อมูลคำนวณ
- รายงาน HTML พร้อมสูตร การแทนค่า และพิมพ์บันทึก PDF ผ่านเบราว์เซอร์
- Firebase Authentication แบบ Email/Password และ Google Popup พร้อม persistent session, AuthContext loading guard, Firestore UserProfile/Role/Project access และ audit events
- การลบไฟล์โครงการทำตรงผ่าน Firebase Client SDK ทั้ง Storage และ Firestore โดย Rules อนุญาตเฉพาะบัญชี approved ที่มีสิทธิ์แก้ไข/จัดการโครงการหรือผู้ดูแลระบบ
- AI extraction adapter ฝั่ง server สำหรับภาพ PNG/JPEG พร้อม JSON schema เมื่อมี provider configuration; ไม่ทดสอบ live API

## สิ่งที่ยังไม่ครบ

- Live AI ยังไม่เชื่อม provider และยังไม่ทดสอบผลอ่านมิติจากแบบจริง
- AI เสนอขนาดอุปกรณ์ยังไม่สร้าง; ข้อเสนอปัจจุบันเป็นระบบ deterministic และมีป้ายบอกชัด
- ยังไม่มี verified wet plywood / steel/equipment catalogs; ค่าคัดกรองเป็น DEMO_ONLY
- คานต่อเนื่อง การรับรองการแบ่งแรงคานคู่ shear buckling/combined stress/local buckling/crippling, corner/yoke joints, threads/nuts/plates และ panel splices ยังไม่ครบ
- ค้ำยันเหล็ก 34 มม. ยังไม่รู้ชนิด/ความหนา/ความยาว/จุดต่อ; Anchor/ฐานรอง/ลม/global stability ยังไม่ครบ
- รูป L รองรับ geometry/face load และคัดกรอง แต่ไม่ได้อนุมัติ load path ทั้งระบบ
- รองรับเฉพาะรูป Rectangle/L คงความสูง; Polygon อื่น/holes/curves/tapers ยังไม่รองรับในต้นแบบ
- รูปด้านเป็น NTS; รายละเอียดค้ำยันเป็นสัญลักษณ์ ไม่ใช่แบบประกอบที่รับรอง
- Firebase shared workspace อยู่ใต้ `RC-FormWork-App/root` โดยผู้ใช้จะเห็นเฉพาะโครงการที่ถูก assign และกำหนดสิทธิ์รายโครงการได้ 3 ระดับ (ดู / แก้ไข / จัดการ); MasterAdmin เห็นทุกโครงการ, จัดการ Role, Assign/ถอด Assign, ลบโครงการ และตั้งค่า API ได้
- ไม่ได้ตรวจ UI ในเบราว์เซอร์จริงหรือการแบ่งหน้าของ PDF; ไม่มี A3/DXF หรือระบบ report worker ที่ผ่าน visual QA
- Source/geometry/criteria revision provenance ยังไม่ครบตาม Master Prompt

**ทุกระบบถูกบล็อกจาก construction PASS และการออกเอกสารใช้งานจริงอยู่เสมอ**
ผลคัดกรองที่ไม่เกินค่าเกณฑ์ยังคง INCOMPLETE; ผลเกินเกณฑ์แสดง FAIL.

## รุ่นคลาวด์ส่วนตัว

เปิดได้ที่ https://cmg-formwork-design.noppadonpinitphol155.chatgpt.site
รุ่นนี้เชื่อม Firebase production โดยตรงเมื่อ `.env` มีค่า `VITE_FIREBASE_ENABLED=true` และ `VITE_FIREBASE_USE_EMULATORS=false`
ข้อมูลบัญชีอยู่ที่ `RC-FormWork-App/root/users/{email}` และ metadata แรกเริ่มอยู่ที่ `RC-FormWork-App/root/appMeta/config`; ข้อมูลโครงการอยู่ layer เดียวกับ users ที่ `projects/{projectId}`
การแก้ไข workspace จะ auto-save แบบหน่วงสั้นและปุ่ม “บันทึก” ยังใช้เขียน snapshot ของหมวดที่กำลังเปิดอยู่
อ่าน docs/ENGINEERING_PHASE_02.md และ docs/ENGINEERING_PHASE_03.md สำหรับโมเดลและข้อจำกัด

## เริ่มใน Windows

ติดตั้ง Node.js 22.12+ (แนะนำ Node 22 LTS สำหรับ Functions) และ npm ก่อน

เปิด PowerShell ในโฟลเดอร์นี้:

    npm ci
    npm test
    npm run build
    npm run dev

เปิด URL localhost ที่ Vite แสดง ระบบจะเชื่อม Firebase production ตามค่าใน `.env`.
ใช้ scripts/Start-Frontend.ps1 เพื่อทำขั้นตอนติดตั้งและเริ่ม dev server.

## Firebase production และ Emulator สำหรับทดสอบเท่านั้น

CLI ที่ lock ในชุดนี้เป็น Firebase Tools 14 เพื่อทดสอบร่วมกับ Java 17 ได้
แนะนำ JDK 21 สำหรับการอัปเกรด CLI 15 ขึ้นไป ซึ่งต้องใช้ Java 21.

สำหรับการใช้งานจริง ให้คัดลอก `.env.example` เป็น `.env` แล้วตั้ง:

    VITE_FIREBASE_ENABLED=true
    VITE_FIREBASE_USE_EMULATORS=false

ห้ามตั้ง `VITE_FIREBASE_USE_EMULATORS=true` ใน environment ที่ต้องการเขียนข้อมูลจริง เพราะค่าดังกล่าวจะเปลี่ยนไปใช้บริการจำลองบนเครื่อง

ส่วน emulator ด้านล่างมีไว้สำหรับทดสอบ Rules/Functions แยกจากข้อมูลจริงเท่านั้น:

Terminal แรก:

คัดลอก functions/.env.local.example เป็น functions/.env.local
และ functions/.secret.local.example เป็น functions/.secret.local เพื่อปิด AI ด้วยค่าจำลองระหว่างทดสอบ
PowerShell script จะเตรียมไฟล์เหล่านี้เมื่อยังไม่มี

    npm run emulators

Terminal ที่สอง:

    npm run dev

ใน Firebase Console ให้เปิด Authentication providers: Email/Password และ Google, เพิ่ม localhost/โดเมนใช้งานใน Authorized domains แล้วเปิดแอปที่ `/register` บัญชีคนแรกจะได้ `MasterAdmin + approved` อัตโนมัติ บัญชีถัดไปจะเป็น `Staff + pending` จนกว่าจะอนุมัติจากเมนูจัดการ User ที่มุมซ้ายล่าง
เมื่อใช้ emulator บัญชีและข้อมูลจะอยู่ในบริการจำลองบนเครื่องเท่านั้น
ใช้ scripts/Start-Emulators.ps1 สำหรับตรวจ prerequisite และเริ่มระบบ.

ทดสอบ Rules:

    npm run test:rules

Backend compile:

    npm run build --workspace functions

ทดสอบ authenticated Functions หลัง compile:

    npm run test:functions

**ห้ามใช้ Firebase production โดยไม่ได้รับการตั้งค่าและการอนุญาต; การอัปเดต Sites ส่วนตัวนี้ได้รับอนุญาตจาก Owner แล้ว**
ไม่ใส่ service account / OpenAI key ลงไฟล์ VITE_*.

## AI อ่านภาพ

หน้ารับแบบแสดงภาพตัวอย่างในเครื่องก่อนรอ Storage และเลือกหน้า PDF ได้ในหน้าแอป
PDF หน้าเดียวเปิดได้ทันทีโดยไม่มี prompt; หลายหน้าต้องเลือกภาพหน้าที่จะอัปโหลด
ภาพสำหรับ AI ถูกปรับให้ไม่เกิน 5 MiB พร้อมเก็บต้นฉบับไม่เกิน 20 MiB
การอัปโหลดมีความคืบหน้า ยกเลิก และลองใหม่ได้; ความล้มเหลวไม่ล้างภาพตัวอย่าง
เมื่ออัปโหลดสำเร็จแล้ว การลองวิเคราะห์ AI อีกครั้งจะใช้ไฟล์เดิม
สถานะบริการคลาวด์และขั้นตอนที่ยังต้องตั้งค่าอยู่ใน [AI_UPLOAD_SETUP.md](docs/AI_UPLOAD_SETUP.md)

ขั้นตอนในหน้า “รับแบบและ AI”: อัปโหลดหน้าแบบ → AI แยกรายการฐานราก/เสา (`elements`) → เลือกรายการที่มีมิติครบเพื่อสร้าง Design case → ดูโมเดล 3D, ปริมาณวัสดุ, ส่งออก `.gltf`/`.dxf` → สั่งปรับผ่าน “สนทนากับ AI” ซึ่งส่งโมเดลปัจจุบันไปด้วยและได้ `changes` กลับมาเป็นตารางให้กดยืนยัน (ย้อนได้). แบบที่เปิดอยู่จะคงไว้เมื่อสลับ case ในโครงการเดียวกัน. รายการที่ขาดมิติจะไม่ถูกเติมค่าเดา และโมเดลที่สร้างยังไม่ยืนยันมิติเสมอ.
ตรรกะโมเดล 3D/การแก้ค่าใช้ร่วมกับ MCP server ที่ `src/domain/scene.ts`; ต้อง deploy Functions ใหม่ (`extractGeometry`, `drawingChat`) จึงจะใช้ schema ใหม่บน production.

Adapter extractGeometry อยู่ functions/src/index.ts.
รองรับ selected page PNG/JPEG ไม่เกิน 5 MiB; PDF แปลงเป็นภาพหน้าที่เลือกใน browser.
ต้องตั้ง OPENAI_VISION_MODEL และ OPENAI_API_KEY ฝั่ง server ตาม Firebase Secret configuration.
การส่งแบบไป external provider ต้องผ่านการตั้งค่าและการอนุญาตของผู้ใช้ก่อน ไม่ทดสอบด้วยข้อมูลโครงการจริงในชุดนี้.
Provider output เป็น draft เสมอ และต้องตรวจยืนยันทุกมิติ; geometry schema ไม่ใช่หลักฐานว่ามิติถูกต้อง.

## Part 2 · ระบบแนะนำปรับแก้ (ฐานราก/เสา)

เมนู “จัดวางเบื้องต้น” ค้นหาความหนาไม้อัด (12–25 mm) ระยะคร่าว ระยะคานคู่ ระยะ Tie และขนาด Tie (Ø12–32) ด้วยการคำนวณซ้ำด้วย engine เดิมทุกตัวเลือก (`src/domain/optimize.ts`) จนไม่มีรายการคัดกรองเกินเป้า (1.00 / 0.95 / 0.90 / 0.85), เรียงตามจำนวนชิ้นส่วน และให้คำแนะนำรายรายการที่เกินเกณฑ์ (แสดงในเมนูรายการคำนวณด้วย). หน้าตัดคร่าว/คานคู่และค่าวัสดุไม่ถูกเปลี่ยน; รูป L ที่ไม่มี Tie จะแจ้งว่าต้องเพิ่มหน้าตัด. ผลที่ไม่เกินเกณฑ์ยังเป็น INCOMPLETE. MCP `formwork_alternatives` ใช้ตัวค้นหาเดียวกัน.

### หน้าตัด, Tie รูป L และการเชื่อมกับแชท AI
- **ตารางหน้าตัดไทย (เลือกได้ในเมนูรายการคำนวณและจัดวาง ผ่าน dropdown ชนิด → ขนาด):** `src/domain/sectionStock.ts` (575 หน้าตัด) สร้างด้วย `node scripts/generate-section-stock.mjs` จาก
  - มอก. 107-2566 เหล็กกล่องจัตุรัส/ผืนผ้า และท่อกลม (Pacific Pipe catalogue 2026_2 ตาราง ก.1/ข.1/ค.1) → `src/reference/thai-sections/pap-tis107-2026.json` ดึงด้วย `scripts/extract-pap-tis107.mjs` (ตรวจทุกแถวเทียบเรขาคณิตและน้ำหนัก)
  - มอก. 1227-2558 เหล็กรางน้ำ C รีดร้อน และเหล็กฉากขาเท่า (SYS Engineer Handbook Edit 6) → `sys-tis1227-2026.json` ดึงด้วย `scripts/extract-sys-tis1227.mjs`
  - มอก. 1228 เหล็กตัวซี C-LIP (Pacific Pipe) และไม้ขนาดจริง 1½″×3″ ฯลฯ จากไลบรารีหน้าตัด v0.4; ชั้นไม้ (อ่อนมาก…แข็งมาก) จากหนังสือ Design Form Work ตาราง 3.4 (อ้าง ว.ส.ท.)
  - คร่าว: ไม้ / SHS / RHS (`Input.studSectionId`, `studTimberGrade`); คานคู่: RHS / SHS / ฉาก / ตัวซี / รางน้ำ / ท่อ (`Input.walerSectionId`). ใช้ค่า gross ที่ผู้ผลิตเผยแพร่ (ไม่ใช่ effective section); เหล็กฉากใช้ S ต่ำสุดรอบแกนเรขาคณิต; ไม้ใช้ Fb/Fv/E ที่ยอมให้จากหนังสือ
  - คลังที่บริษัทมีจริงติ๊กได้ในเมนูจัดวาง (`project.sectionStock`); ตัวค้นหาใช้เฉพาะหน้าตัดที่แข็งแรง ≥ เดิม คร่าวไม้เปลี่ยนเป็นไม้เท่านั้น และเรียงตามน้ำหนักเหล็ก
- **Tie รูป L:** `src/domain/tieRoutes.ts` แบ่งแปลนเป็นช่วงตามพิกัดมุม แล้ววาง Tie ตรงระหว่างด้านตรงข้ามจริงในแต่ละช่วง (สี่เหลี่ยมได้ผลเท่าเดิม). แรงออกแบบ Tie = ค่ามากของแรงสองปลาย; ถ้าสองปลายไม่เท่ากันจะมี blocker. แบบ A3, 3D, BOM และรายงานใช้เส้นทางเดียวกัน.
- **แชท ↔ Part 2:** Cloud Function `drawingChat` คำนวณ `optimizerBrief` จากโมเดลปัจจุบัน + คลังหน้าตัด แล้วส่งให้ AI; AI ต้องเลือกจากทางเลือกที่คำนวณซ้ำแล้วเท่านั้นและส่ง `changes` ให้ผู้ใช้กดยืนยัน. มีปุ่มคำสั่งด่วนในแชท. MCP `formwork_alternatives` รองรับ `sections`. ต้อง deploy Functions ใหม่.

## แรงดันคอนกรีตสด และ Design Book
- **แรงดันด้านข้าง** (`src/domain/pressure.ts`): เลือกในเมนู Design Criteria ระหว่าง แรงดันของเหลว ρgh (ค่าเริ่มต้น ผลเดิมไม่เปลี่ยน) และ **ACI PRC-347-14(21)** (= ACI 347R-14 ยืนยันใช้ต่อปี 2021, ฉบับปัจจุบัน) สมการ SI 4.2.2.1b(a)/(b)/(c) เลือกตามตาราง 4.2.2.1b (ค่ายุบตัว, ความลึกการจี้, เสา/ผนังตามด้านแปลน 2 m, ความสูง 4.2 m, อัตราการเท 2.1/4.5 m/h) พร้อม Cc (ตาราง 4.2.2.1a(b)) และ Cw (ตาราง 4.2.2.1a(c)), ขั้นต่ำ 30Cw, ไม่เกิน ρgh, ซองแรงดันตามรูป 4.2.2 (hcap). Input ใหม่: `pressureMethod, pourRate, concreteTemp, slump, vibrationDepth, chemistryCc` (ข้อมูลเก่า = HYDROSTATIC). ทุกการตรวจสมาชิกใช้ pmax จากโมเดลนี้; รายการคำนวณหัวข้อ 3 แสดงขั้นตอนแทนค่าและรูปซองแรงดัน; แบบ A3 ระบุอัตราการเทที่ใช้.
- **เมนู Design Book** (`src/components/DesignBook.tsx`): สรุปมาตรฐานและฉบับล่าสุด, หลักการแรงดันคอนกรีต (ACI-347 เดิม/CEB/CIRA ในหนังสือ เทียบ ACI ฉบับปัจจุบัน พร้อมตัวอย่างจากแบบที่เปิดอยู่), ตาราง 3.4 (ว.ส.ท.), 3.6 ก/ข, สูตร APA 3.1–3.4, ตาราง 3.8 และ 3.9 คัดจากหนังสือ Design Form Work (สแกน, ระบุเลขหน้าพิมพ์). ค่า fb ในตาราง 3.8 มีหมายเหตุว่าน่าสงสัย และยังไม่ถูกใช้ใน engine.

## ค่าเริ่มต้นวัสดุ (แทน DEMO_ONLY)
- **ไม้อัด** (`src/domain/plywoodGrades.ts`): `Input.plywoodGrade` = PLYFORM_I (ค่าเริ่มต้น) / PLYFORM_II / STRUCT_I จาก APA Concrete Forming Design/Construction Guide V345 (2012) ตาราง 12 (KS, I, Ib/Q ทั้งแรงขนานและตั้งฉากลายไม้ผิว) และ 13 (Fb, E/Ee, Fs ปรับสภาพเปียก + Cs แล้ว) ตรวจแบบคานต่อเนื่องตาม V345 หน้า 22–23: M = wl₁²/8 หรือ /10, V = 0.625/0.6 wl₂, การโก่งจากการดัด (2220/1743) + การโก่งจากแรงเฉือน, ช่วงว่าง l₂ และ l₃ ตามความกว้างคร่าว. `plywoodSpans` = AUTO (นับช่วงในแผ่น 2440/1220 mm และกฎ APA 813/406 mm) / SINGLE / TWO / THREE, `plywoodFaceGrain` = ACROSS (วางแผ่นแนวนอน ค่าเริ่มต้น) / PARALLEL — แบบ A3 และ BOM วางแผ่นตามทิศนี้. ทดสอบตรงกับตัวอย่าง 2 ของ V345 (412 / 714 / 370 psf). CUSTOM ใช้ plywoodE/plywoodFb บนหน้าตัดเต็ม. ข้อมูลเดิม = CUSTOM + ช่วงเดี่ยว + แผ่นแนวตั้ง (ผลเดิมไม่เปลี่ยน).
- **เหล็ก**: Fy 245 MPa (STKR400 มอก.107 / SS400 มอก.1227 / SSCS400 มอก.1228), E 200,000 MPa, Ωb = Ωv = 1.67 (AISC 360 ASD F1/G1).
- **คำแนะนำ** ในเมนู Design Criteria (`src/components/CriteriaGuide.tsx`): γ, วิธีแรงดันและค่าหน้างานไทย, L/360–L/270 (APA) และ ACI 117, การเลือกไม้อัดและการใช้ค่าจากผู้ผลิต, เกรดเหล็ก.

## Part 3 · รายการคำนวณ A4

เมนู “รายงาน PDF” (`src/components/CalcReport.tsx`): ปกพร้อมตารางลงนาม/ประวัติ Rev, สารบัญ, เกณฑ์ออกแบบ, แปลน/รูปตัดชุดเดียวกับแบบ A3, กราฟแรงดัน, แบบจำลองคานไม้อัด/คร่าว, การตรวจแต่ละรายการแบบ สูตร → แทนค่า → ผล พร้อมแถบอัตราส่วน, สรุปผลและคำแนะนำปรับแก้, BOM, รายการแบบ, ข้อจำกัด และเอกสารอ้างอิง. พิมพ์ A4 พร้อมหัว/ท้ายกระดาษและเลขหน้า (`@page report`).
ข้อมูลกรอบชื่อแบบ (Rev, วันที่, ออกแบบ/เขียน/ตรวจ/อนุมัติ, ประวัติการแก้ไข) บันทึกในแบบ (`case.titleBlock`) ของโครงการ และใช้ร่วมกันทั้งแบบ A3 และรายงาน.

## ชุดแบบก่อสร้างแบบหล่อ A3 (ฐานราก/เสา)

เมนู “แปลนและรูปตัด” สร้างชุดแบบ A3 แนวนอน 4 แผ่นจากข้อมูลเดียวกับรายการคำนวณ (`src/domain/formworkLayout.ts` → `src/drawing/` → `src/components/DrawingSet.tsx`):

| แผ่น | เนื้อหา |
|---|---|
| FW-01 | แปลนแบบหล่อ: ไม้อัด คร่าว คานคู่ Tie, ระยะ chain dimension, รูปตัด A-A, สัญลักษณ์, หมายเหตุทั่วไป |
| FW-02 | รูปตัด A-A และรูปด้าน E1 พร้อมระดับคานคู่ ระยะคร่าว/Tie และรอยต่อแผ่นไม้อัด 1220×2440 |
| FW-03 | รายละเอียดชุด Tie (ฐานราก) หรือคานคู่ชุดรัด (เสา), รายละเอียดมุม, หน้าตัดองค์อาคาร, ภาพ 3 มิติ |
| FW-04 | ตารางวัสดุ (BOM) ข้อมูลออกแบบ สรุปผลตรวจ และรายการที่ยังขาด |

มาตราส่วนเลือกอัตโนมัติจากชุดมาตรฐาน, กรอบชื่อแบบ CMG (Rev/วันที่/ผู้ออกแบบ/เขียน/ตรวจ/อนุมัติ กรอกได้ ยังไม่บันทึกลงโครงการ), พิมพ์เป็น PDF A3 ผ่านเบราว์เซอร์ หรือดาวน์โหลด SVG รายแผ่น.
ทุกแผ่นมีตราประทับ “แบบร่างเบื้องต้น · ห้ามใช้ก่อสร้าง” จนกว่า engine จะมีข้อมูลวัสดุ/อุปกรณ์รับรองและผ่านการตรวจของวิศวกร. ความยาว Tie ยังไม่รวมเกลียว/นอต/แผ่นรอง และค้ำยันยังไม่ออกแบบ.

## MCP server สำหรับ AI (cmg-formwork)

`mcp/` คือ MCP server (stdio) ที่ให้ AI agent (Devin, Claude Desktop, Cursor ฯลฯ) สร้างและแก้โมเดลไม้แบบผ่านการคุย โดยเรียก engine `src/domain` ตัวเดียวกับเว็บแอป

    npm run mcp:build     # คอมไพล์เป็น mcp/dist/mcp/server.js
    npm run test:mcp      # build + smoke test ผ่าน stdio

ลงทะเบียนไว้ที่ `%APPDATA%\devin\mcp_config.json` (ระดับผู้ใช้) ชื่อ `cmg-formwork`; โมเดลเก็บที่ `artifacts/formwork-models` (ตั้งด้วย `FORMWORK_MODELS_DIR`)

| Tool | หน้าที่ |
|---|---|
| formwork_read_drawing | อ่าน PDF (ข้อความ + ค่าที่น่าจะเป็นมิติ, render หน้าสแกนเป็นภาพ) หรือไฟล์ภาพแบบ |
| formwork_create_model / formwork_update_model / formwork_undo | สร้าง แก้ (เก็บ revision) และย้อนโมเดล; แก้ geometry แล้ว `confirmed` กลับเป็น false |
| formwork_get_model / formwork_list_models / formwork_schema | ผลคำนวณ checks, blockers, ปริมาณวัสดุ และคำอธิบายพารามิเตอร์ |
| formwork_alternatives | ทางเลือกระยะ/ความหนาแบบ deterministic |
| formwork_export | OBJ+MTL (เมตร, Y-up), DXF 3DFACE (มม.), JSON |
| formwork_export_app_project | ไฟล์โครงการ schemaVersion 3 สำหรับนำเข้าเว็บแอป |

Prompt `formwork_from_drawing` (slash command `/mcp__cmg-formwork__formwork_from_drawing`) นำทางขั้นตอน แบบ → โมเดล → คุยแก้ → export.
โมเดล 3D เป็นภาพประกอบ NTS ของผังคัดกรองเท่านั้น สถานะยังคง INCOMPLETE/FAIL ตาม engine และไม่ใช่แบบก่อสร้าง.

## โครงสร้าง

- mcp: MCP server สำหรับ AI สร้าง/แก้โมเดลไม้แบบ (ใช้ src/domain)
- src/domain: calculation kernel ไม่มี React/Firebase dependency
- src/main.tsx: UI / source import / report / drawings
- src/firebase.ts: browser Auth/DB/Functions/Storage adapters
- functions/src: authenticated trusted server calls
- tests: analytical fixtures and Security Rules tests
- docs: capability/validation/handoff documentation
- CODEX_NEXT_TASK.txt: งานถัดไปสำหรับ Codex
- CMG_Formwork_Codex_Master_Prompt.txt: specification รุ่น 1.1

## ข้อมูลตัวอย่าง

F01: 3 × 4 × 2.5 m; F02 L-shaped: polygon area 10 m², perimeter 14 m, depth 2.5 m;
C01: 1 × 1 × 8 m. เป็นตัวอย่างสำหรับตรวจโปรแกรม ไม่ใช่แบบที่อนุมัติ.
