import {writeFile} from 'node:fs/promises';
import {createServer} from 'vite';

// Reuse Vite's raw-reference loader; no browser, Firebase connection, or new dependency.
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {projectExample}=await server.ssrLoadModule('/src/domain/mockProject.ts');
  let n=0;
  const project=projectExample('PROJECT-EXAMPLE-001',()=>`PROJECT-EXAMPLE-${++n}`);
  project.id='PROJECT-EXAMPLE-001';
  const output=JSON.stringify({schemaVersion:3,app:'CMG Formwork cloud trial',project},null,2)+'\n';
  await writeFile(new URL('../examples/Project-Example-v0.7.json',import.meta.url),output);
  console.log(`Generated Project Example: ${project.cases.length} cases, ${Buffer.byteLength(output)} bytes`);
} finally {await server.close();}
