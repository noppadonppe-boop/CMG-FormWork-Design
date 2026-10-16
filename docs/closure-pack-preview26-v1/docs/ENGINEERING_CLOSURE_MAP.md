# แผนปิดข้อขัดข้อง — preview.26 → งานรอบถัดไป

วันที่ตรวจแหล่ง: 15 ตุลาคม 2026
สถานะ: ชุดส่งต่อข้อมูลและโค้ดอ้างอิงออฟไลน์ ไม่ได้ตรวจ/แก้ workspace F: จริง

## หลักฐานที่มี
รายงาน preview.26 และผล693 tests เป็นข้อความที่ Owner ส่งมา ยังไม่ได้ยืนยันจาก source/log ต้นฉบับ เนื่องจากเครื่อง Remote Offline และไม่พบไฟล์ preview.26 ที่ค้นใน Library
ตรวจ ZIP v0.6.2/v0.7 ใน sandbox จริง: v0.6.2 มีข้อมูลไทร์ JSON แล้ว v0.7 มีเพียงคู่มือไทร์ใต้ baseline จึงแก้ช่องว่างแพ็กเกจได้ทันที แต่ต้องให้ Codex ตรวจว่า issue ปัจจุบันเกิดจาก loader/schema/path อย่างไรด้วย

## ตารางปิดงาน
| Blocker | สิ่งที่จัดให้ | สิ่งที่ Codex ปิดได้ | สิ่งที่ต้องมีเพิ่มก่อนใช้งานวิศวกรรม |
|---|---|---|---|
| Form Tie machine-readable | 6 JSON ต้นฉบับ byte-identical + normalized library11 records/6templates/13check slots + schema + helper | import/data mapping/schema/role aliases/issue ownership | รุ่นอุปกรณ์จริงและ complete-assembly evidence, outer/cone/nut/plate/engagement, actual reactions |
| Ringlock ratings | 17 component-reference records พร้อมเงื่อนไข/หน่วย/edition + exact lookup | reference sidecar/เลือกข้อมูลถูกscope/ไม่แตะmaster | verified whole configuration หรือ full analysis+joint/head/base rules+actual identity |
| ดิน/พื้นรองรับ | support_soil/support_slab templates, signed transfer/contact trial helpers | UI/validation/contract linkage/revision tracking | geotech/as-built rebar/strength/stage load/support details; soil bearing/settlement/punching resistance |
| Serviceability | policy template + Caltrans reference-only option + numeric limit comparison | มีช่องเกณฑ์อ้างอิงและCustom ไม่hardcode | เกณฑ์โครงการและโหลดที่ใช้ร่วมกัน ความชื้น/creep/settlement/combined movement |
| young slab / stage | mix-specific strength evidence + calibration/history fields, active/captured stage gate | evidence workflow/stale detection | กำลังตามอายุจริง stiffness/creep/punching/flexure/stage redistribution/reshoring |
| engineer-reviewed rules | 13 scoped helper rules + tests + review checklist | version/hash/source/test traceability | ผู้ตรวจที่มีอำนาจทวนและอนุมัติสมการตามcode/รุ่น/ขอบเขตจริง |
| full suite red | triage decision + prohibited workaround list | diagnosis/reporting | อนุญาตเฉพาะไฟล์protected test จึงแก้ได้; หลังแก้ต้องรันใหม่ ไม่อ้างผลล่วงหน้า |

## 1. Form Tie
ต้นฉบับ `wall_tie_extension_v0.6.2.json` มี13 component/check slots โดย rated_capacity ทุกตัวเป็นnull การมีไฟล์ไม่ได้ทำให้ capacity พร้อมใช้งาน แต่ปิดคำว่า “ไม่มี machine-readable contract” ได้เมื่อเชื่อมสำเร็จ

Normalized library เก็บ4 legacy book rows +7 Okabe manufacturer rows ต่างหาก ไม่เอาค่าผู้ผลิตเขียนทับค่าหนังสือ
ตัวเลขจาก Okabe HTML ไม่มีปีฉบับ ภาพตาราง/แค็ตตาล็อกPDFฉบับเต็มยังไม่ได้ยืนยัน จึง REFERENCE_ONLY ทุกแถว

การเปลี่ยนชื่อ PLATE กับ BEARING_PLATE เป็นความต่างจริงระหว่าง template กับ fixture จึงทำ alias ที่ระบุทิศชัดเจน ไม่รวมรหัสแบบ fuzzy
THREAD_END และ WALER_LOCAL เป็น check slots ไม่ใช่ชิ้นส่วนให้ BOM นับเพิ่ม

แบบจำลองแรงต้องเริ่ม pressure→plywood→stud reaction→waler point loads→tie reaction
แรงไทร์แต่ละปลายของระบบสมมาตรอนุกรมไม่คูณ2/หาร2 และเลขกำลังSeparatorไม่ใช่กำลังทั้งชุด
พื้นที่50.3mm²ของOkabeB-W3/8เป็นพื้นที่effectiveตามผู้ผลิต ไม่ใช่พื้นที่วงกลมจากชื่อเกลียว และไม่ใช่พื้นที่stiffnessทุกส่วนโดยอัตโนมัติ

## 2. Ringlock ข้อมูลที่หาเพิ่มได้จริง
Doka brochure 11/2020 en-GB PDFหน้า30–32 อ่านข้อความและภาพตาราง/แกนแล้ว:
- standards ledger vertical spacing0.5/1/1.5/2/2.5/3m มีcompression62/55/43/29/19.2/13kN ตามลำดับ; tension56kNตามเงื่อนไขleg locks
- braceเฉพาะlift2m มี7bay lengths; tension12.2kN, compressionต่างตามbay
- joints single-actionMy105kNcm(1.05kNm),Vz18.5kN,N23.9kN,Vy10.8kN

นี่คือข้อมูลอ้างอิงที่เพิ่งอ่านเพิ่ม ไม่ใช่เอกสารเพิ่งออกปี2026 ไม่ได้จับคู่ไปสินค้าของOwnerแล้ว และไม่ใช้แทนhead/base extension ratings หรือtowercapacity
หัวตารางใช้Maximum Design Forces ขณะที่หมายเหตุเรียกpermissible loadsและระบุgammaM1.1/gammaF1.5 ต้องเก็บถ้อยคำ/ฐานดังกล่าวและให้วิศวกรตีความ ห้ามหารหรือคูณซ้ำอัตโนมัติ

แรงสูงสุดของjointไม่ใช่stiffness: ห้ามสร้างค่าพิน/rigid/springcurveจาก105kNcm การคิดsecond-orderต้องใช้model/connectionbehaviorที่ได้รับการตรวจ หรือมีconfiguration rating ที่ครอบคลุมกรณีจริง

พบDoka12/2025 User Informationฉบับใหญ่ แต่fetchถูกจำกัดขนาด จึงยังไม่ใช้snippetsมาเติมค่าrating
60kN/legบนหน้าRinglockShoringframesเป็นอีกระบบ ไม่ใช้กับgenericstandards

## 3. Design Basis ดิน/พื้นไม่ใช่ค่าที่ดึงจากเว็บแล้วใช้แทนหน้างานได้
Soil: ต้องมีfootprintและsoleboardจริง, N/Mที่จุดสัมผัส, groundconditions/groundwater/geotechreport, gross/netbearingbasis, settlementmodelและเกณฑ์
qallow, groundstiffness และsettlementlimitเป็นคนละข้อมูล ห้ามอนุมานค่าใดจากอีกค่าโดยไม่มีแบบจำลอง
Slab: ต้องมีแบบas-built ความหนาeffective depth/rebar ตำแหน่งขอบ-ช่องเปิด-เสา การรับแรงกดเป็นกลุ่ม moment transfer แรงเดิม+แรงก่อสร้าง และกำลังตามstage
Slab-on-groundอาจต้องตรวจทั้งแผ่นพื้นและดิน ไม่ตั้ง SOIL_ONLY อัตโนมัติ

Signed transfer รักษาforce+reaction=0 และmomentsทุกแกนที่datumเดียวกัน; ถ้าคนละdatumต้องแปลงโมเมนต์ด้วยr×Fให้ถูกก่อน ไม่ใช่ลบmomentออก
สมการfull-contacttrial ใช้compression N>0และสี่เหลี่ยมrigidไม่มีรูเท่านั้น; qmin<=0ให้แยกpartialcontact ไม่clipแล้วถือว่าผ่าน

## 4. Serviceability / settlement / punching
Caltrans Chapter4(Sept2023)§4-2.01มีL/240จริง แต่ใช้กับfalseworkbeamและโหลดคอนกรีตทั้งหน้าตัดsuperstructureเป็นsinglepour โดยไม่รวมfalseworkweightในการตรวจข้อนั้น เป็นตัวเลือกอ้างอิงต่างประเทศเท่านั้น ไม่ตั้งให้ทุกแผ่นไม้อัด/ระบบไทย และไม่ใช่เกณฑ์settlement
ไม่มีตัวเลขsettlementรวม/ต่างระดับหรือtieopeningสากลที่นำมาเติมให้โครงการนี้จากหลักฐานที่อ่าน
ฟังก์ชันvavg=V/(b0d)เป็นaveragepunchingdemandไม่รวมmomentconcentrationและไม่คำนวณresistance; ห้ามเรียกPASS

## 5. กฎหมาย/มาตรฐานที่เติมในsource register
- กฎกระทรวงนั่งร้าน/ค้ำยัน2564ข้อ13–14: ขอบเขตวิศวกร,กำลัง/ฐานรองรับ/ยึดโยง/ตรวจสภาพ ตัวเลขsteel/woodminimumและfactorเก็บแยกเป็นlegalreference ต้องmappingกับbasisของrating ห้ามdoublefactorบนSWLโดยเดา
- BS5975-1/2:2024: management/falseworkdesign ข้อมูลที่อ่านเป็นscope ไม่ใช่fulllicensedclauses
- ACI PRC347.2-17(25): youngslab/reshoring strength+serviceability จากdescription/TOC ไม่ได้implementสูตรเต็ม
- ASTM C1074-19e1: maturityต้องcalibrateactualmix+temperaturehistory ไม่ใช่อายุวันกับอัตราส่วนกำลังที่เดา

## 6. สถานะที่ควรแสดงแยกในแอป/รายงาน
DATA_READINESS / SOFTWARE_VALIDATION / PROJECT_EVIDENCE / ENGINEERING_ACCEPTANCE / CONSTRUCTION_RELEASE
สิ่งหนึ่งพร้อมไม่เปลี่ยนอีกสถานะโดยอัตโนมัติ
ต้องระบุissue owner: CODEX_IMPLEMENTATION, VENDOR_DOCUMENT, PROJECT_ENGINEER_INPUT, OWNER_PERMISSION หรือ AUTHORIZED_REVIEW พร้อมentity/field/checkและวิธีปิดแต่ละissue

อ้างอิงที่อ่านและข้อจำกัดอย่างละเอียดอยู่ data/source_register.json; ผลทดสอบของแพ็กเกจอยู่ qa/verification_report.json ไม่ใช่ผลของworkspaceจริง
