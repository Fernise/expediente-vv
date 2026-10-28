// Regression tour: isolated localhost only, fictional data, no real email.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
for(const path of ['.env','.env.local','.env.development','.dev.vars']){
  const text=await readFile(new URL('../'+path,import.meta.url),'utf8').catch(()=>'');
  assert.ok(!/^GMAIL_OAUTH_(?:CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)\s*=\s*[^\s#]+/m.test(text),'No real mail during tour');
}
const origin='http://localhost:3000',identity=`gestoria-tour-${crypto.randomUUID()}`;
const headers={'oai-authenticated-user-id':identity,'oai-authenticated-user-email':`${identity}@example.invalid`,origin};
const results=[],findings=[];
async function api(path,body,method='POST',actor=headers){const r=await fetch(origin+path,{method,headers:{...actor,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};}
const initial=await api('/api/organizations',{name:'Gestoría QA · Oficina principal'});assert.equal(initial.status,201);
const org=initial.data.organization.id;
const property=await api('/api/properties',{organizationId:org,alias:'VV-DEMO GESTORÍA',dataProfile:'pilot_anonymized',islandCode:'TF',municipality:'Adeje',postalCode:'38670',ownerName:'Propietario 01',nextAction:'Solicitar evidencia ficticia',nextActionDueAt:'2026-01-01'});assert.equal(property.status,201);const propertyId=property.data.property.id;
const target=(await(await fetch('http://127.0.0.1:9337/json/list')).json()).find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(origin)));
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const pending=new Map(),exceptions=[];
socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Wait: '+expression);};
async function navigate(path){await command('Page.navigate',{url:origin+path});await wait(`location.pathname===${JSON.stringify(path.split('?')[0])} && document.readyState==='complete' && !!document.querySelector('.workspace-shell')`);await wait("!!document.querySelector('.user-avatar') && Object.keys(document.querySelector('.user-avatar')).some(k=>k.startsWith('__reactProps$'))");}
async function type(selector,text){await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);await command('Input.insertText',{text});}
async function clickText(selector,text){await wait(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(b=>b.innerText.trim()===${JSON.stringify(text)})`);await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.innerText.trim()===${JSON.stringify(text)}).click()`);}
async function choose(selector,label){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await clickText('[role=option]',label);}
async function section(name,task){try{await task();results.push({name,result:'passed'});}catch(error){findings.push({name,error:error.message});results.push({name,result:'failed'});}console.log(JSON.stringify(results.at(-1)));}
try{
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await command('Network.setBlockedURLs',{urls:[]});
  await command('Network.setExtraHTTPHeaders',{headers});
  await command('Network.setCookie',{name:'expediente-vv-active-organization',value:org,url:origin});await command('Network.setCookie',{name:'expediente-vv-language',value:'es',url:origin});
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await section('Crear otro espacio y cambiar de oficina',async()=>{
    await navigate('/app');await evaluate("document.querySelector('.organization-switcher').click()");await clickText('.workspace-create-trigger strong','Crear otro espacio');
    await type('.workspace-create-form input','Gestoría QA · Segunda oficina');await evaluate("document.querySelector('.workspace-create-form button[type=submit]').click()");
    await wait("document.querySelector('.organization-switcher strong')?.innerText==='Gestoría QA · Segunda oficina'");assert.ok(!await evaluate("document.body.innerText.includes('VV-DEMO GESTORÍA')"));
    await evaluate("document.querySelector('.organization-switcher').click()");await clickText('.organization-option strong','Gestoría QA · Oficina principal');await wait("document.querySelector('.organization-switcher strong')?.innerText==='Gestoría QA · Oficina principal'");
  });
  await section('Invitar, aceptar, gestionar y revocar acceso',async()=>{
    await navigate('/app/team');const person=`tour-member-${crypto.randomUUID()}`;const email=`${person}@example.invalid`;
    await type('.team-invite-form input[type=email]',email);await evaluate("document.querySelector('.team-invite-form button[type=submit]').click()");await wait(`Array.from(document.querySelectorAll('.invitation-row')).some(e=>e.innerText.includes(${JSON.stringify(email)}))`);
    assert.ok(!await evaluate("document.querySelector('.invitation-row').innerText.includes('Invitación enviada por Gmail')"));
    const entered=await api('/app',undefined,'GET',{'oai-authenticated-user-id':person,'oai-authenticated-user-email':email});assert.equal(entered.status,200);
    await navigate('/app/team');await wait(`Array.from(document.querySelectorAll('.team-member')).some(e=>e.innerText.includes(${JSON.stringify(email)}))`);
    await evaluate(`window.__member=Array.from(document.querySelectorAll('.team-member')).find(e=>e.innerText.includes(${JSON.stringify(email)}));window.__member.querySelector('.member-edit-button').click()`);await wait("!!document.querySelector('.member-editor')");
    await clickText('.member-editor button','Guardar acceso');await wait("!document.querySelector('.member-editor')");
    await evaluate(`Array.from(document.querySelectorAll('.team-member')).find(e=>e.innerText.includes(${JSON.stringify(email)})).querySelector('.member-edit-button').click()`);await clickText('.member-editor button','Revocar acceso');await clickText('.revoke-confirmation button','Sí, revocar');
    await wait(`!Array.from(document.querySelectorAll('.team-member')).some(e=>e.innerText.includes(${JSON.stringify(email)}))`);
  });
  await section('Avisos vencidos y acceso al expediente',async()=>{
    await navigate('/app/alerts');await evaluate("document.querySelector('a[href=\"/app/alerts?view=overdue\"]').click()");await wait("location.search.includes('view=overdue') && !!document.querySelector('.operational-alert.overdue')");assert.ok(await evaluate("document.querySelector('.operational-alert-list').innerText.includes('VV-DEMO GESTORÍA')"));
    await evaluate("document.querySelector('.operational-alert.overdue a').click()");await wait(`location.pathname==='/app/properties/${propertyId}'`);
  });
  await section('Guardar hechos y evaluación sin cambiar checklist',async()=>{
    await navigate(`/app/properties/${propertyId}`);const before=await evaluate("document.querySelectorAll('[data-checklist-item-id]').length");
    await choose('.fact-row .premium-select-trigger','Sí');await evaluate("document.querySelector('.facts-form button[type=submit]').click()");await wait("!!document.querySelector('.evaluation-result') && document.querySelector('.facts-actions').innerText.includes('sincronizados')");assert.equal(await evaluate("document.querySelectorAll('[data-checklist-item-id]').length"),before);
  });
  await section('Crear versión de regla y enviar/retirar de revisión',async()=>{
    await navigate('/app/rules');await clickText('.rule-editor-launch button','Crear nueva versión');await type('.rule-editor-form input','Regla ficticia de prueba de gestoría');await evaluate("document.querySelector('.rule-editor-form button[type=submit]').click()");await wait("!document.querySelector('.rule-editor-form') && document.body.innerText.includes('Regla ficticia de prueba de gestoría')");
    await clickText('.governance-actions button','Enviar a revisión');await wait("document.querySelector('.governance-status')?.innerText.includes('revisión')");await clickText('.governance-actions button','Retirar de revisión');await wait("document.querySelector('.governance-status')?.innerText.includes('Borrador')");
  });
  await section('Auditoría: filtrar y limpiar',async()=>{
    await navigate('/app/audit');await choose('[aria-label="Filtrar por tipo de actividad"]','Viviendas');await type('.audit-search input','VV-DEMO');await evaluate("document.querySelector('.audit-filters button[type=submit]').click()");await wait("location.search.includes('category=properties') && !!document.querySelector('.audit-event-list')");assert.ok(await evaluate("document.querySelector('.audit-log-card').innerText.includes('VV-DEMO')"));await clickText('.audit-filters a','Limpiar');await wait("location.search===''");
  });
  await section('Exportación CSV y ZIP con contenido real de prueba',async()=>{
    await navigate('/app/privacy');const exports=await evaluate("Promise.all(Array.from(document.querySelectorAll('.privacy-actions a')).map(async a=>{const r=await fetch(a.href);const bytes=new Uint8Array(await r.arrayBuffer());return {status:r.status,type:r.headers.get('content-type'),size:bytes.length,signature:Array.from(bytes.slice(0,4))}}))");
    assert.equal(exports.length,2);assert.ok(exports.every(e=>e.status===200&&e.size>100));assert.deepEqual(exports.find(e=>e.type.includes('zip')).signature.slice(0,2),[80,75]);
  });
  await section('Programar eliminación recuperable y cancelarla',async()=>{
    await navigate('/app/privacy');assert.ok(await evaluate("document.querySelector('.privacy-confirmation button').disabled"));await type('#delete-confirmation','Gestoría QA · Oficina principal');assert.ok(await evaluate("document.querySelector('.privacy-confirmation button').disabled"));await evaluate("document.querySelector('.privacy-check input').click();document.querySelector('.privacy-confirmation button').click()");await wait("document.querySelector('.privacy-delete-card h2')?.innerText==='Eliminación programada'");await clickText('.privacy-delete-card button','Cancelar eliminación');await wait("!!document.querySelector('#delete-confirmation')");
  });
  await section('Comprobación operativa manual',async()=>{
    await navigate('/app/operations');await evaluate("document.querySelector('.operations-run-controls button').click()");await wait("!!document.querySelector('.operations-run-controls small') && !document.querySelector('.operations-run-controls button').disabled");assert.ok(await evaluate("/completad/.test(document.querySelector('.operations-run-controls small').innerText)"));
  });
  await section('Archivar vivienda conservando acceso al historial',async()=>{
    await navigate(`/app/properties/${propertyId}`);await clickText('.archive-action button','Archivar vivienda');await clickText('.archive-confirmation button','Cancelar');assert.ok(!await evaluate("!!document.querySelector('.archive-confirmation')"));await clickText('.archive-action button','Archivar vivienda');await clickText('.archive-confirmation button','Sí, archivar');await wait("location.pathname==='/app/properties' && document.readyState==='complete' && !!document.querySelector('.property-filters')");assert.ok(!await evaluate("document.querySelector('.property-list')?.innerText.includes('VV-DEMO GESTORÍA')"));await navigate('/app/properties?archived=1');assert.ok(await evaluate("document.body.innerText.includes('VV-DEMO GESTORÍA')"));
  });
  await section('Crear espacio: pérdida de respuesta y reintento',async()=>{
    await navigate('/app');await evaluate("document.querySelector('.organization-switcher').click()");await clickText('.workspace-create-trigger strong','Crear otro espacio');await type('.workspace-create-form input','Gestoría QA · Reintento controlado');
    await evaluate("window.__originalFetch=window.fetch;window.__createdSpaces=[];window.fetch=async(...args)=>{const r=await window.__originalFetch(...args);if(args[0]==='/api/organizations'&&r.ok){window.__createdSpaces.push((await r.clone().json()).organization.id);throw new TypeError('Simulated lost response after commit');}return r;};document.querySelector('.workspace-create-form button[type=submit]').click()");await wait("!!document.querySelector('.workspace-create-form [role=alert]')");await evaluate("window.fetch=window.__originalFetch;document.querySelector('.workspace-create-form button[type=submit]').click()");await wait("document.querySelector('.organization-switcher strong')?.innerText==='Gestoría QA · Reintento controlado'");await evaluate("document.querySelector('.organization-switcher').click()");
    const count=await evaluate("Array.from(document.querySelectorAll('.organization-option strong')).filter(e=>e.innerText==='Gestoría QA · Reintento controlado').length");assert.equal(count,1,'Retry produced duplicate workspaces: '+count);
  });
  // Explicit offline cancellation probe on a fictional invitation only.
  await command('Network.setCookie',{name:'expediente-vv-active-organization',value:org,url:origin});
  await section('Cancelar invitación sin conexión: feedback',async()=>{
    await navigate('/app/team');const email=`tour-pending-${crypto.randomUUID()}@example.invalid`;await type('.team-invite-form input[type=email]',email);await evaluate("document.querySelector('.team-invite-form button[type=submit]').click()");await wait("!!document.querySelector('.invitation-row')");
    await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await evaluate("document.querySelector('.invitation-row .danger-icon-button').click()");await new Promise(r=>setTimeout(r,700));const error=await evaluate("Array.from(document.querySelectorAll('.team-layout [role=alert]')).map(e=>e.innerText).join(' ')");assert.ok(error,'No error message shown when cancellation fails offline');
  });
  await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await mkdir(new URL('../output/',import.meta.url),{recursive:true});
  await writeFile(new URL('../output/tour-gestoria-regression-results.json',import.meta.url),JSON.stringify({date:'2026-10-10',results,findings,exceptions,propertyId,organizationId:org,scope:'isolated localhost, fictional users; no real mail or production writes'},null,2));
  console.log(JSON.stringify({results,findings,exceptions,propertyId,organizationId:org}));
  assert.deepEqual(findings,[], 'The tour detected a regression');
  assert.deepEqual(exceptions,[], 'The browser reported an uncaught exception');
}finally{await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});for(const p of pending.values())clearTimeout(p.timer);socket.close();}
