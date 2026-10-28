import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production fonts use stable public URLs instead of workstation paths", async () => {
  const [layout, styles, displayFont, bodyFont] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/fonts/manrope-latin.woff2", import.meta.url)),
    readFile(new URL("../public/fonts/dm-sans-latin.woff2", import.meta.url)),
  ]);

  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.match(styles, /url\("\/fonts\/manrope-latin\.woff2"\)/);
  assert.match(styles, /url\("\/fonts\/dm-sans-latin\.woff2"\)/);
  assert.doesNotMatch(styles, /\/Users\//);
  assert.equal(woff2Signature(displayFont), "wOF2");
  assert.equal(woff2Signature(bodyFont), "wOF2");
});

function woff2Signature(buffer) {
  return buffer.subarray(0, 4).toString("ascii");
}
