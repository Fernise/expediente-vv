import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function luminance(hex) {
  const values = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("primary, secondary and status text tokens meet normal-text contrast on working surfaces", async () => {
  const css = await readFile(new URL("../app/theme.css", import.meta.url), "utf8");
  const light = css.match(/:root\s*\{([^}]+)\}/)[1];
  const dark = css.match(/html\[data-theme="dark"\]\s*\{([^}]+)\}/)[1];
  const colors = block => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gi)].map(m => [m[1], m[2]]));
  for (const [name, block, surfaces] of [
    ["light", light, ["#ffffff", "#f1f4f8", "#e4e9f1"]],
    ["dark", dark, ["#161f2e", "#101722", "#111a27"]],
  ]) {
    const tokens = colors(block);
    for (const token of ["--ink", "--ink-soft", "--theme-muted", "--theme-accent-text", "--theme-warning-text", "--theme-danger-text", "--theme-success-text"]) {
      assert.ok(tokens[token], `${name}: ${token}`);
      for (const background of surfaces) assert.ok(contrast(tokens[token], background) >= 4.5, `${name} ${token} on ${background}`);
    }
  }
});
