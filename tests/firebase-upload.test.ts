import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

type TestTask = {
  progress: (value: {bytesTransferred: number; totalBytes: number}) => void;
  error: (error: unknown) => void;
  complete: () => void;
  cancel: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
};
const mocks = vi.hoisted(() => ({
  auth: {currentUser: {uid: 'staff-uid'} as {uid: string} | null},
  storage: {maxUploadRetryTime: 0, maxOperationRetryTime: 0},
  tasks: [] as TestTask[],
  upload: vi.fn(),
  setDoc: vi.fn(),
  recordGet: vi.fn(),
  deleteDoc: vi.fn(),
  deleteObject: vi.fn(),
  callable: vi.fn(),
  extract: vi.fn(),
  stream: vi.fn(),
}));

vi.mock('firebase/app', async importOriginal => ({...await importOriginal<typeof import('firebase/app')>(), getApps: () => [], initializeApp: () => ({})}));
vi.mock('firebase/auth', async importOriginal => ({...await importOriginal<typeof import('firebase/auth')>(), getAuth: () => mocks.auth}));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  getFirestore: () => ({}),
  doc: (_db: unknown, ...segments: string[]) => ({path: segments.join('/')}),
  setDoc: mocks.setDoc,
  getDoc: mocks.recordGet,
  deleteDoc: mocks.deleteDoc,
  serverTimestamp: () => 'server-time',
}));
vi.mock('firebase/functions', async importOriginal => ({...await importOriginal<typeof import('firebase/functions')>(), getFunctions: () => ({}), httpsCallable: mocks.callable}));
vi.mock('firebase/storage', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/storage')>(),
  getStorage: () => mocks.storage,
  ref: (_storage: unknown, path: string) => ({path}),
  uploadBytesResumable: mocks.upload,
  deleteObject: mocks.deleteObject,
}));

let firebase: typeof import('../src/firebase');
const page = () => new File([new Uint8Array(4)], 'page.png', {type: 'image/png'});
function failure(code: string, message = code) {return Object.assign(new Error(message), {code});}

beforeAll(async () => {
  vi.stubEnv('VITE_FIREBASE_ENABLED', 'true');
  vi.stubEnv('VITE_FIREBASE_USE_EMULATORS', 'false');
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app');
  vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test-project.firebasestorage.app');
  firebase = await import('../src/firebase');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.tasks.length = 0;
  mocks.auth.currentUser = {uid: 'staff-uid'};
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.recordGet.mockResolvedValue({exists: () => true, data: () => ({projectId: 'p1', path: 'RC-FormWork-App/root/uploads/upload-1', originalPath: null})});
  mocks.deleteDoc.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.callable.mockReturnValue(mocks.extract);
  Object.assign(mocks.extract, {stream: mocks.stream});
  mocks.upload.mockImplementation(() => {
    const task = {cancel: vi.fn(), unsubscribe: vi.fn()} as unknown as TestTask;
    mocks.tasks.push(task);
    return {
      cancel: task.cancel,
      on: (_event: string, progress: TestTask['progress'], error: TestTask['error'], complete: TestTask['complete']) => {
        Object.assign(task, {progress, error, complete});
        return task.unsubscribe;
      },
    };
  });
});
afterEach(() => vi.useRealTimers());

describe('Firebase source upload', () => {
  it('uploads the selected image and records its project scope without fetching a download URL', async () => {
    const onProgress = vi.fn();
    const file = page();
    const pending = firebase.uploadSource('p1', file, 'c1', undefined, {onProgress});
    mocks.tasks[0].progress({bytesTransferred: 2, totalBytes: 4});
    expect(onProgress).toHaveBeenLastCalledWith(50);
    mocks.tasks[0].complete();
    const result = await pending;

    expect(result).toEqual({path: expect.stringMatching(/^RC-FormWork-App\/root\/uploads\/[a-f0-9-]+$/), originalPath: null});
    expect(mocks.upload).toHaveBeenCalledWith({path: result.path}, file, {contentType: 'image/png', customMetadata: {projectId: 'p1', caseId: 'c1'}});
    expect(mocks.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({projectId: 'p1', caseId: 'c1', path: result.path, originalPath: null}), {merge: false});
    expect(mocks.storage.maxUploadRetryTime).toBeLessThanOrEqual(15_000);
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(mocks.tasks[0].unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.tasks[0].cancel).not.toHaveBeenCalled();
  });

  it('uploads a PDF original separately and weights progress by both file sizes', async () => {
    const onProgress = vi.fn();
    const original = new File([new Uint8Array(12)], 'drawing.pdf', {type: 'application/pdf'});
    const pending = firebase.uploadSource('p1', page(), 'c1', original, {onProgress});
    mocks.tasks[0].progress({bytesTransferred: 4, totalBytes: 4});
    expect(onProgress).toHaveBeenLastCalledWith(25);
    mocks.tasks[0].complete();
    await vi.advanceTimersByTimeAsync(0);
    mocks.tasks[1].progress({bytesTransferred: 6, totalBytes: 12});
    expect(onProgress).toHaveBeenLastCalledWith(62.5);
    mocks.tasks[1].complete();
    const result = await pending;

    expect(result.originalPath).toBe(`${result.path}-original`);
    expect(mocks.upload.mock.calls[1][1]).toBe(original);
    expect(mocks.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({originalPath: result.originalPath, originalFilename: 'drawing.pdf'}), {merge: false});
  });

  it('cancels a transfer and ignores late callbacks when the source is replaced', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    const pending = firebase.uploadSource('p1', page(), undefined, undefined, {signal: controller.signal, onProgress});
    const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    controller.abort();
    await rejected;
    const calls = onProgress.mock.calls.length;
    mocks.tasks[0].progress({bytesTransferred: 4, totalBytes: 4});
    mocks.tasks[0].complete();
    expect(onProgress).toHaveBeenCalledTimes(calls);
    expect(mocks.tasks[0].cancel).toHaveBeenCalledOnce();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('does not start a transfer for an already canceled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(firebase.uploadSource('p1', page(), undefined, undefined, {signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('ends stalled uploads after 60 seconds and cancels the underlying request', async () => {
    const pending = firebase.uploadSource('p1', page());
    const rejected = expect(pending).rejects.toThrow('60 วินาที');
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(mocks.tasks[0].cancel).toHaveBeenCalledOnce();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('ends an offline metadata wait instead of leaving upload pending forever', async () => {
    mocks.setDoc.mockReturnValue(new Promise(() => {}));
    const pending = firebase.uploadSource('p1', page());
    const rejected = expect(pending).rejects.toThrow('บันทึกข้อมูลไฟล์ไม่สำเร็จ');
    mocks.tasks[0].complete();
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
  });

  it.each([
    ['storage/retry-limit-exceeded', 'เปิดใช้งาน Firebase Storage'],
    ['storage/bucket-not-found', 'ชื่อ bucket'],
    ['storage/unauthorized', 'ไม่มีสิทธิ์'],
    ['storage/quota-exceeded', 'โควตา'],
  ])('reports an actionable error for %s', async (code, message) => {
    const pending = firebase.uploadSource('p1', page());
    const rejected = expect(pending).rejects.toThrow(message);
    mocks.tasks[0].error(failure(code));
    await rejected;
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('validates selected image and original before starting either upload', async () => {
    await expect(firebase.uploadSource('p1', new File(['pdf'], 'drawing.pdf', {type: 'application/pdf'}))).rejects.toThrow('5 MB');
    await expect(firebase.uploadSource('p1', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {type: 'image/png'}))).rejects.toThrow('5 MB');
    await expect(firebase.uploadSource('p1', page(), undefined, new File(['script'], 'script.html', {type: 'text/html'}))).rejects.toThrow('20 MB');
    await expect(firebase.uploadSource('p1', page(), undefined, new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.pdf', {type: 'application/pdf'}))).rejects.toThrow('20 MB');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('Firebase AI extraction', () => {
  it('reports server stages and returns the final result without making a second call', async () => {
    mocks.stream.mockResolvedValue({stream: (async function* () {yield {stage: 'authorizing'}; yield {stage: 'analyzing'}; yield {stage: 'not-real'}; yield {stage: 'saving'};})(), data: Promise.resolve({draft: {width: 1200}})});
    const progress = vi.fn();
    await expect(firebase.aiExtract('p1', 'path', progress)).resolves.toEqual({draft: {width: 1200}});
    expect(progress.mock.calls.flat()).toEqual(['connecting', 'authorizing', 'analyzing', 'saving']);
    expect(mocks.stream).toHaveBeenCalledWith({projectId: 'p1', path: 'path'}, {signal: expect.any(AbortSignal)});
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it('propagates streaming errors without retrying the AI request', async () => {
    mocks.stream.mockRejectedValue(failure('functions/permission-denied', 'Project is not assigned to this user'));
    await expect(firebase.aiExtract('p1', 'path', vi.fn())).rejects.toThrow('Assign Project');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it('aborts a stalled stream at the client deadline', async () => {
    mocks.stream.mockImplementation((_data, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = firebase.aiExtract('p1', 'path', vi.fn());
    const rejected = expect(pending).rejects.toThrow('เกินกำหนด');
    await vi.advanceTimersByTimeAsync(190_000);
    expect(mocks.stream.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(180_000);
    await rejected;
  });
  it('explains the provider-specific deadline without implying a permission failure', async () => {
    mocks.extract.mockRejectedValue(Object.assign(failure('functions/deadline-exceeded'), {details: {reason: 'AI_PROVIDER_TIMEOUT', timeoutSeconds: 300}}));
    await expect(firebase.aiExtract('p1', 'path')).rejects.toThrow('5 นาที');
  });
  it('allows the 360-second server execution to finish and returns its draft', async () => {
    mocks.extract.mockResolvedValue({data: {draft: {width: 1200}}});
    await expect(firebase.aiExtract('p1', 'path')).resolves.toEqual({draft: {width: 1200}});
    expect(mocks.callable).toHaveBeenCalledWith(expect.anything(), 'extractGeometry', {timeout: 370_000});
    expect(mocks.extract).toHaveBeenCalledWith({projectId: 'p1', path: 'path'});
  });

  it.each([
    ['functions/permission-denied', 'Invalid source scope', 'พาธไฟล์'],
    ['functions/permission-denied', 'File does not belong to this project', 'ข้อมูลไฟล์ไม่ตรง'],
    ['functions/permission-denied', 'User profile not found', 'ไม่พบโปรไฟล์'],
    ['functions/permission-denied', 'User profile does not match the signed-in account', 'ข้อมูลบัญชีไม่ตรง'],
    ['functions/permission-denied', 'Project is not assigned to this user', 'Assign Project'],
    ['functions/failed-precondition', 'AI_PROVIDER_NOT_CONFIGURED', 'ยังไม่ได้เปิดใช้งาน AI'],
    ['functions/not-found', 'not found', 'extractGeometry'],
    ['functions/not-found', 'Project not found', 'บันทึกโครงการ'],
    ['functions/internal', 'internal', 'Cloud Functions'],
    ['functions/deadline-exceeded', 'timeout', 'เกินกำหนด'],
  ])('explains %s and leaves the uploaded source available for retry', async (code, serverMessage, expected) => {
    mocks.extract.mockRejectedValue(failure(code, serverMessage));
    await expect(firebase.aiExtract('p1', 'path')).rejects.toThrow(expected);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('AI prompt settings persistence', () => {
  const providers = {openai: {model: 'custom-vision'}, google: {model: 'custom-vision'}, anthropic: {model: 'custom-vision'}};
  it('saves and reads a multiline prompt while preserving the existing API key', async () => {
    mocks.recordGet.mockResolvedValue({data: () => ({prompt: 'old', providers: {openai: {apiKey: 'existing-test-key'}}})});
    const prompt = 'อ่าน F01\nตอบภาษาไทย';
    const output = await firebase.saveAiSettings({activeProvider: 'openai', providers, prompt});
    expect(mocks.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({prompt, providers: expect.objectContaining({openai: expect.objectContaining({apiKey: 'existing-test-key'})})}));
    expect(output.prompt).toBe(prompt);
    expect(JSON.stringify(output)).not.toContain('existing-test-key');
  });
  it('preserves an omitted prompt and allows an explicit empty prompt', async () => {
    mocks.recordGet.mockResolvedValue({data: () => ({prompt: 'keep this'})});
    expect((await firebase.saveAiSettings({activeProvider: 'openai', providers})).prompt).toBe('keep this');
    expect((await firebase.saveAiSettings({activeProvider: 'openai', providers, prompt: ''})).prompt).toBe('');
  });
  it('rejects an oversized prompt before writing', async () => {
    await expect(firebase.saveAiSettings({activeProvider: 'openai', providers, prompt: 'x'.repeat(10001)})).rejects.toThrow('10,000');
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('Firebase source deletion', () => {
  it('deletes the Storage object and Firestore metadata directly with the project scope', async () => {
    await expect(firebase.deleteUpload('p1', 'upload-1')).resolves.toBeUndefined();
    expect(mocks.recordGet).toHaveBeenCalledWith({path: 'RC-FormWork-App/root/upload/upload-1'});
    expect(mocks.deleteObject).toHaveBeenCalledWith({path: 'RC-FormWork-App/root/uploads/upload-1'});
    expect(mocks.deleteDoc).toHaveBeenCalledWith({path: 'RC-FormWork-App/root/upload/upload-1'});
  });

  it.each([
    ['storage/unauthorized', 'ไม่มีสิทธิ์ลบไฟล์'],
    ['permission-denied', 'ไม่มีสิทธิ์ลบไฟล์'],
  ])('explains direct Firebase deletion failure %s', async (code, expected) => {
    mocks.deleteObject.mockRejectedValue(failure(code));
    await expect(firebase.deleteUpload('p1', 'upload-1')).rejects.toThrow(expected);
  });

  it('still removes Firestore metadata when a Storage object is already gone', async () => {
    mocks.deleteObject.mockRejectedValue(failure('storage/object-not-found'));
    await expect(firebase.deleteUpload('p1', 'upload-1')).resolves.toBeUndefined();
    expect(mocks.deleteDoc).toHaveBeenCalledWith({path: 'RC-FormWork-App/root/upload/upload-1'});
  });

  it('rejects missing or mismatched Firestore metadata before touching Storage', async () => {
    mocks.recordGet.mockResolvedValueOnce({exists: () => false});
    await expect(firebase.deleteUpload('p1', 'upload-1')).rejects.toThrow('ไม่พบข้อมูลไฟล์นี้ใน Firestore');
    expect(mocks.deleteObject).not.toHaveBeenCalled();

    mocks.recordGet.mockResolvedValueOnce({exists: () => true, data: () => ({projectId: 'p2', path: 'RC-FormWork-App/root/uploads/upload-1', originalPath: null})});
    await expect(firebase.deleteUpload('p1', 'upload-1')).rejects.toThrow('ไม่ตรงกับโครงการ');
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
