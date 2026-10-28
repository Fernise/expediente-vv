// Read-only visual smoke checks against an isolated localhost QA dossier.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin='http://localhost:3000';
const [identity,organization,property]=process.argv.slice(2);
assert.ok(identity?.startsWith('dossier-qa-') && organization && property);
const target=(await(await fetch('http://127.0.0.1:9337/json/list')).json()).find(t=>t.type==='page' && t.url.startsWith(origin));
assert.ok(target,'Use the isolated localhost browser, never production');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const pending=new Map();const exceptions=[];
socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);const call=pending.get(message.id);if(call){pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(message.error.message)):call.resolve(message.result);}};
const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>(await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
const pause=()=>new Promise(resolve=>setTimeout(resolve,150));
try{
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Network.setExtraHTTPHeaders',{headers:{'oai-authenticated-user-id':identity,'oai-authenticated-user-email':`${identity}@example.invalid`}});
  await command('Network.setCookie',{name:'expediente-vv-active-organization',value:organization,url:origin});
  await command('Network.setCookie',{name:'expediente-vv-language',value:'es',url:origin});
  let checked=0;
  for(const width of [1280,390])for(const theme of ['light','dark']){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
    for(const path of ['/','/app','/app/properties','/app/properties/new',`/app/properties/${property}`,'/app/alerts','/app/team','/app/audit','/app/operations','/app/privacy','/app/license','/app/rules']){
      await command('Page.navigate',{url:origin+path});
      const deadline=Date.now()+20000;
      while(Date.now()<deadline){if(await evaluate(`location.pathname===${JSON.stringify(path)} && document.readyState==='complete' && !!document.querySelector('main')`))break;await pause();}
      assert.equal(await evaluate('location.pathname'),path);
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};localStorage.setItem('expediente-vv-theme',${JSON.stringify(theme)})`);
      await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
      await pause();
      const dimensions=await evaluate('({width:innerWidth,content:document.documentElement.scrollWidth,title:document.title})');
      assert.ok(dimensions.content<=dimensions.width+1,`${path}, ${width}, ${theme}: horizontal overflow ${JSON.stringify(dimensions)}`);
      if(path===`/app/properties/${property}`){
        const end=Date.now()+20000;
        while(Date.now()<end && !await evaluate("!!document.querySelector('.report-download-controls button') && Object.keys(document.querySelector('.report-download-controls button')).some(k=>k.startsWith('__reactProps$'))"))await pause();
        const choose=async language=>{
          await evaluate("document.querySelector('.report-download-controls button').click()");await pause();
          await evaluate(`Array.from(document.querySelectorAll('[role=option]')).find(b=>b.innerText.trim()===${JSON.stringify(language)}).click()`);await pause();
        };
        await choose('English');
        assert.ok(await evaluate("document.querySelector('.report-download-controls a').href.endsWith('&lang=en')"));
        const exported=await evaluate("fetch(document.querySelector('.report-download-controls a').href).then(async r=>({status:r.status,language:r.headers.get('content-language'),filename:r.headers.get('content-disposition'),signature:new TextDecoder().decode((await r.arrayBuffer()).slice(0,4))}))");
        assert.equal(exported.status,200);assert.equal(exported.language,'en');assert.equal(exported.signature,'%PDF');assert.match(exported.filename,/-en\.pdf/);
        await choose('Español');assert.ok(await evaluate("document.querySelector('.report-download-controls a').href.endsWith('&lang=es')"));
      }
      if(path==='/' || path===`/app/properties/${property}`){
        const shot=await command('Page.captureScreenshot',{format:'png'});
        await writeFile(`/private/tmp/expediente-vv-design-${path==='/'?'landing':'dossier'}-${width}-${theme}.png`,Buffer.from(shot.data,'base64'));
      }
      checked++;
    }
  }
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({result:'passed',checks:checked,coverage:'12 routes in light/dark, desktop/mobile; no horizontal overflow or runtime exceptions'}));
}finally{for(const call of pending.values())clearTimeout(call.timer);socket.close();}
