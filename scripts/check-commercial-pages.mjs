import assert from "node:assert/strict";
const origin = "http://localhost:3000";
const id = `commercial-qa-${crypto.randomUUID()}`;
const headers = { "oai-authenticated-user-id": id, "oai-authenticated-user-email": `${id}@example.invalid` };
for (const language of ["es", "en"]) {
  for (const slug of ["aviso-legal", "privacidad", "condiciones", "fuentes-oficiales"]) {
    const response = await fetch(`${origin}/legal/${slug}`, {headers: {cookie: `expediente-vv-language=${language}`}});
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`lang="${language}"`));
    assert.ok(html.includes(language === "en" ? "Provisional private-beta information" : "Información provisional de la beta privada"));
    assert.ok(html.includes("2026-10-09-draft"));
    assert.ok(html.includes("/legal/condiciones"));
  }
}
assert.equal((await fetch(`${origin}/legal/constructor`)).status, 404);
const create = await fetch(`${origin}/api/organizations`, {method:"POST",headers:{...headers,"content-type":"application/json",origin},body:JSON.stringify({name:"Workspace commercial QA"})});
assert.equal(create.status, 201);
const {organization} = await create.json();
const licence = await fetch(`${origin}/app/license`, {headers:{...headers,cookie:`expediente-vv-active-organization=${organization.id}; expediente-vv-language=en`}});
assert.equal(licence.status,200);
const html = await licence.text();
assert.ok(html.includes("Workspace commercial QA"));
assert.ok(html.includes("Workspace usage"));
assert.ok(html.includes("Checkout, paid upgrades and invoice generation are not enabled."));
assert.ok(html.includes("/app/team") && html.includes("/app/privacy"));
console.log(JSON.stringify({result:"passed",checks:"all legal routes in ES/EN; invalid route 404; authenticated workspace-scoped pilot licence; administration usage; no paid checkout"}));
