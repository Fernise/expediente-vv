import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pending navigation resets on query changes and ignores downloads and new tabs", async () => {
  const link = await source("app/components/PendingLink.tsx");
  assert.match(link, /useSearchParams\(\)\.toString\(\)/);
  assert.match(link, /\[pathname, search\]/);
  assert.match(link, /props\.target.*_self/);
  assert.match(link, /props\.download !== undefined/);
  assert.match(link, /destination\.origin !== window\.location\.origin/);
  assert.match(link, /return \(\) => \{\s*if \(fallbackTimer.current\) clearTimeout/);
});

test("menus close on route changes and Escape restores the opener", async () => {
  const shell = await source("app/components/WorkspaceShell.tsx");
  assert.match(shell, /\[pathname, organization.id\]/);
  assert.match(shell, /event.key !== "Escape" \|\| event.defaultPrevented/);
  assert.match(shell, /mobileTrigger.current\?\.focus\(\)/);
  assert.match(shell, /organizationTrigger : profileTrigger/);
  assert.match(shell, /removeEventListener\("keydown", escapeMenu\)/);
});

test("listbox supports accent insensitive typeahead and disabled-state closure", async () => {
  const select = await source("app/components/PremiumSelect.tsx");
  assert.match(select, /if \(disabled\) setOpen\(false\)/);
  assert.match(select, /normalize\("NFD"\)/);
  assert.match(select, /startsWith\(query\)/);
  assert.match(select, /!event.ctrlKey && !event.metaKey && !event.altKey/);
  assert.doesNotMatch(select, /requestAnimationFrame/, "Delayed focus restoration must not steal focus on immediate reopen");
});

test("shared loading and error states are accessible and do not leak server errors", async () => {
  const loading = await source("app/app/loading.tsx");
  const error = await source("app/app/error.tsx");
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /onClick=\{reset\}/);
  assert.match(error, /href="\/app"/);
  assert.doesNotMatch(error, /error\.(message|stack|digest)/);
});

test("mobile menus and long labels have bounded, scrollable layouts", async () => {
  const css = await source("app/refinement.css");
  assert.match(css, /topbar-popover \{ max-height: calc\(100dvh - 100px\); overflow-y: auto/);
  assert.match(css, /organization-popover \{ position: fixed; left: 16px; right: 16px/);
  assert.match(css, /overflow-wrap: anywhere; white-space: normal/);
});
