// Local isolated identity and fictional fixtures only; never run against production.
import assert from "node:assert/strict";
const origin = "http://localhost:3000";
const identity = `synthetic-qa-${crypto.randomUUID()}`;
const headers = {"oai-authenticated-user-id":identity,"oai-authenticated-user-email":`${identity}@example.invalid`,origin,"content-type":"application/json"};
async function request(path, body, method="POST") {
  return fetch(origin+path,{method,headers,body:JSON.stringify(body)});
}
const createSpace = await request("/api/organizations",{name:"Synthetic fields QA"});
assert.equal(createSpace.status,201);
const {organization} = await createSpace.json();
const input = {organizationId:organization.id,alias:"VV-DEMO-02",dataProfile:"pilot_anonymized",islandCode:"TF",municipality:"Santa Cruz de Tenerife",postalCode:"38001",activityStatus:"not_started",ownerName:"Titular A-2",addressLine:"Calle Ejemplo 1",cadastralReference:"DEMO-001",ownerEmail:"propietario02@example.invalid",ownerPhone:"000000000"};
const create = await request("/api/properties",input);
assert.equal(create.status,201,await create.clone().text());
const {property} = await create.json();
const cookie = `expediente-vv-active-organization=${organization.id}`;
for (const [field,value] of Object.entries({addressLine:"Calle Real 21",cadastralReference:"12345678901234567890",ownerEmail:"persona@gmail.com",ownerPhone:"612345678"})) {
  const response = await request("/api/properties",{...input,[field]:value});
  assert.equal(response.status,400,`${field} must reject real-looking data`);
}
const update = await request(`/api/properties/${property.id}`,{...input,action:"update",addressLine:"Calle Inventada 3",ownerName:"Propietario 03"},"PATCH");
assert.equal(update.status,200,await update.clone().text());
const rejectUpdate = await request(`/api/properties/${property.id}`,{...input,action:"update",ownerEmail:"persona@gmail.com"},"PATCH");
assert.equal(rejectUpdate.status,400);
for (const language of ["es","en"]) {
  const edit = await fetch(`${origin}/app/properties/${property.id}/edit`,{headers:{...headers,cookie:`${cookie}; expediente-vv-language=${language}`}});
  assert.equal(edit.status,200);
  const html=await edit.text();
  for (const field of ["addressLine","cadastralReference","ownerName","ownerEmail","ownerPhone"]) {
    const tag=html.match(new RegExp(`<input[^>]*name="${field}"[^>]*>`))?.[0];
    assert.ok(tag,field);
    assert.ok(!/disabled|readOnly|readonly/.test(tag),`${field} must be editable`);
  }
  assert.ok(html.includes(language==="es"?"Cuentas, equipo y responsables":"Accounts, team and report responsibilities"));
  assert.ok(html.includes("Calle Inventada 3"));
}
console.log(JSON.stringify({result:"passed",checks:"fictional create/update persisted; real-looking fields rejected on server; all five inputs enabled; team guide in ES/EN",propertyId:property.id}));
if(process.argv.includes("--browser")) {
  const target=(await(await fetch("http://127.0.0.1:9337/json/list")).json()).find(t=>t.type==="page");
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let sequence=0;
  const pending=new Map();
  socket.onmessage=({data})=>{const message=JSON.parse(data);const call=pending.get(message.id);if(call){pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);}};
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>(await command("Runtime.evaluate",{expression,returnByValue:true})).result.value;
  async function wait(expression) {const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(expression);}
  try {
    await command("Network.enable");await command("Page.enable");
    await command("Network.setExtraHTTPHeaders",{headers});
    await command("Network.setCookie",{name:"expediente-vv-active-organization",value:organization.id,url:origin});
    await command("Network.setCookie",{name:"expediente-vv-language",value:"es",url:origin});
    await command("Page.navigate",{url:origin+"/app/properties/new"});
    await wait("!!document.querySelector('input[name=ownerName]') && Object.keys(document.querySelector('input[name=ownerName]')).some(k=>k.startsWith('__reactProps$'))");
    for(const [field,value] of Object.entries({ownerName:"Titular A-9",ownerEmail:"titular09@example.invalid",ownerPhone:"000000000",addressLine:"Calle Ejemplo 9",cadastralReference:"DEMO-009"})) {
      await evaluate(`document.querySelector('input[name=${field}]').focus();document.querySelector('input[name=${field}]').select()`);
      await command("Input.insertText",{text:value});
      assert.equal(await evaluate(`document.querySelector('input[name=${field}]').value`),value,`${field} accepts typing`);
    }
    await command("Page.navigate",{url:origin+`/app/properties/${property.id}/edit`});
    await wait("!!document.querySelector('.workspace-guide') && !!document.querySelector('input[name=ownerName]')");
    for(const width of [390,1280]) {
      await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});
      for(const theme of ["light","dark"]) {
        await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.workspace-guide').open=true`);
        const bounds=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,guide:document.querySelector('.workspace-guide').getBoundingClientRect().width})");
        assert.ok(bounds.scroll<=bounds.width+1 && bounds.guide<=bounds.width,JSON.stringify(bounds));
      }
    }
    console.log(JSON.stringify({result:"passed",checks:"real browser typing in all five fields; expanded team guide at mobile/desktop widths in light/dark"}));
  } finally {socket.close();}
}
