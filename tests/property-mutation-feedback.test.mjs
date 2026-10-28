import assert from "node:assert/strict";
import test from "node:test";
import {propertyMutationFailureMessage,uncertainMutationMessage} from "../lib/mutation-request.ts";
test("local network failures explain how to restore preview without promising no creation occurred",()=>{
  for(const host of ["localhost","127.0.0.1","[::1]"])assert.match(propertyMutationFailureMessage(new TypeError("Failed to fetch"),host),/servidor local[\s\S]*npm run dev[\s\S]*por si la creación se completó/);
  assert.equal(propertyMutationFailureMessage(new TypeError("Failed to fetch"),"expediente-vv-piloto.docentesec.chatgpt.site"),uncertainMutationMessage);
  assert.match(propertyMutationFailureMessage(new SyntaxError("Unexpected token"),"localhost"),/respuesta que no pudimos leer/);
  assert.equal(propertyMutationFailureMessage(new Error("unknown"),"localhost"),uncertainMutationMessage);
});
