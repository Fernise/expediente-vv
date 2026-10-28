import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appFiles = [
  "../app/app/audit/page.tsx",
  "../app/app/properties/page.tsx",
  "../app/components/PropertyActions.tsx",
  "../app/components/PropertyForm.tsx",
  "../app/components/RuleDraftEditor.tsx",
  "../app/components/RuleEvaluationPanel.tsx",
  "../app/components/TeamManagement.tsx",
];

test("application dropdowns use the visual listbox instead of native selects", async () => {
  const sources = await Promise.all(
    appFiles.map((path) =>
      readFile(new URL(path, import.meta.url), "utf8"),
    ),
  );
  const combined = sources.join("\n");

  assert.doesNotMatch(combined, /<(?:select|option)\b/);
  assert.match(combined, /PremiumSelect/);
  assert.match(combined, /name="islandCode"/);
  assert.match(combined, /name="activityStatus"/);
});

test("the visual listbox preserves forms and keyboard access", async () => {
  const source = await readFile(
    new URL("../app/components/PremiumSelect.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /role="listbox"/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /type="hidden"/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /Home/);
  assert.match(source, /End/);
  assert.match(source, /Escape/);
  assert.match(source, /aria-selected/);
});
