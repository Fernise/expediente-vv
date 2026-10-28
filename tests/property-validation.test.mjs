import assert from "node:assert/strict";
import test from "node:test";
import {propertyFieldErrors,validContactEmail} from "../lib/property-validation.ts";
const valid={alias:"VV-DEMO",ownerName:"Propietario 02",islandCode:"TF",municipality:"Santa Cruz de Tenerife",postalCode:"38001",dataProfile:"pilot_anonymized",ownerEmail:"propietario02@example.invalid",addressLine:"Calle Ejemplo 1",nextActionDueAt:"2026-10-09"};
test("the property validator returns every field error, not just the first",()=>{
  assert.deepEqual(propertyFieldErrors(valid),{});
  const errors=propertyFieldErrors({...valid,alias:"",postalCode:"35001",ownerEmail:"bad@",municipality:"Teguise",nextActionDueAt:"2026-02-30"});
  for(const field of ["alias","postalCode","ownerEmail","municipality","nextActionDueAt"])assert.ok(errors[field]);
});
test("postal codes must match the island province, without claiming municipal verification",()=>{
  assert.ok(propertyFieldErrors({...valid,islandCode:"GC",municipality:"Las Palmas de Gran Canaria",postalCode:"38001"}).postalCode);
  assert.equal(propertyFieldErrors({...valid,islandCode:"GC",municipality:"Las Palmas de Gran Canaria",postalCode:"35001"}).postalCode,undefined);
  assert.ok(propertyFieldErrors({...valid,postalCode:"1234"}).postalCode);
  assert.equal(propertyFieldErrors({...valid,postalCode:"38999"}).postalCode,undefined,"province coherence alone does not confirm the municipality");
});
test("email syntax catches malformed labels and local parts, not mailbox existence",()=>{
  for(const email of ["","person@example.invalid","first.last+tag@example.com"])assert.equal(validContactEmail(email),true,email);
  for(const email of ["person@","@example.com","p@localhost",".p@example.com","p..q@example.com","p@-example.com","p@example-.com","p@example..com","p@exa mple.com"])assert.equal(validContactEmail(email),false,email);
  assert.ok(propertyFieldErrors({...valid,ownerEmail:"person@gmail.com"}).ownerEmail,"private beta still blocks real contacts");
});
