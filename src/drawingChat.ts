import {parseModelChanges, type ModelChange} from './domain/scene.js';
export type ChatAttachment = {name: string; url: string; mimeType: string};
export type DrawingChatMessage = {role: 'user' | 'assistant'; text: string; attachments?: ChatAttachment[]; changes?: ModelChange[]};
export type DrawingChatReply = {text: string; attachments: ChatAttachment[]; changes: ModelChange[]; provider: string; model: string};

export function safeAttachmentUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function validateChatReply(value: unknown): {text: string; attachments: ChatAttachment[]; changes: ModelChange[]} {
  const reply = value as {text?: unknown; attachments?: unknown; changes?: unknown};
  if (!reply || typeof reply.text !== 'string' || reply.text.length > 40000 || !Array.isArray(reply.attachments) || reply.attachments.length > 10) throw Error('รูปแบบคำตอบ AI ไม่ถูกต้อง');
  const attachments = reply.attachments.map((item: ChatAttachment) => {
    if (!item || typeof item.name !== 'string' || item.name.length > 250 || typeof item.url !== 'string' || item.url.length > 8000 || !safeAttachmentUrl(item.url) || typeof item.mimeType !== 'string' || !/^(application\/(pdf|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation)|image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/.test(item.mimeType)) throw Error('ไฟล์ตอบกลับ AI ไม่ถูกต้องหรือไม่ใช่ลิงก์ HTTPS');
    return {name: item.name, url: item.url, mimeType: item.mimeType};
  });
  const changes = parseModelChanges(reply.changes);
  if (!reply.text.trim() && !attachments.length && !changes.length) throw Error('AI ส่งคำตอบว่าง');
  return {text: reply.text, attachments, changes};
}
