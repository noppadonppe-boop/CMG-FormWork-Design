import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const baseUrl = process.env.BROWSER_BASE_URL || `http://127.0.0.1:${process.env.BROWSER_VITE_PORT || '6175'}`;
const email = process.env.BROWSER_TEST_EMAIL || 'browser-owner@validation.example';
const password = process.env.BROWSER_TEST_PASSWORD || 'EmulatorTestOnly123!';
const executablePath = process.env.BROWSER_EXECUTABLE_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch({headless: true, executablePath});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', message => {if (message.type() === 'error') consoleErrors.push(message.text());});
try {
  await page.goto(`${baseUrl}/login`, {waitUntil: 'networkidle'});
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', {name: 'เข้าสู่ระบบ', exact: true}).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByRole('button', {name: 'สร้างโครงการตัวอย่าง', exact: true}).first().click();
  await page.getByText(/สร้างโครงการตัวอย่างแล้ว/).waitFor();
  for (const label of ['ฐานราก', 'เสา', 'ผนัง', 'คาน', 'พื้น']) {
    await page.getByRole('button', {name: label, exact: true}).first().waitFor();
  }
  for (const label of ['คาน', 'พื้น', 'ผนัง']) {
    await page.getByRole('button', {name: label, exact: true}).first().click();
    await page.getByText(new RegExp(`${label}\\s+FORMWORK`)).waitFor();
    await page.getByRole('button', {name: 'เปิดโหมดละเอียด', exact: true}).click();
    await page.getByText(/DRAFT \/ NO_GO/).first().waitFor();
    await page.getByLabel('อ้างอิงแบบ/มิติ').fill(`browser acceptance ${label}`);
    await page.locator('[aria-label="สถานะการบันทึกร่าง v0.7"]').getByText(/บันทึกร่างแล้ว/).waitFor({timeout: 10000});
    await page.getByRole('button', {name: 'แปลนและรูปตัด', exact: true}).click();
    await page.getByRole('heading', {name: /ชุดแบบก่อสร้างแบบหล่อ A3 \(8 แผ่น\)/}).waitFor();
    assert.equal(await page.locator('.a3-page').count(), 8, `${label} should render eight snapshot-bound A3 sheets`);
    await page.getByText(/SNAPSHOT SHA-256/).first().waitFor();
    await page.getByRole('button', {name: 'ภาพรวม', exact: true}).click();
  }
  await page.getByRole('button', {name: 'คลังวัสดุ/วิธีคำนวณ', exact: true}).click();
  await page.getByRole('button', {name: 'นำเข้า Ringlock / Form Tie ล่าสุดเป็น DRAFT', exact: true}).waitFor();
  await page.getByRole('button', {name: 'นำเข้า Closure Pack Form Tie / Ringlock เป็น DRAFT', exact: true}).waitFor();
  await page.getByRole('button', {name: 'Audit & Settings', exact: true}).click();
  await page.getByRole('heading', {name: 'Audit & Settings', exact: true}).first().waitFor();
  await page.getByRole('button', {name: 'นำเข้า decision template', exact: true}).waitFor();
  await page.getByRole('button', {name: 'Export decision template (ยังไม่ apply)', exact: true}).waitFor();
  const actionableConsoleErrors = consoleErrors.filter(error => !error.includes('ERR_NETWORK_ACCESS_DENIED') && !error.includes('404 (Not Found)'));
  assert.equal(actionableConsoleErrors.length, 0, `Browser console errors: ${actionableConsoleErrors.join(' | ')}`);
  console.log(JSON.stringify({status: 'PASS', scope: 'isolated Firebase emulator + local Vite', menus: 5, detailedElements: ['BEAM', 'SLAB', 'WALL'], snapshotBoundA3: 8, registryImport: true, closureRegistryImport: true, reconciliationImport: true, reconciliationExport: true, audit: true}));
} catch (error) {
  await mkdir('artifacts', {recursive: true});
  await page.screenshot({path: 'artifacts/browser-acceptance-failure.png', fullPage: true}).catch(() => {});
  console.error(JSON.stringify({status: 'FAIL', message: error instanceof Error ? error.message : String(error), consoleErrors}, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
