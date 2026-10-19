import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GlobalFonts,createCanvas,loadImage} from '@napi-rs/canvas';

const out=resolve('artifacts/project-example-drawings');await mkdir(out,{recursive:true});
GlobalFonts.registerFromPath('C:/Windows/Fonts/tahoma.ttf','Tahoma');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
  const {projectExample}=await server.ssrLoadModule('/src/domain/mockProject.ts');
  const {documentView,freezeDesign}=await server.ssrLoadModule('/src/domain/workflowV07/snapshot.ts');
  const {installationSheets}=await server.ssrLoadModule('/src/drawing/workflowInstallation.tsx');
  const {Sheet}=await server.ssrLoadModule('/src/drawing/primitives.tsx');
  const project=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')).project:projectExample();
  const manifest=[],svgs=[];
  for(const c of project.cases){
    const model=c.workflowV07.model,view=await documentView(await freezeDesign(model),model),prefix=`EX-${c.name.match(/ · ([FCWBS]0[12]) · /)?.[1]??c.id.slice(0,8)}`;
    const sheets=installationSheets(view,prefix);
    for(const [i,s] of sheets.entries()){
      const info={company:'CMG ENGINEERING & CONSTRUCTION',project:project.name,code:project.code,caseName:c.name.replace(/^Project Example · /,'').replace(/ · MOCK-UP$/,''),elementLabel:'รายละเอียดติดตั้งตัวอย่าง',...c.titleBlock};
      const svg=renderToStaticMarkup(React.createElement(Sheet,{no:i+1,total:sheets.length,code:s.code,title:s.title,info},s.body));svgs.push(svg);
      if(/EX-(F02|C01|W02|B01|S02)-(01|02|03)$/.test(s.code)){
        const image=await loadImage(Buffer.from(svg.replace('width="420mm"','width="1680"').replace('height="297mm"','height="1188"').replace(/font-family="[^"]*"/g,'font-family="Tahoma"')));
        const canvas=createCanvas(1680,1188);canvas.getContext('2d').drawImage(image,0,0,1680,1188);await writeFile(join(out,s.code+'.png'),canvas.toBuffer('image/png'));
      }
      manifest.push({case:c.name,sheet:s.code,title:s.title,revision:model.revisionId,inputHash:view.inputHash});
    }
  }
  const html=`<!doctype html><html lang="th"><meta charset="utf-8"><title>Project Example · แบบติดตั้งตัวอย่าง</title><style>body{margin:0;background:#e5e7eb;font-family:Tahoma,Arial,sans-serif}.a3-sheet{display:block;width:420mm;height:297mm;margin:10mm auto;background:#fff}@page{size:A3 landscape;margin:0}@media print{body{background:#fff}.a3-sheet{margin:0;break-after:page}.a3-sheet:last-child{break-after:auto}}</style><body>${svgs.join('\n')}</body></html>`;
  await writeFile(join(out,'Project-Example-Drawings-A3.html'),html);await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(`Rendered ${project.cases.length} cases / ${manifest.length} sheets to ${out}`);
}finally{await server.close();}
