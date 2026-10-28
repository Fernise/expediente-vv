// Explicit mechanical JSX migration: translates only authored interface text.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
const files = [];
function walk(directory) {
  for (const name of fs.readdirSync(directory)) {
    const filename = path.join(directory, name);
    if (fs.statSync(filename).isDirectory()) walk(filename);
    else if (filename.endsWith(".tsx") && !filename.endsWith("Language.tsx")) files.push(filename);
  }
}
walk("app");
const keys = [];
const parsed = files.map(filename => {
  const source = fs.readFileSync(filename, "utf8");
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxText(node)) {
      const key = node.text.replace(/\s+/g, " ").trim();
      if (key && /[a-zA-Záéíóúñ]/.test(key) && !keys.includes(key)) keys.push(key);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { filename, source, ast };
});
const english = fs.readFileSync("scripts/ui-translations-en.txt", "utf8").trim().split("\n");
assert.equal(keys.length, english.length, "The reviewed catalogue must match each authored text exactly");
const catalog = Object.fromEntries(keys.map((key, index) => [key, english[index]]));
fs.writeFileSync("lib/ui-catalog.json", JSON.stringify(catalog, null, 2) + "\n");
for (const { filename, source, ast } of parsed) {
  const edits = [];
  let controls = false;
  function visit(node) {
    if (ts.isJsxText(node)) {
      const key = node.text.replace(/\s+/g, " ").trim();
      if (catalog[key]) edits.push({ start: node.pos, end: node.end, value: `<I18nText>{${JSON.stringify(node.text)}}</I18nText>` });
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      if (/^[a-z]/.test(tag) && node.attributes.properties.some(p => ts.isJsxAttribute(p) && ["placeholder", "title", "aria-label", "alt"].includes(p.name.getText(ast)))) {
        controls = true;
        edits.push({ start: node.tagName.getStart(ast), end: node.tagName.end, value: `LocalizedControl as=${JSON.stringify(tag)}` });
        if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) edits.push({ start: node.parent.closingElement.tagName.getStart(ast), end: node.parent.closingElement.tagName.end, value: "LocalizedControl" });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!edits.length) continue;
  let output = source;
  for (const edit of edits.sort((a,b) => b.start-a.start)) output = output.slice(0,edit.start)+edit.value+output.slice(edit.end);
  const line = `\nimport { I18nText${controls ? ", LocalizedControl" : ""} } from "@/app/components/Language";\n`;
  const directive = output.startsWith('"use client";') ? output.indexOf("\n") : 0;
  output = output.slice(0,directive)+line+output.slice(directive);
  fs.writeFileSync(filename, output);
}
console.log(`${keys.length} reviewed interface texts localised; user records and form values untouched.`);
