# RC-FormWork — ชุดปิดช่องว่างข้อมูลหลัง preview.26

**ชื่อชุด:** `RC-FormWork_Closure_Pack_preview26_v1`  
**วันที่:** 15 ตุลาคม 2026  
**เป้าหมาย:** ส่งต่อให้ Codex เพิ่มข้อมูล/adapter/การตรวจและรายการข้อมูลค้าง ไม่ใช่ปลด `NO_GO` ด้วยค่าเริ่มต้นที่ไม่มีหลักฐาน

## เริ่มใช้
1. แตก ZIP เป็นโฟลเดอร์เอกสารใหม่โดยไม่ทับ source หรือ Ringlock JSON เดิม
2. เปิด **CODEX_NEXT_PHASE_PROMPT.md** ส่งให้ Codex ที่ workspace `F:\Project Code\RC-FormWork-app` พร้อมบอกตำแหน่งแพ็กเกจ
3. ให้ Codex ตรวจ AGENTS.md/source/log/hash จริงก่อนแก้ตาม prompt และส่งผลกลับตามสถานะที่ตรวจได้

ไม่มีการติดตั้ง/แก้ไฟล์ใน workspaceจริงจากแพ็กเกจนี้ เครื่อง Remoteแจ้งOffline จึงใช้รายงานpreview.26ที่Ownerส่งเป็นบริบท ไม่ใช่หลักฐานว่าผู้จัดทำตรวจsourceจริงแล้ว

## สิ่งที่แก้ให้แล้วในแพ็กเกจนี้
**Form Tie:** พบ6 JSONต้นฉบับในv0.6.2ที่v0.7ไม่ได้พกไปครบ กู้คืนแบบbyte-identicalพร้อมhash และสร้างbridge11ข้อมูลอ้างอิง/6templates/13checkslots; mapชื่อแผ่นประกับชัดเจน ไม่ถือ13checksเป็น13ชิ้นBOM

**Ringlock:** หาcomponentreferencesเพิ่มได้17รายการจากDoka11/2020 พร้อมหน่วยและเงื่อนไข แยกsidecar ไม่แก้ฐานเดิม ข้อมูลนี้ยังไม่ใช่กำลังหอค้ำยัน/Head/BaseตามconfigurationของOwner

**Support/Stage/SLS:** เตรียมแบบรับข้อมูล5ชุดพร้อมsourcebasis/unknowns/reviewcontext มีhelpersสำหรับsignedtransfer,full-contacttrial,averagepunchingdemandและstagehashmatching แต่ไม่สร้างค่าดิน/พื้น/settlement/punchingcapacity

**Full suite:** ทำแผนtriageเฉพาะprotectedtest คงข้อห้ามแก้ tests/source-upload.test.tsx จนOwnerอนุมัติเจาะจง ไม่skip/shimให้ผ่าน

## แผนผังไฟล์
| ไฟล์/โฟลเดอร์ | ใช้ทำอะไร |
|---|---|
| CODEX_NEXT_PHASE_PROMPT.md | คำสั่งรอบต่อไปพร้อมscope/จุดหยุด/เกณฑ์รายงาน |
| docs/ENGINEERING_CLOSURE_MAP.md | แต่ละblockerปิดด้วยโค้ดหรือรอข้อมูลจากใคร |
| docs/ENGINEERING_INPUT_REQUEST.md | รายการข้อมูลที่ต้องขอผู้ผลิตและวิศวกรโครงการ |
| docs/TEST_TRIAGE.md | ปัญหาtestและแบบร่างคำอนุมัติแก้เฉพาะจุด |
| docs/RULE_REVIEW_CHECKLIST.md | เงื่อนไขให้rule packเป็นengineer-reviewedจริง |
| docs/WORKED_EXAMPLES.md | สมการตัวอย่างสังเคราะห์ที่ใช้ทดสอบ |
| baseline/ | 6 JSONจากv0.6.2คงเดิม+hash+หลักฐานpackaginggap |
| data/form_tie_machine_bridge.json | ข้อมูลไทร์normalizedและtopology/checkslot |
| data/ringlock_component_rating_sidecar.json | Doka17componentreferences;exactlookup;ไม่มีautomaticdesignuse |
| data/source_register.json | 14แหล่ง/edition/accessscope/ข้อจำกัด |
| data/thai_shoring_legal_reference.json | ข้อกำหนดอ้างอิงไทยและconversion ไม่ใช่capacityโครงการ |
| data/serviceability_reference_options.json | ตัวเลือกเกณฑ์อ้างอิง ไม่มีuniversaldefault |
| data/rule_pack_manifest.json | 13arithmetic/contracthelpers ไม่ใช่approvedcapacitypack |
| templates/ | ringlock,soil,slab,SLS,stage แบบกรอกข้อมูลpending |
| examples/ | tieexampleที่ต้องคงBLOCKEDเนื่องจากactualevidenceยังขาด |
| src/ | PureESMhelpersและproposedTypeScripttypes ไม่ใช่sourceของapp |
| schemas/ | 4schemasสำหรับreference/draftที่ยังNO_GO |
| tests/ | Nodebuilt-intestsของpackนี้ ไม่แตะtestsของapp |
| qa/ | ผลรันจริงและscriptตรวจข้อมูล/เปรียบเทียบสมการแบบอิสระ |
| OWNER_DECISIONS.json | เรื่องที่ยังต้องอนุมัติและเลือกผลิตภัณฑ์จริง |
| context/preview26_user_report.json | รายงานOwnerพร้อมlabelว่ายังไม่ได้ตรวจซ้ำ |

## ผลรันจริงในsandbox
- Node **77/77ผ่าน**, ไม่skip/todo
- Matrix-stiffnessอิสระเทียบreactionสองช่วง **12กรณีตรงกัน**
- JSONSchema positive8ไฟล์ผ่าน / negative8mutationsถูกreject
- ตรวจTypeScript **เฉพาะtypesในชุดนี้** strictผ่าน
- 6baselineJSONhashตรงกับต้นฉบับ
- เคยมีnewtestหนึ่งรายการอ้างfieldunitผิด แก้testใหม่ให้ตรงschemaแล้วรันซ้ำ เก็บlogรอบแรกไว้ ไม่แก้ค่าผู้ผลิตและไม่แตะprotectedtestของapp

ผลนี้ไม่ใช่93/93หรือ693กรณีของapp และไม่ได้พิสูจน์ว่าการเชื่อมต่อจริงผ่าน

### รันทวนได้โดยใช้เครื่องมือที่มีอยู่แล้ว
```sh
node --test tests/closure-core.test.mjs
tsc -p tsconfig.reference.json
python qa/verify_pack.py
```
Node testไม่ใช้npmdependenciesเพิ่มเติม Pythonscriptใช้jsonschemaและเรียกnode/tscที่ติดตั้งอยู่แล้ว หากเครื่องไม่มีเครื่องมือให้ขออนุญาตก่อนติดตั้ง ไม่แก้dependencyของappเอง
ไฟล์schemasไม่ใช่schemasสำหรับapproveddesign จงไม่ลบเงื่อนไขNO_GOเพื่อให้ข้อมูลpendingผ่านเป็นapproved

## ขอบเขตการส่งมอบ
**พร้อม:** ข้อมูลอ้างอิงแบบเครื่องอ่านได้,adapterreference,tests,รายการinputและprompt
**ยังรอ:** ตรวจ/applyในapp,full-suitegreen,อุปกรณ์จริง/configurationratings,ดิน/พื้น/youngslab/SLSbasis,rulepackreview,Owner/engineeracceptance
**Construction Release: NO_GO**
