// Local fictional identity only; never use production or customer data.
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
const origin="http://localhost:3000",identity=`validation-qa-${crypto.randomUUID()}`;
const headers={"oai-authenticated-user-id":identity,"oai-authenticated-user-email":`${identity}@example.invalid`,origin,"content-type":"application/json"};
const create=await fetch(origin+"/api/organizations",{method:"POST",headers,body:JSON.stringify({name:"QA validación vivienda"})});assert.equal(create.status,201);
const {organization}=await create.json();
const invalid=await fetch(origin+"/api/properties",{method:"POST",headers,body:JSON.stringify({organizationId:organization.id,alias:"",islandCode:"TF",municipality:"Teguise",postalCode:"35001",ownerName:"Propietario 01",dataProfile:"pilot_anonymized",ownerEmail:"bad@",nextActionDueAt:"2026-02-30"})});
assert.equal(invalid.status,400);const errors=(await invalid.json()).fieldErrors;for(const field of ["alias","municipality","postalCode","ownerEmail","nextActionDueAt"])assert.ok(errors[field]);
const target=(await(await fetch("http://127.0.0.1:9337/json/list")).json()).find(t=>t.type==="page");const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const pending=new Map(),exceptions=[];
socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==="Runtime.exceptionThrown")exceptions.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>(await command("Runtime.evaluate",{expression,returnByValue:true})).result.value;
async function wait(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(expression);}
async function type(selector,text){await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select()`);await command("Input.insertText",{text});}
try {
  await command("Network.enable");await command("Page.enable");await command("Runtime.enable");await command("Network.setExtraHTTPHeaders",{headers});
  await command("Network.setCookie",{name:"expediente-vv-active-organization",value:organization.id,url:origin});await command("Network.setCookie",{name:"expediente-vv-language",value:"es",url:origin});
  await command("Page.navigate",{url:origin+"/app/properties/new"});
  await wait("!!document.querySelector('.property-form') && Object.keys(document.querySelector('.property-form')).some(k=>k.startsWith('__reactProps$'))");
  await evaluate("document.querySelector('.property-verification-note').open=true");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.property-verification-note li')).length"),4);
  assert.ok(await evaluate("Array.from(document.querySelectorAll('.property-verification-note li')).every(li=>li.innerText.trim().length>30 && getComputedStyle(li).visibility==='visible')"),"beta explanations are not blank");
  await evaluate("document.querySelector('.property-form button[type=submit]').click()");
  await wait("!!document.querySelector('.form-error-summary') && document.querySelectorAll('.field-error-message').length>=4");
  await wait("document.activeElement.className==='form-error-summary'");
  assert.equal(await evaluate("document.querySelector('input[name=alias]').getAttribute('aria-invalid')"),"true");
  await evaluate("Array.from(document.querySelectorAll('.form-error-summary button')).find(b=>b.innerText.startsWith('Código postal')).click()");
  assert.equal(await evaluate("document.activeElement.name"),"postalCode");
  await type("input[name=alias]","VV-DEMO-VALIDACION");
  await evaluate("document.querySelector('.property-form .premium-select-trigger').click()");await wait("!!document.querySelector('.premium-select-menu')");
  await evaluate("Array.from(document.querySelectorAll('.premium-select-option')).find(b=>b.innerText.trim()==='Tenerife').click()");
  await type("[data-municipality-search]","Santa Cruz");await wait("Array.from(document.querySelectorAll('[role=option]')).some(b=>b.innerText.includes('Santa Cruz de Tenerife'))");
  await evaluate("Array.from(document.querySelectorAll('[role=option]')).find(b=>b.innerText.includes('Santa Cruz de Tenerife')).click()");
  await type("input[name=postalCode]","35001");await type("input[name=ownerEmail]","invalid@");
  await evaluate("document.querySelector('.property-form button[type=submit]').click()");
  await wait("document.querySelector('input[name=ownerEmail]').getAttribute('aria-invalid')==='true'");
  assert.equal(await evaluate("document.querySelector('input[name=alias]').value"),"VV-DEMO-VALIDACION");
  assert.ok(await evaluate("document.querySelector('.form-error-summary').innerText.includes('38')"));
  await type("input[name=postalCode]","38001");await type("input[name=ownerEmail]","propietario02@example.invalid");
  for(const width of [390,1280])for(const theme of ["light","dark"]) {
    await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.date-picker-trigger').scrollIntoView({block:'center',behavior:'instant'});document.querySelector('.date-picker-trigger').click()`);
    await wait("!!document.querySelector('.date-picker-popup')");await new Promise(resolve=>setTimeout(resolve,150));
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.date-picker-popup')).backgroundColor"),"rgba(0, 0, 0, 0)","calendar surface must not be transparent");
    const bounds=await evaluate("(()=>{const r=document.querySelector('.date-picker-popup').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth}})()");
    assert.ok(bounds.left>=0&&bounds.right<=bounds.width&&bounds.top>=0&&bounds.bottom<=bounds.height+1,JSON.stringify(bounds));assert.ok(bounds.scroll<=bounds.width+1);
    const capture=await command("Page.captureScreenshot",{format:"png"});await writeFile(`/private/tmp/expediente-vv-calendar-${width}-${theme}.png`,Buffer.from(capture.data,"base64"));
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});await wait("!document.querySelector('.date-picker-popup')");
    assert.equal(await evaluate("document.activeElement.className"),"date-picker-trigger");
  }
  await evaluate("document.querySelector('.date-picker-trigger').click()");await wait("!!document.querySelector('.date-picker-popup')");
  await evaluate("document.querySelector('button[aria-label=\"Mes siguiente\"]').click()");
  await new Promise(resolve=>setTimeout(resolve,100));
  const date=await evaluate("Array.from(document.querySelectorAll('[data-day]')).find(b=>b.innerText==='15').dataset.day");
  await evaluate("Array.from(document.querySelectorAll('[data-day]')).find(b=>b.innerText==='15').click()");assert.equal(await evaluate("document.querySelector('input[name=nextActionDueAt]').value"),date);
  assert.equal(await evaluate("!!document.querySelector('input[type=date]')"),false);
  await evaluate("window.__qaKeys=[];window.__qaOriginalFetch=window.fetch;window.fetch=(url,options)=>{if(url==='/api/properties' && options?.method==='POST')window.__qaKeys.push(options.headers['idempotency-key']);return window.__qaOriginalFetch(url,options)}");
  await command("Network.setBlockedURLs",{urls:["*api/properties"]});
  await evaluate("document.querySelector('.property-form button[type=submit]').click()");
  await wait("!!document.querySelector('.form-error') && document.querySelector('.form-error').innerText.includes('servidor local')");
  assert.equal(await evaluate("document.querySelector('input[name=alias]').value"),"VV-DEMO-VALIDACION");
  const firstKey=await evaluate("window.__qaKeys[0]");assert.ok(firstKey);
  await command("Network.setBlockedURLs",{urls:[]});
  await evaluate("document.querySelector('.property-form button[type=submit]').click()");await wait("location.pathname.includes('/app/properties/') && !location.pathname.endsWith('/new') && location.search.includes('created=1')");
  assert.equal(await evaluate("window.__qaKeys[1]"),firstKey,"retry keeps the creation key");
  const propertyId=await evaluate("location.pathname.split('/').at(-1)");await command("Page.navigate",{url:origin+`/app/properties/${propertyId}/edit`});await wait("!!document.querySelector('.property-edit-form') && !!document.querySelector('input[name=nextActionDueAt]')");
  assert.equal(await evaluate("document.querySelector('input[name=nextActionDueAt]').value"),date);
  for(const width of [390,1280])for(const theme of ["light","dark"]){
    await command("Emulation.setDeviceMetricsOverride",{width,height:1100,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.property-edit-form').scrollIntoView({block:'start'})`);
    await new Promise(resolve=>setTimeout(resolve,200));
    const bounds=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");assert.ok(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));
    assert.ok(await evaluate("parseFloat(getComputedStyle(document.querySelector('.property-edit-form h2')).fontSize)>=20"));
    assert.equal(await evaluate("document.querySelector('.property-edit-form>.editor-help').open"),false);
    for(const name of ["alias","addressLine","islandCode","municipality","postalCode","cadastralReference","managerUserId","nextAction","nextActionDueAt","ownerName","ownerEmail","ownerPhone"]){assert.ok(await evaluate(`!!document.querySelector('[name="${name}"]')`),name);}
    const capture=await command("Page.captureScreenshot",{format:"png"});await writeFile(`/private/tmp/expediente-vv-property-edit-${width}-${theme}.png`,Buffer.from(capture.data,"base64"));
  }
  await command("Page.navigate",{url:origin+"/app/properties/new"});await wait("!!document.querySelector('.property-form') && Object.keys(document.querySelector('.language-switcher button[lang=en]')).some(k=>k.startsWith('__reactProps$'))");
  await evaluate("document.querySelector('.language-switcher button[lang=en]').click()");await wait("document.documentElement.lang==='en'");
  await evaluate("document.querySelector('.property-form button[type=submit]').click()");await wait("!!document.querySelector('.form-error-summary')");assert.ok(await evaluate("document.querySelector('.form-error-summary').innerText.includes('Correct these fields')"));
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({result:"passed",checks:"server field errors; visible inline and summary errors; focus links; values preserved; province/email errors; custom calendar selection/Escape/persistence; ES/EN; mobile/desktop light/dark",date}));
} finally{socket.close();}
