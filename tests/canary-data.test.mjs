import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  municipalityNameForIsland,
  municipalitiesByIsland,
  municipalitiesForIsland,
  municipalitiesMatchingIsland,
} from "../lib/canary-data.ts";

test("the Canary municipality catalog contains the 88 municipalities", () => {
  const uniqueMunicipalities = new Set(
    Object.values(municipalitiesByIsland).flat(),
  );

  assert.equal(uniqueMunicipalities.size, 88);
  assert.equal(municipalitiesForIsland("TF").length, 31);
  assert.equal(municipalitiesForIsland("GC").length, 21);
});

test("municipality lookup is island scoped and accent insensitive", () => {
  assert.equal(
    municipalityNameForIsland("TF", "guimar"),
    "Güímar",
  );
  assert.equal(municipalityNameForIsland("GC", "Güímar"), null);
});

test("La Graciosa resolves to its administrative municipality", () => {
  assert.deepEqual(municipalitiesForIsland("GR"), ["Teguise"]);
});

test("the La Graciosa option explains its Teguise assignment", async () => {
  const form = await readFile(
    new URL("../app/components/PropertyForm.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    form,
    /island\.code === "GR"[\s\S]*Administrativamente pertenece a Teguise/,
  );
  assert.doesNotMatch(
    form,
    /island\.code === "LG"[\s\S]{0,120}Administrativamente pertenece a Teguise/,
  );
});

test("municipality search filters without accepting a new value", () => {
  assert.deepEqual(municipalitiesMatchingIsland("TF", "cruz"), [
    "Puerto de la Cruz",
    "Santa Cruz de Tenerife",
  ]);
  assert.equal(municipalityNameForIsland("TF", "Municipio inventado"), null);
});

test("the property form stores only a selected municipality", async () => {
  const source = await readFile(
    new URL("../app/components/PropertyForm.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /name="municipality" type="hidden" value=\{municipality\}/);
  assert.match(source, /municipalityLocked[\s\S]*aria-readonly="true"/);
  assert.match(source, /setMunicipality\(""\)[\s\S]*setMunicipalityQuery\(""\)/);
  assert.doesNotMatch(source, /list="municipality-options"/);
});
