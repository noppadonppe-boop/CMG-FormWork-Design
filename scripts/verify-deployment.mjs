const baseUrl = process.argv[2] || process.env.RC_FORMWORK_URL || 'https://rc-formwork.web.app/';
const url = new URL(baseUrl);
const response = await fetch(url, {redirect: 'follow'});
const html = await response.text();
const checks = [
  ['HTTP 2xx', response.ok],
  ['CMG Formwork title', /<title>CMG Formwork Design<\/title>/i.test(html)],
  ['SPA entrypoint', /<div id="root"|<script[^>]+type="module"/i.test(html)],
];
const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
const styleMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/i);
let bundle = '';
let style = '';
if (scriptMatch) {
  const bundleResponse = await fetch(new URL(scriptMatch[1], response.url));
  bundle = await bundleResponse.text();
  const outputChunk = bundle.match(/assets\/(WorkflowV07Output-[A-Za-z0-9_-]+\.js)/)?.[1];
  if (outputChunk) {
    const outputResponse = await fetch(new URL(`/assets/${outputChunk}`, response.url));
    const output = await outputResponse.text();
    checks.push(['Workflow v0.7 A3 drawing chunk in deployed bundle', outputResponse.ok && ['GEOMETRY / OPPOSING FACE MAP', 'SOFFIT / SHORING PLAN', 'FRAME ELEVATION', 'BASE TO SUPPORT CONTACT', 'SNAPSHOT SHA-256', 'NOT FOR CONSTRUCTION'].every(label => output.includes(label))]);
  } else checks.push(['Workflow v0.7 A3 drawing chunk discoverable', false]);
  const panelChunk = bundle.match(/assets\/(WorkflowV07Panel-[A-Za-z0-9_-]+\.js)/)?.[1];
  if (panelChunk) {
    const panelResponse = await fetch(new URL(`/assets/${panelChunk}`, response.url));
    const panel = await panelResponse.text();
    checks.push(['Editable project evidence forms in deployed bundle', panelResponse.ok && [
      'ข้อมูลวิศวกรรมโครงการ', 'บันทึกร่างกับ Case นี้', 'ผูกกับ Revision ปัจจุบัน', 'นำเข้า JSON', 'ดาวน์โหลด JSON',
      'Ringlock และการค้ำยัน', 'ดิน ฐานราก และแผ่นรอง', 'พื้นคอนกรีตที่รองรับ', 'เกณฑ์การใช้งานและการโก่งตัว', 'ลำดับเทและอนุมัติแต่ละ Stage',
    ].every(label => panel.includes(label))]);
  } else checks.push(['Workflow v0.7 panel chunk discoverable', false]);
  checks.push(['Workflow element menus in deployed bundle', ['ฐานราก', 'เสา', 'ผนัง', 'คาน', 'พื้น'].every(label => bundle.includes(label))]);
  checks.push(['Connections menu in deployed bundle', bundle.includes('จุดต่อและค้ำยัน')]);
  checks.push(['Audit menu in deployed bundle', bundle.includes('Audit & Settings')]);
  checks.push(['Public Ringlock/Form Tie draft import in deployed bundle', bundle.includes('นำเข้า Ringlock / Form Tie ล่าสุดเป็น DRAFT')]);
  checks.push(['Closure Pack Form Tie/Ringlock draft import in deployed bundle', bundle.includes('นำเข้า Closure Pack Form Tie / Ringlock เป็น DRAFT')]);
  checks.push(['Case reconciliation import in deployed bundle', bundle.includes('นำเข้า decision template')]);
  checks.push(['Case reconciliation export in deployed bundle', bundle.includes('Export decision template (ยังไม่ apply)') && bundle.includes('applyToProduction')]);
  checks.push(['NO_GO release gate in deployed bundle', bundle.includes('NO_GO')]);
} else checks.push(['Workflow bundle discoverable', false]);
if (styleMatch) {
  const styleResponse = await fetch(new URL(styleMatch[1], response.url));
  style = await styleResponse.text();
  checks.push(['Sidebar scroll rule in deployed stylesheet', style.includes('aside{overflow-y:auto}')]);
} else checks.push(['Stylesheet discoverable', false]);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
console.log(`URL ${response.url}`);
console.log('Release identity: unavailable from the public hosting entrypoint; verify Firebase Hosting release history separately.');
if (!response.ok || checks.some(([, ok]) => !ok)) process.exitCode = 1;
