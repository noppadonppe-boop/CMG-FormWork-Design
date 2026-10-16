// Allow long reasoning runs while keeping time for preparation and persistence.
export const AI_PROVIDER_TIMEOUT_MS = 300_000;
export const AI_FUNCTION_TIMEOUT_SECONDS = 360;
export const AI_CLIENT_TIMEOUT_MS = 370_000;

export const AI_STEPS = [
  {id: 'connecting', label: 'เชื่อมต่อบริการ AI'},
  {id: 'authorizing', label: 'ตรวจสอบบัญชีและสิทธิ์โครงการ'},
  {id: 'preparing', label: 'ตรวจไฟล์และเตรียมภาพกับ Prompt'},
  {id: 'analyzing', label: 'ส่งให้ AI อ่านแบบ · รอคำตอบ'},
  {id: 'validating', label: 'ตรวจรูปแบบและมิติที่ AI ส่งกลับ'},
  {id: 'saving', label: 'บันทึกผลวิเคราะห์ลง Cloud'},
  {id: 'complete', label: 'เสร็จแล้ว · พร้อมตรวจผล'},
] as const;
export type AiStage = typeof AI_STEPS[number]['id'];
export function isAiStage(value: unknown): value is AiStage {
  return AI_STEPS.some(step => step.id === value);
}
