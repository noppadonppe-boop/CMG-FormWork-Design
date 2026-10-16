# Full-suite blocker — รักษาข้อห้ามของ Owner

## สิ่งที่ทราบจากรายงานที่ส่งมา
Focused93/93; full688/693,5failures,8unhandled. รายงานชี้ที่token `rejecnืt` ใน tests/source-upload.test.tsx:21 และบอกว่าOwnerสั่งเก็บไฟล์นั้น
ยังไม่ได้อ่านcode/logจริง จึงไม่ยืนยันว่าเป็นสาเหตุเดียวของทุกfailure

## รอบนี้
OWNER_DECISIONS.json ตั้ง test_typo_fix.allowed=false; ไม่แก้ไฟล์protected ไม่สร้างshimaliasหรือtesttransformแก้ระหว่างรัน ไม่skip/exclude ไม่ปรับassertionsหรือปิดexception
Codexอ่านไฟล์และerrortracesเพื่อเสนอminimaldiffได้ แต่ยังไม่applyในไฟล์protected
แม้testsใหม่ผ่านทุกกรณี full-suiteเดิมยังไม่ใช่GREEN จนมีหลักฐานรันเต็มใหม่จริง

## ข้อความอนุมัติเจาะจงที่ Owner ใช้ได้เมื่อพร้อม
> อนุมัติให้แก้เฉพาะ identifier ที่พิมพ์ผิดใน tests/source-upload.test.tsx หลังตรวจ callback จริง โดยคง assertions และขอบเขตทดสอบเดิม แล้วรัน focused/full suite ใหม่ ห้ามข้าม tests หรือซ่อน errors และยังคงข้อห้ามแก้ AGENTS.md กับ Ringlock reference JSON เดิม

ข้อความนี้เป็นแบบร่างคำอนุมัติ ไม่ถือว่า Owner ได้อนุมัติเพราะมีอยู่ในไฟล์
หากcodeจริงเปลี่ยนแล้ว/จำนวนerrorไม่ตรง หยุดทบทวนbaselineก่อนเสนอpatch ไม่blind replaceglobal
เมื่อได้รับอนุมัติและแก้แล้ว เก็บbefore/afterhash/minimaldiff/errortraces/testcommands/newresultsแยกจากreportเก่า

## สถานะปิดงาน
- งานข้อมูล/adapterอาจพร้อมส่งมอบ แต่full-suiteยัง RED/KNOWN_BLOCKED_NOT_GREEN
- ห้ามอ้าง alltests ผ่านจากผลfocusedหรือartifacthelperของpackนี้
- การยอมรับknownissueของOwnerไม่ใช่การเปลี่ยนfailedtestให้กลายเป็นpass
