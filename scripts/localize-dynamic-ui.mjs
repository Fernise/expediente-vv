// Mechanical follow-up: only known interface expressions; never stored user content.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
function walk(directory) {
  for (const name of fs.readdirSync(directory)) {
    const filename = path.join(directory, name);
    if (fs.statSync(filename).isDirectory()) { walk(filename); continue; }
    if (!filename.endsWith(".tsx") || filename.endsWith("Language.tsx")) continue;
    let source = fs.readFileSync(filename, "utf8");
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];
    function visit(node) {
      if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent) && !(ts.isJsxElement(node.parent) && node.parent.openingElement.tagName.getText(ast)==="I18nText")) {
        const expression = node.expression;
        const text = expression.getText(ast);
        const named = /^(?:error|notice|message|label|action|sectionLabel|item\.(?:question|help)|result\.(?:status|explanation)|outcome\.text|stat\.(?:label|hint))$/.test(text);
        const knownLookup = /^(?:checklistStatusLabels|dossierStatusLabels|roleLabels|decisionLabels)\[/.test(text);
        const knownFormatter = /^(?:roleLabel|activityLabel|documentSecurityStatus|documentVersionStatus|reviewDecisionLabel|factValueLabel|evaluationStatusLabel|deliveryStatusLabel|editorialStatusLabel)\(/.test(text);
        const stringBranches = n => ts.isStringLiteral(n) || (ts.isConditionalExpression(n) && stringBranches(n.whenTrue) && stringBranches(n.whenFalse));
        if (named || knownLookup || knownFormatter || (ts.isConditionalExpression(expression) && stringBranches(expression))) {
          edits.push({ start:node.getStart(ast), end:node.end, value:`<I18nText>{${text}}</I18nText>` });
          return;
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
    if (!edits.length) continue;
    for (const edit of edits.sort((a,b)=>b.start-a.start)) source=source.slice(0,edit.start)+edit.value+source.slice(edit.end);
    if (!source.includes("import { I18nText")) {
      const point=source.startsWith('"use client";')?source.indexOf("\n"):0;
      source=source.slice(0,point)+'\nimport { I18nText } from "@/app/components/Language";\n'+source.slice(point);
    }
    fs.writeFileSync(filename,source);
  }
}
walk("app");
