import fs from 'node:fs/promises';
import {Presentation,PresentationFile} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import {slides,roles} from './content.mjs';
const ROOT='D:/ZeroGap/.presentation-build';
const FONT='Microsoft JhengHei';
const C={navy:'#17333F',teal:'#087E82',ink:'#223D49',muted:'#566D76',light:'#EAF2F2',white:'#FFFFFF',rule:'#D6E2E5'};
const p=Presentation.create({slideSize:{width:1280,height:720}});
p.theme.defaultFont=FONT;
function tx(s,text,x,y,w,h,size=28,color=C.ink,bold=false,align='left'){
 const z=s.shapes.add({name:`text-${s.shapes.items.length+1}`,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 z.text=text; z.text.style={typeface:FONT,fontSize:size,color,bold,alignment:align,verticalAlignment:'top',insets:0,autoFit:'none',wrap:'square'};
 return z;
}
function base(d,i){
 const s=p.slides.add();s.background.fill=C.white;
 tx(s,d.title,72,59,1136,74,48,C.navy,true);
 tx(s,`${Math.floor(i/5)+1}  /  ${roles[Math.floor(i/5)]}`,72,662,1000,28,18,C.muted);
 tx(s,String(i+1).padStart(2,'0'),1136,656,72,36,23,C.muted,false,'right');
 if(d.takeaway)tx(s,d.takeaway,72,568,1136,50,27,C.teal,true);
 if(d.foot)tx(s,`※ ${d.foot}`,72,d.takeaway?619:594,1136,35,21,C.muted);
 return s;
}
function table(s,headers,rows,widths,y=180,rowH=66,fontSize=27){
 const vals=[headers,...rows],height=vals.length*rowH;
 const t=s.tables.add({rows:vals.length,columns:headers.length,left:72,top:y,width:1136,height,columnWidths:widths,values:vals});
 t.styleOptions={headerRow:false,bandedRows:false};
 t.borders.assign({fill:C.rule,width:1,style:'solid'});
 for(let r=0;r<vals.length;r++){
   t.rows[r].height=rowH;
   for(let c=0;c<headers.length;c++){
     const cell=t.getCell(r,c);cell.fill=r===0?C.navy:(r%2?C.white:'#F2F6F6');
     cell.text.style={typeface:FONT,fontSize:r===0?25:fontSize,bold:r===0||c===0,color:r===0?C.white:(c===0?C.navy:C.ink),verticalAlignment:'middle',insets:{left:18,right:15,top:10,bottom:10}};
   }
 }
 return t;
}
function split(s,d,y=193){
 const xs=[72,672],ws=[490,536];
 for(let i=0;i<2;i++){
   tx(s,i?d.rightTitle:d.leftTitle,xs[i],y,ws[i],54,33,C.teal,true);
   const list=i?d.right:d.left;
   list.forEach((v,j)=>tx(s,v,xs[i],y+84+j*100,ws[i],85,28));
 }
}
const refs=[
 'frontend/README.md; frontend/docs/導讀_06_改接後端v0.9.md',
 'app/planner.py; docs/backend-spec.md; docs/spec-discussion.md',
 'app/jev/client.py; app/planning/choose.py; app/config.py',
 'app/llm.py; app/judge.py; docs/spec-discussion.md'
];
for(let i=0;i<slides.length;i++){
 const d=slides[i],s=base(d,i);
 if(d.kind==='cover'){
   s.background.fill=C.navy;
   s.shapes.items.forEach(z=>{z.text.color=C.white;});
   s.shapes.items[0].text='ZeroGap';s.shapes.items[0].position={left:72,top:76,width:1100,height:115};s.shapes.items[0].text.fontSize=84;
   tx(s,'零空檔',76,205,1000,84,62,'#67DBCF',true);
   tx(s,d.subtitle,76,319,1128,62,38,C.white,true);
   tx(s,d.lead,76,394,1128,52,28,'#C8DBDF');
   d.rows.forEach((r,k)=>{tx(s,r[0],76+k*287,505,260,45,29,'#67DBCF',true);tx(s,k===3?'資料屬性判斷\n與候選代選':r[1],76+k*287,554,252,65,23,C.white);});
 }else if(d.kind==='rows'){
   if(d.lead)tx(s,d.lead,72,154,1136,50,29,C.muted);
   const start=d.lead?237:183;
   const gap=d.rows.length===5?70:81;
   d.rows.forEach((r,k)=>{tx(s,r[0],72,start+k*gap,228,50,29,C.teal,true);tx(s,r[1],314,start+k*gap,894,55,29);});
 }else if(d.kind==='split')split(s,d);
 else if(d.kind==='two'){
   tx(s,d.lead,72,157,1136,45,29,C.muted);split(s,d,244);
 }else if(d.kind==='flow'){
   d.rows.forEach((r,k)=>{tx(s,r[0],72,179+k*82,90,58,37,C.teal,true);tx(s,r[1],198,183+k*82,1010,60,31);});
 }else if(d.kind==='table')table(s,d.headers,d.rows,d.widths,178,d.rows.length===5?60:70,d.title==='錯誤處理與目前限制'?26:27);
 else if(d.kind==='question'){
   tx(s,d.lead,72,155,1136,50,29,C.muted);
   d.columns.forEach((col,k)=>{const x=72+k*396;tx(s,col[0],x,249,350,58,32,C.teal,true);col.slice(1).forEach((a,j)=>tx(s,a,x,335+j*70,350,68,28));});
 }else if(d.kind==='equation'){
   tx(s,d.lead,72,168,1136,54,32,C.teal,true);
   tx(s,'示意數值',72,267,1136,40,23,C.muted);
   tx(s,'0.70 × 0.60 = 0.42',72,319,1136,110,82,C.navy,true);
   tx(s,'電影 A',72,450,260,48,28,C.muted);
   tx(s,'餐廳 B',337,450,260,48,28,C.muted);
   tx(s,'組合排名分數',615,450,340,48,28,C.teal,true);
 }else if(d.kind==='threshold'){
   tx(s,'最高選項機率 < 0.6 → LLM 代選',72,165,1136,65,40,C.teal,true);
   table(s,d.headers,d.rows,d.widths,266,76,29);
   tx(s,'判斷依據：最高選項機率，非 confidence 欄位',72,535,1136,44,27,C.ink);
   tx(s,'門檻需依後續實測結果調整。',72,589,1136,42,26,C.muted);
 }else if(d.kind==='judgment'){
   table(s,d.headers,d.rows,d.widths,180,88,26);
   tx(s,'既有資料優先 → 模型補充屬性 → 限定回傳類別',72,489,1136,55,30,C.ink,true);
 }else if(d.kind==='output'){
   d.rows.forEach((r,k)=>{tx(s,r[0],72,183+k*68,65,48,30,C.teal,true);tx(s,r[1],158,183+k*68,650,55,29);});
   tx(s,'示意回傳',860,259,348,45,24,C.muted);
   tx(s,'{"choice": "r12"}',830,324,378,70,33,C.teal,true);
 }else if(d.kind==='closing'){
   table(s,d.headers,d.rows,d.widths,164,60,27);
   tx(s,'下一步',72,501,168,45,28,C.teal,true);
   tx(s,'完整串接驗證 → 共同案例檢查 → 記錄耗時與改善結果',240,501,968,48,27,C.ink);
 }
 let notes=`第 ${Math.floor(i/5)+1} 人：${roles[Math.floor(i/5)]}\n第 ${i+1} 頁：${d.title}\n建議講述時間：${d.seconds} 秒\n本段 5 頁共 4 分 40 秒，另留 20 秒交接或收尾。\n\n【講稿】\n${d.notes}`;
 if(d.transition)notes+=`\n\n【${i===19?'收尾':'交接'}｜約 20 秒】\n${d.transition}`;
 notes+=`\n\n【資料依據，無需口述】\n依本專題資料夾與團隊確認內容整理（2026-10-21）。\n${refs[Math.floor(i/5)]}\n進度以報告前最後一次確認為準。`;
 if(i===12||i===13||i===17)notes+='\n本頁數值或回傳範例為示意，不是正式服務實測結果。';
 s.speakerNotes.text=notes;
}
await fs.mkdir(`${ROOT}/renders`,{recursive:true});
await fs.writeFile(`${ROOT}/presentation.json`,JSON.stringify(p.toProto()));
for(let i=0;i<p.slides.items.length;i++){
 const s=p.slides.items[i];
 await fs.writeFile(`${ROOT}/renders/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await (await p.export({slide:s,format:'png',scale:1})).arrayBuffer()));
 await fs.writeFile(`${ROOT}/renders/slide-${String(i+1).padStart(2,'0')}.layout.json`,await (await s.export({format:'layout'})).text());
 console.log(`Rendered ${i+1}/20`);
}
await (await PresentationFile.exportPptx(p)).save(`${ROOT}/candidate.pptx`);
console.log('READY: candidate.pptx');
