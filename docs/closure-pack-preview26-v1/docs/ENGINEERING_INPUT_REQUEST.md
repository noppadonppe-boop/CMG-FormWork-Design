# ข้อมูลที่ต้องรับจากผู้ผลิตและวิศวกรโครงการ

กรอกใน templates/*.json โดยคง null เมื่อไม่ทราบ ข้อมูลในไฟล์เป็น draft ไม่ใช่การยืนยันจากผู้ออกแบบ

## A. Form Tie — ผู้ผลิต/ผู้จัดหาและผู้ตรวจงาน
ระบุชุดที่ใช้จริง ไม่ใช้เพียงคำว่าFormTie3/8:
- ผู้ผลิต รุ่น/SKU ล็อต เกรด และรูปชุดประกอบ Inner–Outer–End connection–Nut–Plate ทั้งสองข้าง
- เกลียวชนิด/ขนาด/pitchหรือTPI ความยาวขบจริง/ขั้นต่ำ ขีดจำกัดมุมเอียงและความยาวยื่น; ไม่เทียบW3/8กับM10โดยชื่อใกล้กัน
- Effective tensile area และstiffnessareaแยกตามช่วงก้าน; breaking/working/design capacityพร้อมนิยามและreportที่รองรับ
- Rated complete assembly หรือกำลังและรายละเอียดครบทุกcheckslot; ถ้ารายงานทดสอบรวมบางlimitstatesให้ผูกcoverageไม่คิดว่าแยกcomponentทุกตัวได้รับกำลังเท่ากัน
- รูปแผ่นประกับ/rib washer ช่องว่างและทิศคานคู่ สภาพรับแรงจริง จุดต่อ มุม/หัวแบบ และการป้องกันน้ำ/อุดรูตามโครงการ
- กติกาตรวจสภาพ/การใช้ซ้ำ/ข้อห้ามเชื่อมดัด/การประกอบและการขัน

ค่าผู้ผลิตseparatorที่หาได้ในpackไม่เติมouter/nut/plateให้เอง การอ่านรายการครบยังต้องตรวจอุปกรณ์จริงก่อนใช้

## B. Ringlock — ผู้ผลิต/ผู้เช่าและวิศวกร Temporary Works
ส่งคู่มือและratingที่ตรงระบบที่จะใช้:
1. Manufacturer/system/generation, partcodes, pipeOD/tจริง/เกรด, standard/spigot/ledger/brace/node/head/baseรายละเอียด
2. Configuration: bayX/Y,liftpattern,ความสูงติดตั้ง,head/baseextensions+engagement,bracesทุกทิศ,restrainingties,top/bottom free lengths,footprint/soleboard และloadpatterns
3. Resistance basisพร้อมsafetyfactorsที่รวมแล้ว; ตารางhead/baseตามextension,member/brace/node/jointNVMinteraction; M–theta curveถ้าต้องใช้ในanalysis
4. Full configuration ratingที่ครอบคลุมหรือcalculationreportที่วิศวกรทวน; secondorder/imperfection/unequalnodeforces/wind/stages
5. ข้อกำหนดผสมชิ้นส่วนต่างรุ่น/การตรวจสภาพ/การประกอบ/รื้อถอน

Head/Baseแจ็กยาว60cmไม่เท่ากับอนุญาตยืด60cm; nodecapacityไม่ได้บอกstiffness; ขารับแรงไม่เท่ากันให้ใช้actualreactions

## C. ฐานรองรับดิน
แบบพื้นที่/ระดับ/ชั้นดินและgroundwater,reportค่ารับแรงที่อธิบายgross/netและฐานworking/design,soil stiffnessที่มีวิธีสอบเทียบ,แผ่นฐานและsoleboardจริง,ผลsettlementรวม/ต่างระดับและเกณฑ์โครงการ,sliding/lateralrestraints,drainage/การเปลี่ยนสภาพระหว่างงาน
ไม่เสนอqallowตัวเดียวโดยไม่ทราบชั้นดินและขนาดฐาน และไม่เปลี่ยนbearingcapacityเป็นstiffnessโดยสัดส่วนที่เดา

## D. พื้นหรือyoungslabรองรับ
แบบas-builtและrebar,thickness/directions/effectivedepth,edges/openings/supportcolumns,contactfootprintsและกลุ่มขา,loadstages/loadsเดิม,punchingmomenttransfer,concrete actual mix/time/strength test,youngage stiffness/cracking/creep,reshoringstageanalysis
ASTM C1074เป็นทางเลือกประเมินstrengthเฉพาะเมื่อมีcalibrationactualmix+temperaturehistoryและหลักฐานตรวจเหมาะสม ไม่ใช่อนุมัติรับแรงเพราะอายุ7/14/28วัน

## E. เกณฑ์การเสียรูปและอนุมัติ
กำหนดrelative/absolutedeflectionแยกตามmemberroleและloadcase,หน้าตัดไม้/ไม้อัดเปียกและcreep,reactionsettlement/headmovement/tieopeningที่ต้องรวม,settlementรวม/ต่างระดับและระยะวัด,กติกาตรวจstageก่อนเท/ถอด/เปลี่ยนโหลด
ผู้ตรวจต้องผูกacceptanceกับrulepackversion+hash+revision/stage/loadcaseและหลักฐานที่เชื่อถือได้

## รูปแบบ issue เพื่อส่งกลับผู้ให้ข้อมูล
`issue_id`, `owner_role`, `entity_id`, `check_id`, `field_path`, `missing_or_conflict`, `required_document`, `source_basis`, `revisionId`, `stageId`, `loadCaseId`, `resolution_evidence_ref`, `review_status`

เอกสาร/checkboxที่กรอกครบไม่ได้ทำให้approvedโดยตัวมันเอง; backendต้องตรวจตัวตนและสิทธิ์พร้อมscopeของevidence
