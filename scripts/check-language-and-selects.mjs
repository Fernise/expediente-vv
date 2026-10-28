// Isolated local browser only. No production identity or real customer data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
const origin = "http://localhost:3000";
const identity = `language-qa-${randomUUID()}`;
const headers = { "oai-authenticated-user-id": identity, "oai-authenticated-user-email": `${identity}@example.invalid`, origin, "content-type": "application/json" };
async function post(path, body) {
  const response = await fetch(origin + path, { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal(response.status, 201);
  return response.json();
}
const { organization } = await post("/api/organizations", { name: "Workspace language QA" });
const { property } = await post("/api/properties", { organizationId: organization.id, alias: "Viviendas", dataProfile: "pilot_anonymized",
  islandCode: "TF", municipality: "Santa Cruz de Tenerife", postalCode: "38001", ownerName: "Propietario 01", activityStatus: "not_started" });
const tabs = await (await fetch("http://127.0.0.1:9337/json/list")).json();
const target = tabs.find(tab => tab.type === "page" && (tab.url === "about:blank" || tab.url.startsWith(origin + "/")));
assert.ok(target);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;
const calls = new Map();
const errors = [];
socket.onmessage=({data})=>{
  const message=JSON.parse(data);
  if(message.method==="Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  const pending=calls.get(message.id); if(!pending)return;
  calls.delete(message.id);clearTimeout(pending.timer);
  message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result);
};
function command(method,params={}) { return new Promise((resolve,reject)=>{
  const id=++sequence; const timer=setTimeout(()=>{calls.delete(id);reject(Error(method));},20000);
  calls.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
}); }
async function evaluate(expression) {
  const result=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
  return result.result.value;
}
async function wait(expression) {
  const until=Date.now()+20000;
  while(Date.now()<until){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error(`Condition not met: ${expression}`);
}
async function navigate(path) { await command("Page.navigate",{url:origin+path});await wait(`location.pathname===${JSON.stringify(path)} && document.readyState==='complete' && !!document.querySelector('main')`); }
async function switchLanguage(locale) {
  await evaluate(`document.querySelector('.language-switcher button[lang="${locale}"]').click()`);
  await wait(`document.documentElement.lang===${JSON.stringify(locale)}`);
}
try {
  await command("Page.enable");await command("Runtime.enable");await command("Network.enable");
  await command("Network.setExtraHTTPHeaders",{headers});
  await command("Network.setCookie",{name:"expediente-vv-active-organization",value:organization.id,url:origin});
  await command("Network.setCookie",{name:"expediente-vv-language",value:"es",url:origin});
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await navigate(`/app/properties/${property.id}`);
  await wait("Object.keys(document.querySelector('.premium-select-trigger')).some(k=>k.startsWith('__reactProps$'))");
  await switchLanguage("en");
  await navigate(`/app/properties/${property.id}`);
  await wait("Object.keys(document.querySelector('.premium-select-trigger')).some(k=>k.startsWith('__reactProps$'))");
  await wait("document.body.innerText.includes('Private documents')");
  assert.equal(await evaluate("document.querySelector('h1').innerText"),"Viviendas","stored names are not translated");
  for(const width of [390,1280]) {
    await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});
    for(const theme of ["light","dark"]) for(const zoom of ["100%","200%"]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}';document.documentElement.style.fontSize='${zoom}';document.documentElement.style.scrollBehavior='auto';document.querySelector('.checklist-status-area .premium-select-trigger').scrollIntoView({block:'center'});document.querySelector('.checklist-status-area .premium-select-trigger').click()`);
      await wait("!!document.querySelector('.premium-select-menu')");
      const bounds=await evaluate("(()=>{const r=document.querySelector('.premium-select-menu').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom,w:innerWidth,h:innerHeight}})()");
      assert.ok(bounds.width>=280 && bounds.left>=0 && bounds.right<=bounds.w+1 && bounds.top>=0 && bounds.bottom<=bounds.h+1,JSON.stringify(bounds));
      assert.equal(await evaluate("document.querySelector('.premium-select-menu').parentElement===document.body"),true,"menu escapes narrow and clipped ancestors");
      assert.equal(await evaluate("document.querySelector('.premium-select-menu').innerText.includes('Document requested')"),true);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.premium-select-option strong')).wordBreak"),"normal");
      if (width === 1280 && theme === "light" && zoom === "100%") {
        await new Promise(resolve => setTimeout(resolve, 600));
        const capture = await command("Page.captureScreenshot", {format:"png"});
        await writeFile("/private/tmp/expediente-vv-dropdown.png", Buffer.from(capture.data,"base64"));
      }
      await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});
      await wait("!document.querySelector('.premium-select-menu')");
      assert.equal(await evaluate("document.activeElement.classList.contains('premium-select-trigger')"),true);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true,`${width} ${theme} ${zoom}`);
    }
  }
  await evaluate("document.documentElement.style.fontSize='100%'");
  for(const path of ["/","/precios","/solicitar-demo","/comprobador","/app","/app/audit","/app/alerts","/app/team","/app/rules","/app/privacy","/app/operations"]) {
    await navigate(path);
    assert.equal(await evaluate("document.documentElement.lang"),"en","language survives navigation");
    for(const width of [390,1280]) {
      await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true,`${path} ${width}`);
    }
  }
  await navigate("/comprobador");
  await wait("Object.keys(document.querySelector('.language-switcher button')).some(k=>k.startsWith('__reactProps$'))");
  assert.equal(await evaluate("document.querySelectorAll('.checker-question-help').length"),6);
  assert.equal(await evaluate("document.querySelector('legend').innerText.includes('Can you find')"),true);
  await evaluate("document.querySelectorAll('input[value=unknown]').forEach(input=>input.click())");
  await switchLanguage("es");
  assert.equal(await evaluate("document.querySelectorAll('input:checked').length"),6,"language switch preserves questionnaire answers");
  await switchLanguage("en");
  await evaluate("document.querySelector('.public-checker button[type=submit]').click()");
  await wait("!!document.querySelector('.checker-result')");
  assert.equal(await evaluate("document.querySelector('.checker-result h2').innerText"),"Professional review required");
  await new Promise(resolve => setTimeout(resolve, 1200));
  const screenshot=await command("Page.captureScreenshot",{format:"png"});
  await writeFile("/private/tmp/expediente-vv-english-checker.png",Buffer.from(screenshot.data,"base64"));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:"passed",checks:"portal size and viewport bounds; keyboard Escape; both themes and 200% text; English across public and private routes; stored names unchanged; questionnaire answers preserved",screenshot:"/private/tmp/expediente-vv-english-checker.png"}));
} finally { await command("Network.setExtraHTTPHeaders",{headers:{}});await command("Network.deleteCookies",{name:"expediente-vv-language",url:origin});socket.close(); }
