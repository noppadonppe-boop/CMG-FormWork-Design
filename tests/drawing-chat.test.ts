import {describe, expect, it} from 'vitest';
import {validateChatReply} from '../src/drawingChat';
describe('AI attachment validation', () => {
  it.each(['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/png', 'video/mp4'])('supports %s', mimeType => {
    expect(validateChatReply({text: '', attachments: [{name: 'result', url: 'https://example.com/result', mimeType}]}).attachments).toHaveLength(1);
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'http://example.com/file', 'https://user:secret@example.com/file'])('rejects unsafe URL %s', url => {
    expect(() => validateChatReply({text: 'result', attachments: [{name: 'result', url, mimeType: 'application/pdf'}]})).toThrow();
  });
  it('rejects empty replies and active HTML attachments', () => {
    expect(() => validateChatReply({text: '', attachments: []})).toThrow();
    expect(() => validateChatReply({text: 'result', attachments: [{name: 'result', url: 'https://example.com/file', mimeType: 'text/html'}]})).toThrow();
  });
});
