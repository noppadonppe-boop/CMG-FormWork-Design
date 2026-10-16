# การทำ rule pack ให้เป็น engineer-reviewed จริง

สถานะ13helpersในชุดนี้คือทวนเลขคณิต/สัญญาข้อมูลออฟไลน์ ไม่ใช่อนุมัติสูตรออกแบบตามมาตรฐานทั้งชุด

ก่อนเปลี่ยนสถานะreviewของruleจริง ให้เก็บ:
1. RuleID/version/sourceedition/clauseและหลักฐานเข้าถึงต้นฉบับ ไม่ใช้ข้อความจากAIแทนข้อกำหนด
2. หน่วย พิกัด/เครื่องหมาย นิยามdemand/resistance/materialbasis ขอบเขตโหลด วิธีออกแบบและfactorที่รวมแล้ว
3. Assumptionsและunsupportedcases: contactpartial,rodangle,continuity,offcentre,joist/walerreactions,local/distortional/globalbuckling,wetplywood,stageและmanufacturerlimits
4. Benchmarkอิสระทั้งpositive/negative/boundary/regression มีinput/expected/output/toleranceและเหตุผล
5. Reviewerที่มีอำนาจ,revision/hash/stage/loadcaseที่acceptanceครอบคลุม,หลักฐานลายเซ็น/การอนุมัติจากbackendที่เชื่อถือได้
6. Coverage: ทุกmember/loadcase/requiredcheckมีผลที่ไม่stale; N/Aมีเหตุผลและหลักฐาน; emptychecksไม่ผ่าน

การทดสอบhelperหรือschemaผ่านไม่ตรวจความถูกต้องของsoilbearing/punching/jointstiffness/globalringlockเอง ไม่ให้browserstring/JSONhashที่clientส่งมาแทนtrustedverification

ใช้13referencehelpersเป็นunitbenchmarkของadapterได้ แต่ก่อนให้มีEngineeringPASSต้องมีcapacityrule/interactionchecksและevidenceครบตามscopeจริง แยกsoftwaretestsออกจากengineeringacceptanceและconstructionrelease
