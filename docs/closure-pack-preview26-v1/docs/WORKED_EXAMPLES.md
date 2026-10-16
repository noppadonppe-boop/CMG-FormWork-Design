# ตัวอย่างสังเคราะห์สำหรับทวนเลขคณิต — ไม่ใช่แบบใช้ก่อสร้าง

## 1. แรงในไทร์จากคานรัดสองช่วง
สมมติคานต่อเนื่องสองช่วงเท่ากัน L=0.60m, EIคงที่, ไม่มีsupport settlement/overhang, w=32.4kN/mเท่ากันเต็มทั้งสองช่วง
Rend=3wL/8=7.29kN; Rmiddle=5wL/4=24.30kN; loadรวม=38.88kN
สมดุล2(7.29)+24.30=38.88
ค่าwL=19.44kNต่ำกว่าRmiddleในกรณีนี้ จึงไม่ใช้tributaryareaเป็นขอบเขตปลอดภัยทุกกรณี
เทียบกับreferenceSeparator21kNจะได้24.3/21=1.1571 แต่ยังไม่ใช่ผลทั้งชุด ไม่มีการเลือกผลิตภัณฑ์ให้โครงการ

## 2. พื้นที่รับแรงดึงไม่ใช่พื้นที่จากชื่อเกลียว
N=24.3kN และAt=50.3mm²ในตัวอย่างreference -> sigma=1000(24.3)/50.3=483.1014MPa
นี่เป็นstressindicator ไม่ใช่เทียบFyของอุปกรณ์โดยเดา ไม่บอกว่าชิ้นส่วนอนุมัติหรือกำลังประลัยเท่าไร

## 3. การแบ่งแรงของแผ่นคร่อมราง
สมมติแผ่นrigid,สองsupportlinesห่าง100mm,แรงN=20kNอยู่เยื้องศูนย์20mm
Rleft=20(0.5-20/100)=6kN; Rright=14kN; rodรับ20kNเต็ม
ยังไม่ได้ตรวจplatebending/contactwidth/webcrippling และไม่ใช้2Iหรือ2Sของรางโดยไม่มีbuilt-upmodel

## 4. Contact pressure — แยกกรณีpartialcontact
สมมติfootprintสี่เหลี่ยมrigid0.4×0.5mไม่มีรู,N=20kNcompression,Mx=1kNm,My=0
A=0.2m²;qเฉลี่ย=100kPa; qmin=40kPa,qmax=160kPa ตามแกนpressureconventionที่กำหนด
เปลี่ยนMx=3kNmได้qmin=-80kPa,qmax=280kPaจากfullcontacttrial ซึ่งใช้เป็นactualpressureต่อไม่ได้ ต้องแก้contactmodelที่รับcompressionเท่านั้น ไม่clipnegativeแล้วสรุปปลอดภัย
ยังไม่มีqallow/settlementของดินจริง จึงไม่ได้ตรวจbearingcapacity

## 5. Serviceability และpunching
ตัวอย่างเลือกเกณฑ์สังเคราะห์ L=1200mm,relative240,absolute3mm -> limit=min(5,3)=3mm
แสดงเพียงวิธีเทียบสองเกณฑ์ที่กำหนด ไม่ประกาศให้ทุกงานใช้3mmหรือL/240
ตัวอย่างV=20kN,b0=1000mm,d=150mm -> vavg=0.133333MPa เป็นaveragepunchingdemand; b0/dต้องคำนวณตามcode/geometryจริงก่อน ไม่มีVc/φVc/VRdหรือPASSในhelper

## ขอบเขต verification
Nodeทดสอบข้อมูลและสมการนี้; Pythonในqaตรวจreactionสองช่วงโดยmatrixstiffnessแยกอีกวิธีเพื่อเทียบเลขคณิต ไม่มีgeneralframeanalysisหรือindependentengineersignoff
