// Local-only smoke test. Start `npm run dev` and an isolated headless Chrome
// with --remote-debugging-port=9337. Never point this at production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seedVolumeFixture } from "./seed-volume-fixture.mjs";

const origin = "http://localhost:3000";
const targets = await (await fetch("http://127.0.0.1:9337/json/list")).json();
const target = targets.find((item) => item.type === "page" && (item.url === "about:blank" || item.url.startsWith(`${origin}/`)));
assert.ok(target, "An isolated blank/local Chrome tab is required");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const requests = new Map();
const errors = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  const request = requests.get(message.id);
  if (!request) return;
  requests.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
};
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Timeout: ${method}`)); }, 20000);
    requests.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`Condition not met: ${expression}`);
}
async function navigate(path) {
  const started = performance.now();
  await command("Page.navigate", { url: `${origin}${path}` });
  await waitFor(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('main')`);
  return Math.round(performance.now() - started);
}
const measurements = [];
try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  // Fake identity headers are exclusively sent to localhost in this isolated tab.
  const identity = `local-browser-qa-${randomUUID()}`;
  await command("Network.setExtraHTTPHeaders", { headers: {
    "oai-authenticated-user-id": identity,
    "oai-authenticated-user-email": `${identity}@example.invalid`,
  } });
  await navigate("/app");
  await waitFor("!!document.querySelector('[name=organizationName]')");
  await waitFor("Object.keys(document.querySelector('[name=organizationName]')).some(k=>k.startsWith('__reactProps$'))");
  const setInput = async (selector, value) => {
    await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Missing input');
    input.focus(); input.select();
  })()`);
    await command("Input.insertText", { text: value });
  };
  await setInput("[name=organizationName]", "Espacio QA anonimizado");
  await waitFor("!document.querySelector('.onboarding-form button[type=submit]').disabled");
  await evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (args[0] === '/api/organizations' && response.ok) window.__qaOrg = (await response.clone().json()).organization.id;
      return response;
    };
  })()`);
  await evaluate("document.querySelector('.onboarding-form button[type=submit]').click()");
  await waitFor("!!document.querySelector('.workspace-shell')");
  await waitFor("Object.keys(document.querySelector('.user-avatar')).some(k=>k.startsWith('__reactProps$'))");
  await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  // Wait for hydration; each tested control requires the live event handler.
  await evaluate("document.querySelector('.user-avatar').click()");
  await waitFor("!!document.querySelector('#profile-menu')");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await waitFor("!document.querySelector('#profile-menu')");
  assert.equal(await evaluate("document.activeElement.classList.contains('user-avatar')"), true);

  await navigate("/app/properties/new");
  await waitFor("!!document.querySelector('.property-form')");
  await waitFor("Object.keys(document.querySelector('[aria-label=\"Isla de la vivienda\"]')).some(k=>k.startsWith('__reactProps$'))");
  await evaluate("document.querySelector('.property-form button[type=submit]').focus()");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
  await command("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r" });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  await waitFor("document.activeElement.name === 'alias'");
  assert.equal(await evaluate("document.querySelector('[name=alias]').validity.valueMissing"), true, "native invalid form focuses the missing field");
  await setInput("[name=alias]", "Vivienda QA sin datos personales");
  await setInput("[name=postalCode]", "35540");
  await evaluate("document.querySelector('[aria-label=\"Isla de la vivienda\"]').click()");
  await waitFor("!!document.querySelector('[role=listbox]')");
  await evaluate("[...document.querySelectorAll('.premium-select-option')].find(b => b.innerText.includes('La Graciosa')).click()");
  assert.equal(await evaluate("document.querySelector('[name=municipality]').value"), "Teguise");
  assert.equal(await evaluate("document.querySelector('[data-municipality-search]').readOnly"), true);
  await evaluate("document.querySelector('[aria-label=\"Isla de la vivienda\"]').click()");
  await waitFor("!!document.querySelector('.premium-select-menu')");
  await waitFor("document.activeElement.classList.contains('premium-select-option')");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", text: "t" });
  await waitFor("document.activeElement.innerText.includes('Tenerife')");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
  await waitFor("document.querySelector('[name=islandCode]').value === 'TF'");
  assert.equal(await evaluate("document.getElementById(document.querySelector('[aria-label=\"Isla de la vivienda\"]').getAttribute('aria-describedby')).innerText.includes('Tenerife')"), true, "select exposes its current value to assistive technology");
  assert.equal(await evaluate("document.querySelector('[name=municipality]').value"), "");
  await evaluate("document.querySelector('[aria-label=\"Isla de la vivienda\"]').click()");
  await waitFor("!!document.querySelector('.premium-select-menu')");
  await evaluate("[...document.querySelectorAll('.premium-select-option')].find(b => b.innerText.includes('La Graciosa')).click()");
  // Actual offline failure must leave every input in place.
  await command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate("document.querySelector('.property-form button[type=submit]').click()");
  await waitFor("document.querySelector('.property-form [role=alert]')?.innerText.includes('confirmar')");
  assert.equal(await evaluate("document.querySelector('[name=alias]').value"), "Vivienda QA sin datos personales");
  assert.equal(await evaluate("document.querySelector('[name=municipality]').value"), "Teguise");
  await command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // Lose a successful response AFTER the server commits, then retry the same draft.
  await evaluate(`(() => {
    const original = window.fetch.bind(window); window.__qaRestoreFetch = original; window.__qaCalls = 0;
    window.fetch = async (...args) => {
      if (args[0] !== '/api/properties') return original(...args);
      window.__qaCalls++;
      window.__qaOrg = JSON.parse(args[1].body).organizationId;
      const response = await original(...args);
      window.__qaProperty = (await response.clone().json()).property?.id;
      throw new TypeError('Simulated lost response');
    };
    const form = document.querySelector('.property-form');
    form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
  })()`);
  await waitFor("!!window.__qaProperty && !document.querySelector('.property-form button[type=submit]').disabled");
  assert.equal(await evaluate("window.__qaCalls"), 1, "same-tick double submit must send one request");
  await evaluate("window.fetch = window.__qaRestoreFetch; document.querySelector('.property-form button[type=submit]').click()");
  await waitFor("location.pathname.startsWith('/app/properties/') && !location.pathname.endsWith('/new') && location.search.includes('created=1')");
  await waitFor("document.body.innerText.includes('Vivienda creada')");
  assert.equal(await evaluate("document.body.innerText.includes('Vivienda QA sin datos personales')"), true);
  assert.equal(await evaluate("location.pathname.split('/').at(-1) === window.__qaProperty"), true, "lost response retry must open the original property");
  const propertyId = await evaluate("window.__qaProperty");
  const organizationId = await evaluate("window.__qaOrg");
  assert.ok(organizationId);

  await waitFor("[...document.querySelectorAll('button')].some(b=>b.innerText.includes('Añadir documento'))");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Añadir documento')).click()");
  await waitFor("!!document.querySelector('.document-upload-form')");
  await setInput("[name=documentType]", "Evidencia QA ficticia");
  await evaluate(`(() => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c=>c.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'qa-ficticio.png', {type:'image/png'}));
    document.querySelector('[name=file]').files = transfer.files;
    document.querySelector('[name=anonymizationConfirmed]').click();
  })()`);
  await command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate("document.querySelector('.document-upload-form button[type=submit]').click()");
  await waitFor("document.querySelector('.document-upload-form [role=alert]')?.innerText.includes('confirmar')");
  assert.equal(await evaluate("document.querySelector('[name=file]').files[0].name"), "qa-ficticio.png");
  assert.equal(await evaluate("document.querySelector('[name=documentType]').value"), "Evidencia QA ficticia");
  await command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`(() => {
    const original = window.fetch.bind(window); window.__qaRestoreFetch = original;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (String(args[0]).endsWith('/documents') && args[1]?.method === 'POST' && response.ok) {
        window.__qaUploadCommitted = true; throw new TypeError('Simulated lost upload response');
      }
      return response;
    };
    document.querySelector('.document-upload-form button[type=submit]').click();
  })()`);
  await waitFor("window.__qaUploadCommitted && !document.querySelector('.document-upload-form button[type=submit]').disabled");
  await evaluate("window.fetch = window.__qaRestoreFetch; document.querySelector('.document-upload-form button[type=submit]').click()");
  await waitFor("!document.querySelector('.document-upload-form') && document.body.innerText.includes('Evidencia QA ficticia')");
  assert.equal(await evaluate("[...document.querySelectorAll('.document-row')].filter(e=>e.innerText.includes('Evidencia QA ficticia')).length"), 1);

  for (const path of ["/app", "/app/properties", "/app/alerts", "/app/team", "/app/rules", "/app/audit", "/app/privacy", "/app/operations"]) {
    const started = performance.now();
    await waitFor("!!document.querySelector('.workspace-nav')");
    await evaluate(`document.querySelector('.workspace-nav a[href="${path}"]').click()`);
    await waitFor(`location.pathname === '${path}' && !!document.querySelector('.workspace-nav a[href="${path}"][aria-current="page"]')`);
    measurements.push({ path, localMs: Math.round(performance.now() - started) });
    assert.equal(await evaluate("!!document.querySelector('.workspace-shell')"), true, path);
    for (const width of [390, 1280]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await waitFor(`innerWidth === ${width}`);
      for (const theme of ["light", "dark"]) {
        await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${path} overflow ${width} ${theme}`);
      }
    }
    await evaluate("document.documentElement.style.fontSize = '200%'");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${path} overflow with 200% text`);
    await evaluate("document.documentElement.style.fontSize = ''");
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.querySelector('.mobile-menu').getBoundingClientRect().right <= document.querySelector('.organization-switcher').getBoundingClientRect().left"), true, "mobile header controls must not overlap");
  await evaluate("document.querySelector('.mobile-menu').click()");
  await waitFor("!!document.querySelector('.workspace-sidebar.mobile-open')");
  await waitFor("document.activeElement === document.querySelector('.mobile-menu-close')");
  assert.equal(await evaluate("document.querySelector('main').inert"), true);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", modifiers: 8 });
  assert.equal(await evaluate("document.activeElement === [...document.querySelectorAll('.workspace-sidebar a[href]')].at(-1)"), true, "Shift Tab wraps inside the mobile dialog");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
  assert.equal(await evaluate("document.activeElement === document.querySelector('.mobile-menu-close')"), true, "Tab wraps inside the mobile dialog");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await waitFor("!document.querySelector('.workspace-sidebar.mobile-open')");
  await waitFor("document.activeElement === document.querySelector('.mobile-menu') && !document.querySelector('main').inert");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.workspace-sidebar')).display"), "none");
  await evaluate("document.querySelector('.workspace-skip-link').focus()");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
  await waitFor("document.activeElement.id === 'workspace-content'");

  const volume = await seedVolumeFixture({ organizationId, propertyId, identity });
  const volumeMs = await navigate(`/app/properties/${propertyId}`);
  await waitFor("document.querySelector('.document-pagination')?.innerText.includes('de 237')");
  assert.equal(await evaluate("document.querySelectorAll('.document-row').length"), 20);
  assert.equal(await evaluate("document.querySelectorAll('.comments-list article').length"), 30);
  assert.equal(await evaluate("[...document.querySelectorAll('.document-version-history summary')].some(e=>e.innerText.includes('50 versiones'))"), true);
  await evaluate("[...document.querySelectorAll('.document-version-history')].find(e=>e.querySelector('summary').innerText.includes('50 versiones')).open = true");
  assert.equal(await evaluate("[...document.querySelectorAll('.document-version-history')].find(e=>e.open).querySelectorAll('article').length"), 50);
  for (const width of [390, 1280]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const theme of ["light", "dark"]) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `volume overflow ${width} ${theme}`);
      await evaluate("document.documentElement.style.fontSize = '200%'");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `volume overflow 200% ${width} ${theme}`);
      await evaluate("document.documentElement.style.fontSize = ''");
    }
  }
  await evaluate("document.querySelector('.document-pagination a').click()");
  await waitFor("location.search.includes('documentsPage=2') && document.querySelector('.document-pagination')?.innerText.includes('21–40')");
  await command("Page.navigate", { url: `${origin}/app/properties/${propertyId}?documentsPage=9999` });
  await waitFor("document.querySelector('.document-pagination')?.innerText.includes('Página 12 de 12')");
  assert.equal(await evaluate("document.querySelectorAll('.document-row').length"), 17);
  assert.equal(await evaluate("document.querySelectorAll('.document-pagination a').length"), 1);
  assert.deepEqual(errors, [], "Uncaught browser exceptions");
  console.log(JSON.stringify({ result: "passed", checks: "offline and response-loss recovery; duplicate prevention; onboarding; La Graciosa; profile/mobile Escape; mobile focus trap and restoration; skip link; eight routes; large dossier pagination, long filenames and 50-version history; mobile/desktop, both themes and 200% text", volume, volumeLocalMs: volumeMs, measurements }, null, 2));
} finally {
  await command("Network.setExtraHTTPHeaders", { headers: {} });
  socket.close();
}
