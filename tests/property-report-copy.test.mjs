import assert from 'node:assert/strict';
import test from 'node:test';
import {reportText} from '../lib/property-report-copy.ts';
test('report terminology translates statuses, warnings and empty states in both languages',()=>{
  for(const [es,en] of [['Documentos','Documents'],['Requiere revisión profesional','Professional review required'],['Observado','Issues noted'],['No hay decisiones profesionales registradas.','No professional decisions have been recorded.'],['INFORME ORIENTATIVO · BORRADOR NO VALIDADO','ADVISORY REPORT · UNVALIDATED DRAFT']]){
    assert.equal(reportText(es,'en'),en);assert.equal(reportText(es,'es'),es);
  }
  assert.equal(reportText('Alias ficticio sin traducir','en'),'Alias ficticio sin traducir');
});
test('report export validates language and declares the actual download language',async()=>{
  const {readFile}=await import('node:fs/promises');
  const route=await readFile(new URL('../app/api/properties/[id]/report/route.ts',import.meta.url),'utf8');
  assert.match(route,/locale!=="es"&&locale!=="en"/);
  assert.match(route,/"content-language": locale/);
  const component=await readFile(new URL('../app/components/ReportDownloadControls.tsx',import.meta.url),'utf8');
  assert.match(component,/&lang=\$\{reportLocale\}/);
  assert.match(component,/value:"en",label:"English",translate:false/);
});
