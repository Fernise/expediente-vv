import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the public rework uses purposeful motion with a reduced-motion fallback", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /hero-proofline/);
  assert.doesNotMatch(page, /floating-note/);
  assert.match(styles, /@keyframes public-rise-in/);
  assert.match(styles, /animation-timeline: view\(\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation-duration: 0\.01ms !important/);
});
