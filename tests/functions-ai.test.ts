import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({getUser:vi.fn(), doc:vi.fn(), set:vi.fn(), metadata:vi.fn(), download:vi.fn(), fetch:vi.fn(),where:vi.fn(),profiles:vi.fn()}));
vi.mock('firebase-admin/app', () => ({initializeApp:vi.fn()}));
vi.mock('firebase-admin/auth', () => ({getAuth:()=>({getUser:mocks.getUser})}));
vi.mock('firebase-admin/firestore', () => ({getFirestore:()=>({doc:mocks.doc,collection:()=>({where:mocks.where})}),FieldValue:{serverTimestamp:()=> 'server-time'}}));
vi.mock('firebase-admin/storage', () => ({getStorage:()=>({bucket:()=>({file:()=>({getMetadata:mocks.metadata,download:mocks.download})})})}));
import {extractGeometry, drawingChat} from '../functions/src/index';
import {defaults} from '../src/domain';

const draft = {shape:'RECTANGLE',width:1200,length:1500,height:null,armX:null,armY:null,unit:'mm',evidence:[],unknowns:['height']};
let profile: Record<string, unknown>;
const request = (token: Record<string,unknown> = {}) => ({auth:{uid:'user-1',token},data:{projectId:'p1',path:'RC-FormWork-App/root/uploads/file-1'}});
const run = (r = request()) => extractGeometry.run(r as Parameters<typeof extractGeometry.run>[0]);
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubGlobal('fetch',mocks.fetch);
  profile={uid:'user-1',email:'member@example.com',status:'approved',role:['Engineer'],assignedProjects:['p1']};
  mocks.where.mockReturnValue({limit:()=>({get:mocks.profiles})});
  mocks.profiles.mockResolvedValue({size:0,docs:[]});
  mocks.getUser.mockResolvedValue({uid:'user-1',email:'Member@example.com',disabled:false,providerData:[]});
  mocks.doc.mockImplementation((path:string)=>({set:mocks.set,get:async()=>({exists:true,data:()=>path.includes('/users/')?profile:path.endsWith('/settings/ai')?{activeProvider:'openai',providers:{openai:{apiKey:'test-only',model:'test-model'}}}:{}})}));
  mocks.metadata.mockResolvedValue([{contentType:'image/png',size:10,metadata:{projectId:'p1'}}]);
  mocks.download.mockResolvedValue([Buffer.from('test drawing')]);
  mocks.fetch.mockResolvedValue({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(draft)}]}]})});
});
afterEach(()=>vi.unstubAllGlobals());

describe('AI callable authorization and result persistence',()=>{
  it('reports provider timeout and never marks validation or saving as reached', async()=>{
    mocks.fetch.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    const sendChunk = vi.fn(async()=>true);
    const invoke = extractGeometry.run as unknown as (r: unknown, response: unknown) => Promise<unknown>;
    await expect(invoke({...request(),acceptsStreaming:true},{sendChunk})).rejects.toMatchObject({code:'deadline-exceeded', details:{reason:'AI_PROVIDER_TIMEOUT',timeoutSeconds:300}});
    expect(sendChunk.mock.calls.map(call=>call[0])).toEqual([{stage:'authorizing'},{stage:'preparing'},{stage:'analyzing'}]);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('gives the AI provider five minutes rather than the old 90-second limit', async()=>{
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      await run();
      expect(timeout).toHaveBeenCalledWith(300_000);
    } finally {timeout.mockRestore();}
  });
  it('streams stages in order and reports saving only after validating the provider response', async()=>{
    const sendChunk = vi.fn(async()=>true);
    const invoke = extractGeometry.run as unknown as (r: unknown, response: unknown) => Promise<unknown>;
    await invoke({...request(),acceptsStreaming:true},{sendChunk});
    expect(sendChunk.mock.calls.map(call=>call[0])).toEqual([
      {stage:'authorizing'},{stage:'preparing'},{stage:'analyzing'},{stage:'validating'},{stage:'saving'},
    ]);
    expect(mocks.set).toHaveBeenCalledOnce();
  });
  it('rejects unauthenticated calls without looking up profiles or sending images',async()=>{
    await expect(run({...request(),auth:undefined} as unknown as ReturnType<typeof request>)).rejects.toMatchObject({code:'unauthenticated'});
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('resolves a missing email claim from verified Firebase Auth UID and saves the result',async()=>{
    const result=await run();
    expect(mocks.getUser).toHaveBeenCalledWith('user-1');
    expect(mocks.doc).toHaveBeenCalledWith('RC-FormWork-App/root/users/member@example.com');
    expect(result).toMatchObject({draft,confirmed:false,createdBy:'user-1',provider:'OPENAI'});
    expect(mocks.set).toHaveBeenCalledWith({analysis:expect.objectContaining({draft,analyzedAt:'server-time'})},{merge:true});
  });
  it('uses the verified token email when available',async()=>{
    await run(request({email:'member@example.com'}));
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('resolves a legacy email-less Auth account by a unique verified profile UID',async()=>{
    mocks.getUser.mockResolvedValue({uid:'user-1',disabled:false});
    mocks.profiles.mockResolvedValue({size:1,docs:[{id:'member@example.com',data:()=>profile}]});
    await expect(run()).resolves.toMatchObject({draft,confirmed:false});
    expect(mocks.where).toHaveBeenCalledWith('uid','==','user-1');
  });
  it('rejects ambiguous UID profile mappings',async()=>{
    mocks.getUser.mockResolvedValue({uid:'user-1',disabled:false});
    mocks.profiles.mockResolvedValue({size:2,docs:[]});
    await expect(run()).rejects.toMatchObject({code:'permission-denied'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('requires matching profile document identity in the email-less fallback',async()=>{
    mocks.getUser.mockResolvedValue({uid:'user-1',disabled:false});
    mocks.profiles.mockResolvedValue({size:1,docs:[{id:'someone-else@example.com',data:()=>profile}]});
    await expect(run()).rejects.toMatchObject({code:'permission-denied'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    {disabled:true,email:'member@example.com'},
    {disabled:false,providerData:[]},
  ])('rejects disabled or email-less Firebase accounts',async account=>{
    mocks.getUser.mockResolvedValue(account);
    await expect(run()).rejects.toMatchObject({code:'permission-denied'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('does not let an email lookup authorize a different UID',async()=>{
    profile.uid='another-user';
    await expect(run()).rejects.toMatchObject({code:'permission-denied'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    {status:'pending'},
    {assignedProjects:[]},
    {projectPermissions:{p1:['view']}},
  ])('requires approved project edit access',async patch=>{
    Object.assign(profile,patch);
    await expect(run()).rejects.toMatchObject({code:'permission-denied'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects files from another project before sending to AI',async()=>{
    mocks.metadata.mockResolvedValue([{contentType:'image/png',size:10,metadata:{projectId:'p2'}}]);
    await expect(run()).rejects.toMatchObject({code:'permission-denied',message:'File does not belong to this project'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('persists validated element lists and rejects malformed ones',async()=>{
    const element={name:'F1',kind:'FOOTING',shape:'RECTANGLE',width:1.5,length:2,height:0.6,armX:null,armY:null,unit:'m',quantity:4,note:'แปลน'};
    mocks.fetch.mockResolvedValueOnce({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({...draft,elements:[element]})}]}]})});
    await expect(run()).resolves.toMatchObject({draft:{elements:[element]}});
    mocks.fetch.mockResolvedValueOnce({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({...draft,elements:[{...element,width:'big'}]})}]}]})});
    await expect(run()).rejects.toMatchObject({code:'data-loss'});
    expect(mocks.set).toHaveBeenCalledOnce();
  });
  it('does not persist invalid provider dimensions',async()=>{
    mocks.fetch.mockResolvedValue({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({...draft,width:-5})}]}]})});
    await expect(run()).rejects.toMatchObject({code:'data-loss'});
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe('drawing conversation', () => {
  const invoke = (data = {}) => drawingChat.run({...request(), data: {...request().data, messages: [{role: 'user', text: 'Clarify the width'}], ...data}} as Parameters<typeof drawingChat.run>[0]);
  it('uses the Admin model and selected drawing with conversation context', async () => {
    mocks.fetch.mockResolvedValue({ok: true, json: async () => ({output: [{content: [{type: 'output_text', text: JSON.stringify({text: 'Please confirm width', attachments: [{name: 'drawing.pdf', url: 'https://example.com/drawing.pdf', mimeType: 'application/pdf'}]})}]}]})});
    await expect(invoke()).resolves.toMatchObject({text: 'Please confirm width', model: 'test-model', attachments: [{name: 'drawing.pdf'}]});
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.model).toBe('test-model');
    expect(body.input[1].content[0].type).toBe('input_image');
    expect(body.input[1].content[1].text).toContain('Clarify the width');
    expect(body.text.format.name).toBe('drawing_chat');
  });
  it('rejects unassigned projects before calling the provider', async () => {
    profile.assignedProjects = [];
    await expect(invoke()).rejects.toMatchObject({code: 'permission-denied'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects a drawing owned by another project', async () => {
    mocks.metadata.mockResolvedValue([{contentType: 'image/png', size: 10, metadata: {projectId: 'p2'}}]);
    await expect(invoke()).rejects.toMatchObject({code: 'permission-denied'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('sends the current formwork model and returns validated model edits', async () => {
    mocks.fetch.mockResolvedValue({ok: true, json: async () => ({output: [{content: [{type: 'output_text', text: JSON.stringify({text: 'ปรับความลึกแล้ว', attachments: [], changes: [{field: 'height', value: 1200}]})}]}]})});
    await expect(invoke({model: {...defaults, height: 800}})).resolves.toMatchObject({changes: [{field: 'height', value: 1200}]});
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.input[1].content[1].text).toContain('Current formwork model');
    expect(body.input[1].content[1].text).toContain('"height":[800');
    expect(body.text.format.schema.required).toContain('changes');
  });
  it('gives the AI the recalculated optimizer options for the current model and stock', async () => {
    mocks.fetch.mockResolvedValue({ok: true, json: async () => ({output: [{content: [{type: 'output_text', text: JSON.stringify({text: 'ok', attachments: [], changes: []})}]}]})});
    await invoke({model: defaults, stockIds: ['PAP-TIS107-RHS-100x50x3.2', 'unknown']});
    const prompt = JSON.parse(mocks.fetch.mock.calls[0][1].body).input[1].content[1].text as string;
    expect(prompt).toContain('Deterministic optimizer results');
    const brief = JSON.parse(prompt.split('options lightest steel first): ')[1].split(String.fromCharCode(10))[0]);
    expect(brief.advice.map((a: {check: string}) => a.check)).toEqual(['ply-b', 'ply-v', 'ply-d']);
    expect(brief.options.length).toBeGreaterThan(0);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).input[0].content[0].text).toContain('recommend one of the supplied optimizer options');
  });
  it('rejects malformed section stock', async () => {
    await expect(invoke({model: defaults, stockIds: 'all'})).rejects.toMatchObject({code: 'invalid-argument'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects an invalid formwork model before calling the provider', async () => {
    await expect(invoke({model: {...defaults, width: -1}})).rejects.toMatchObject({code: 'invalid-argument'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects provider edits to unsupported fields', async () => {
    mocks.fetch.mockResolvedValue({ok: true, json: async () => ({output: [{content: [{type: 'output_text', text: JSON.stringify({text: 'x', attachments: [], changes: [{field: 'owner', value: 'x'}]})}]}]})});
    await expect(invoke()).rejects.toBeDefined();
  });
  it('rejects excessive conversation input', async () => {
    await expect(invoke({messages: [{role: 'user', text: 'a'.repeat(6001)}]})).rejects.toMatchObject({code: 'invalid-argument'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
