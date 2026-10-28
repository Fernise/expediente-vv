// Isolated localhost QA only: fictional users, a synthetic image, no real mail.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
for(const path of [".env",".env.local",".env.development",".dev.vars"]){const config=await readFile(new URL(`../${path}`,import.meta.url),"utf8").catch(()=>"");assert.ok(!/^GMAIL_OAUTH_(?:CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)\s*=\s*[^\s#]+/m.test(config),"Disable local Gmail before tests");}
const origin="http://localhost:3000";
const actor=()=>{const id=`dossier-qa-${crypto.randomUUID()}`;return {id,email:`${id}@example.invalid`};};
const admin=actor(),professional=actor(),owner=actor();let organizationId;
function headers(user){return {"oai-authenticated-user-id":user.id,"oai-authenticated-user-email":user.email,origin,...(organizationId?{cookie:`expediente-vv-active-organization=${organizationId}`}:{})};}
async function request(user,path,body,method="POST",extra={}){const response=await fetch(origin+path,{method,headers:{...headers(user),...(body instanceof FormData?{}:{"content-type":"application/json"}),...extra},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});const bytes=new Uint8Array(await response.arrayBuffer());const text=new TextDecoder().decode(bytes);let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,text,bytes};}
const space=await request(admin,"/api/organizations",{name:"QA expediente integral"});assert.equal(space.status,201,space.text);organizationId=space.data.organization.id;
const create=await request(admin,"/api/properties",{organizationId,alias:"VV-DEMO-INFORME",dataProfile:"pilot_anonymized",islandCode:"TF",municipality:"Santa Cruz de Tenerife",postalCode:"38001",ownerName:"Propietario 09",addressLine:"Calle Ejemplo 9",cadastralReference:"DEMO-009"});assert.equal(create.status,201,create.text);
const propertyId=create.data.property.id;
const path=`/api/properties/${propertyId}/checklist`;
const task={organizationId,title:"Comprobar evidencia de prueba",category:"Control documental",explanation:"Contrastar el archivo de prueba y documentar cualquier observación pendiente.",dueAt:"2027-01-15"};
const key=crypto.randomUUID();const added=await request(admin,path,task,"POST",{"idempotency-key":key});assert.equal(added.status,201,added.text);const itemId=added.data.item.id;
const replay=await request(admin,path,task,"POST",{"idempotency-key":key});assert.equal(replay.status,201,replay.text);assert.equal(replay.data.item.id,itemId);
const operationTask={...task,title:"Coordinación operativa ficticia",itemKind:"operational"};
const operation=await request(admin,path,operationTask);assert.equal(operation.status,201,operation.text);const operationId=operation.data.item.id;
const opPath=`${path}/${operationId}`;
assert.equal((await request(admin,opPath,{organizationId,status:"in_progress"},"PATCH")).status,200);
assert.equal((await request(admin,opPath,{organizationId,status:"completed"},"PATCH")).status,200);
assert.equal((await request(admin,opPath,{organizationId,status:"in_review"},"PATCH")).status,400);
assert.equal((await request(admin,opPath,{...operationTask,action:"edit",itemKind:"professional_requirement"},"PATCH")).status,400,"cannot reclassify completed task");
assert.equal((await request(admin,`${path}/${itemId}`,{organizationId,status:"completed"},"PATCH")).status,400,"professional requirement cannot be completed manually");
const reclassification=await request(admin,path,{...task,title:"Criterio pendiente reclasificable"});assert.equal(reclassification.status,201);
assert.equal((await request(admin,`${path}/${reclassification.data.item.id}`,{...task,title:"Criterio pendiente reclasificable",action:"edit",itemKind:"operational"},"PATCH")).status,200,"unused pending criteria may be reclassified");
assert.equal((await request(admin,path,task)).status,400,"duplicate title");
assert.equal((await request(admin,path,{...task,title:"Fecha imposible",dueAt:"2026-02-30"})).status,400);
assert.equal((await request(admin,`${path}/${itemId}`,{...task,action:"edit",title:"Evidencia documental revisable"},"PATCH")).status,200);
assert.equal((await request(admin,`${path}/${itemId}`,{organizationId,status:"in_review"},"PATCH")).status,400,"no evidence cannot be in review");
const temporary=await request(admin,path,{...task,title:"Tarea temporal sin evidencias"});assert.equal(temporary.status,201,temporary.text);
assert.equal((await request(admin,`${path}/${temporary.data.item.id}`,{organizationId},"DELETE")).status,200);
const page=await request(admin,`/app/properties/${propertyId}`,undefined,"GET");assert.ok(!page.text.includes("Tarea temporal sin evidencias"));assert.ok(page.text.includes("Evidencia documental revisable"));
for(const [user,role] of [[professional,"professional"],[owner,"owner"]]){const invitation=await request(admin,"/api/team/invitations",{organizationId,email:user.email,role,propertyIds:[propertyId]});assert.equal(invitation.status,201,invitation.text);assert.notEqual(invitation.data.deliveryStatus,"sent");assert.equal((await request(user,"/app",undefined,"GET")).status,200);}
assert.equal((await request(owner,path,{...task,title:"No autorizado"})).status,403);
assert.equal((await request(professional,`${path}/${itemId}`,{...task,action:"edit"},"PATCH")).status,403);
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
const form=new FormData();form.set("organizationId",organizationId);form.set("documentType","Evidencia ficticia");form.set("anonymizationConfirmed","yes");form.append("checklistItemIds",itemId);form.set("file",new File([png],"evidencia-ficticia.png",{type:"image/png"}));
form.append("checklistItemIds",operationId);
const upload=await request(admin,`/api/properties/${propertyId}/documents`,form);assert.equal(upload.status,201,upload.text);
const withEvidence=await request(admin,`/app/properties/${propertyId}`,undefined,"GET");const documentId=withEvidence.text.match(/\/documents\/([\w-]+)\?organizationId=/)?.[1];assert.ok(documentId);
assert.ok(withEvidence.text.includes('id="group-operational"'));assert.ok(withEvidence.text.includes('id="group-professional_requirement"'));
assert.equal((await request(admin,`${path}/${itemId}`,{...task,action:"edit",itemKind:"operational"},"PATCH")).status,400,"linked criterion cannot be reclassified");
assert.equal((await request(professional,`/api/properties/${propertyId}/reviews`,{organizationId,checklistItemId:operationId,documentId,decision:"approved",observation:"Esta tarea operativa no puede aprobarse como revisión profesional."})).status,400);
assert.match(withEvidence.text.slice(withEvidence.text.indexOf(`id="task-${operationId}"`),withEvidence.text.indexOf(`id="task-${operationId}"`)+5000),/workflow-badge completed/,"upload preserves operational completion");
const documentPath=`/api/properties/${propertyId}/documents/${documentId}`;
const metadata={organizationId,action:"metadata",documentType:"Evidencia ficticia corregida",documentDate:"2026-10-01",expiresAt:"2027-10-01"};
assert.equal((await request(admin,documentPath,metadata,"PATCH")).status,200);
assert.equal((await request(admin,documentPath,{...metadata,expiresAt:"2026-02-30"},"PATCH")).status,409);
assert.equal((await request(owner,documentPath,metadata,"PATCH")).status,403);
assert.equal((await request(admin,`${path}/${itemId}`,{organizationId},"DELETE")).status,400,"linked task cannot be deleted");
assert.equal((await request(admin,`${path}/${itemId}`,{organizationId,status:"in_review"},"PATCH")).status,200);
const review=await request(professional,`/api/properties/${propertyId}/reviews`,{organizationId,checklistItemId:itemId,documentId,decision:"approved",observation:("Observación ficticia extensa para verificar que el informe no recorta información ni pierde las limitaciones de la revisión. ").repeat(6)+"MARCADOR-FINAL-REVISION"});assert.equal(review.status,201,review.text);
assert.equal((await request(admin,`${path}/${itemId}`,{...task,action:"edit"},"PATCH")).status,400,"reviewed content protected");
assert.equal((await request(admin,documentPath,metadata,"PATCH")).status,409,"reviewed metadata protected");
const evaluation=await request(admin,`/api/properties/${propertyId}/facts`,{organizationId,values:{"dossier.identity_evidence_available":"true","dossier.contact_channel_available":"unknown","dossier.relevant_dates_recorded":"false"}},"PUT");assert.equal(evaluation.status,200,evaluation.text);
const report=await request(admin,`/api/properties/${propertyId}/report?organizationId=${organizationId}`,undefined,"GET");assert.equal(report.status,200,report.text);assert.equal(Buffer.from(report.bytes.slice(0,4)).toString(),"%PDF");
await writeFile("/private/tmp/expediente-vv-dossier-qa.pdf",report.bytes);
const replacement=new FormData();replacement.set("organizationId",organizationId);replacement.set("documentId",documentId);replacement.set("anonymizationConfirmed","yes");replacement.set("file",new File([png],"evidencia-ficticia-v2.png",{type:"image/png"}));assert.equal((await request(admin,`/api/properties/${propertyId}/documents`,replacement)).status,201);
const reopened=await request(admin,`/app/properties/${propertyId}`,undefined,"GET");assert.ok(reopened.text.includes("Revisión anterior invalidada"));assert.ok(!reopened.text.includes("<h1>Otro expediente"));
storeFixture();
if(process.argv.includes("--browser")) {
  const target=(await(await fetch("http://127.0.0.1:9337/json/list")).json()).find(t=>t.type==="page");
  const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let sequence=0;const pending=new Map();const errors=[];
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text);const call=pending.get(m.id);if(call){pending.delete(m.id);clearTimeout(call.timer);m.error?call.reject(Error(m.error.message)):call.resolve(m.result);}};
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>(await command("Runtime.evaluate",{expression,returnByValue:true})).result.value;
  async function wait(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(expression);}
  try {
    await command("Page.enable");await command("Runtime.enable");await command("Network.enable");await command("Network.setExtraHTTPHeaders",{headers:headers(admin)});
    await command("Network.setCookie",{name:"expediente-vv-active-organization",value:organizationId,url:origin});
    await command("Network.setCookie",{name:"expediente-vv-language",value:"es",url:origin});
    await command("Page.navigate",{url:origin+`/app/properties/${propertyId}`});
    await wait("!!document.querySelector('#checklist') && Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Añadir tarea' && Object.keys(b).some(k=>k.startsWith('__reactProps$')))");
    await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Añadir tarea').click()");
    await wait("!!document.querySelector('.task-editor textarea')");
    for(const [selector,text] of [[".task-editor input:not([type=date])","Tarea creada desde el navegador"],[".task-editor textarea","Verificar que se conserva la explicación y que los campos no se solapan."]]) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);await command("Input.insertText",{text});
    }
    for(const width of [390,1280])for(const theme of ["light","dark"]) {
      await command("Emulation.setDeviceMetricsOverride",{width,height:1100,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.task-editor').scrollIntoView({block:'start'});`);
      const bounds=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,fields:Array.from(document.querySelectorAll('.task-editor input,.task-editor textarea')).map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right}})})");
      assert.ok(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));assert.ok(bounds.fields.every(f=>f.left>=0&&f.right<=bounds.width+1),JSON.stringify(bounds));
      await new Promise(resolve=>setTimeout(resolve,650));
      const image=await command("Page.captureScreenshot",{format:"png"});await writeFile(`/private/tmp/expediente-vv-task-editor-${width}-${theme}.png`,Buffer.from(image.data,"base64"));
    }
    await evaluate("document.querySelector('.task-editor button[type=submit]').click()");
    await wait("!document.querySelector('.task-editor') && document.body.innerText.includes('Tarea creada desde el navegador')");
    const browserTaskId=await evaluate("Array.from(document.querySelectorAll('[data-checklist-item-id]')).find(n=>n.querySelector('h3')?.innerText==='Tarea creada desde el navegador').dataset.checklistItemId");
    const taskSelector=`[data-checklist-item-id='${browserTaskId}']`;
    await evaluate(`document.querySelector(${JSON.stringify(taskSelector)}).querySelector('.task-edit-button').click()`);
    await wait("!!document.querySelector('.task-editor .task-delete-button')");
    await evaluate("document.querySelector('.task-editor .task-delete-button').click()");await wait("!!document.querySelector('.task-delete-dialog[open]')");
    assert.equal(await evaluate("document.activeElement.innerText"),"Conservar tarea");
    await evaluate("document.querySelector('.task-delete-dialog .button-secondary').click()");await wait("!document.querySelector('.task-delete-dialog')");
    assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(taskSelector)})`));
    await evaluate("document.querySelector('.task-editor .task-delete-button').click()");await wait("!!document.querySelector('.task-delete-dialog[open]')");
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});await wait("!document.querySelector('.task-delete-dialog')");
    await evaluate("document.querySelector('.task-editor .task-delete-button').click()");await wait("!!document.querySelector('.task-delete-dialog[open]')");
    for(const width of [390,1280])for(const theme of ["light","dark"]){
      await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      const box=await evaluate("(()=>{const r=document.querySelector('.task-delete-dialog').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()");assert.ok(box.left>=0&&box.right<=box.width&&box.top>=0&&box.bottom<=box.height+1,JSON.stringify(box));
      const picture=await command("Page.captureScreenshot",{format:"png"});await writeFile(`/private/tmp/expediente-vv-delete-${width}-${theme}.png`,Buffer.from(picture.data,"base64"));
    }
    await command("Network.setBlockedURLs",{urls:[`*checklist/${browserTaskId}`]});
    await evaluate("document.querySelector('.task-confirm-delete').click()");await wait("!!document.querySelector('.task-delete-dialog [role=alert]')");
    await command("Network.setBlockedURLs",{urls:[]});await evaluate("document.querySelector('.task-confirm-delete').click()");
    await wait(`!document.querySelector('.task-delete-dialog') && !document.querySelector(${JSON.stringify(taskSelector)})`);
    await evaluate(`document.querySelector('[data-checklist-item-id="${itemId}"] .task-edit-button').click()`);await wait("!!document.querySelector('.task-editor .task-delete-button:disabled')");
    assert.ok(await evaluate("document.querySelector('.task-deletion-blocked').innerText.includes('historial')"));
    await evaluate("Array.from(document.querySelectorAll('.task-editor button')).find(b=>b.innerText==='Cancelar').click()");
    await evaluate("document.querySelector('.language-switcher button[lang=en]').click()");await wait("document.documentElement.lang==='en' && document.body.innerText.includes('Add a task')");
    assert.equal(await evaluate("document.body.innerText.includes('Case file and report')"),true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:"passed",browser:"task created through real form; ES/EN; mobile/desktop in light/dark; no runtime exceptions"}));
  } finally {socket.close();}
}
function storeFixture(){console.log(JSON.stringify({result:"passed",propertyId,organizationId,localBrowserHeaders:headers(admin),checks:"task create/edit/delete and idempotency; invalid dates; role restrictions; evidence metadata; reviewed content protection; laboratory; PDF; replacement invalidates review",pdf:"/private/tmp/expediente-vv-dossier-qa.pdf"}));}
