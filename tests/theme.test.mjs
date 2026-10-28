import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { resolveTheme, THEME_STORAGE_KEY, themeInitializationScript } from "../lib/theme.ts";

test("the default stays light, including missing or invalid preferences", () => {
  for (const value of [null, undefined, "system", "", {}, "light"]) assert.equal(resolveTheme(value), "light");
  assert.equal(resolveTheme("dark"), "dark");
});

test("the initial paint restores only a valid saved dark preference", () => {
  for (const saved of [null, "light", "dark", "invalid"]) {
    const document = { documentElement: { dataset: {} } };
    vm.runInNewContext(themeInitializationScript, {
      document,
      localStorage: { getItem: key => { assert.equal(key, THEME_STORAGE_KEY); return saved; } },
    });
    assert.equal(document.documentElement.dataset.theme, resolveTheme(saved));
  }
});

test("storage restrictions do not prevent the initial page from rendering", () => {
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(themeInitializationScript, {
    document,
    localStorage: { getItem: () => { throw new Error("Storage blocked"); } },
  });
  assert.equal(document.documentElement.dataset.theme, "light");
});

test("every shared semantic color has a defined dark counterpart", async () => {
  const theme = await readFile(new URL("../app/theme.css", import.meta.url), "utf8");
  const defined = new Set([...theme.matchAll(/(--theme-[\w-]+)\s*:/g)].map(match => match[1]));
  for (const path of ["../app/globals.css", "../app/refinement.css"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    for (const match of source.matchAll(/var\((--theme-[\w-]+)/g)) {
      assert.ok(defined.has(match[1]), `${path}: missing dark color ${match[1]}`);
    }
  }
});
