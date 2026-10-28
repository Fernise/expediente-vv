import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type { PropertyDossier } from "../db/properties.ts";
import type { PropertyRulesWorkspace } from "../db/rules.ts";
import { islandName } from "./canary-data.ts";
import { reportText, type ReportLocale } from "./property-report-copy.ts";
import {
  checklistStatusLabels,
  dossierStatusLabels,
} from "./property-status.ts";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_LIMIT = 64;

const teal = rgb(0.208, 0.349, 0.655);
const tealSoft = rgb(0.952, 0.965, 0.984);
const coral = rgb(0.25, 0.31, 0.4);
const coralSoft = rgb(0.967, 0.973, 0.98);
const ink = rgb(0.09, 0.13, 0.19);
const inkSoft = rgb(0.24, 0.29, 0.35);
const muted = rgb(0.36, 0.41, 0.47);
const line = rgb(0.83, 0.85, 0.88);
const paper = rgb(0.952, 0.965, 0.984);
const white = rgb(1, 1, 1);

type InfoField = { label: string; value: string };

export async function createPropertyReport(input: {
  dossier: PropertyDossier;
  generatedAt?: Date;
  organizationName: string;
  laboratory?: PropertyRulesWorkspace | null;
  locale?: ReportLocale;
}): Promise<Uint8Array> {
  const locale=input.locale??"es";
  const t=(value:string)=>reportText(value,locale);
  const date=(value:string)=>formatDate(value,locale);
  const generatedAt = input.generatedAt ?? new Date();
  const document = await PDFDocument.create();
  document.setTitle(`${t("Informe orientativo")} - ${input.dossier.alias}`);
  document.setAuthor("Expediente VV");
  document.setSubject(t("Situación documental orientativa del expediente"));
  document.setLanguage(locale);
  document.setCreator("Expediente VV");

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = drawPageHeader(page, regular, bold, input.organizationName,locale);

  const addPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = drawPageHeader(page, regular, bold, input.organizationName,locale);
  };
  const requireSpace = (needed: number) => {
    if (y - needed < FOOTER_LIMIT) addPage();
  };
  const sectionTitle = (number: string, title: string, detail?: string) => {
    requireSpace(detail ? 96 : 83);
    y -= 34;
    page.drawLine({start:{x:MARGIN,y:y+24},end:{x:PAGE_WIDTH-MARGIN,y:y+24},color:line,thickness:0.65});
    page.drawText(number, {
      color: coral,
      font: bold,
      size: 7.5,
      x: MARGIN,
      y,
    });
    page.drawText(pdfText(t(title)), {
      color: ink,
      font: bold,
      size: 14,
      x: MARGIN + 25,
      y: y - 2,
    });
    if (detail) {
      page.drawText(fitText(pdfText(detail), regular, 7.8, CONTENT_WIDTH - 25), {
        color: muted,
        font: regular,
        size: 7.8,
        x: MARGIN + 25,
        y: y - 22,
      });
      y -= 22;
    }
    y -= 32;
  };
  drawReportIntro();
  drawIdentity();
  drawNextAction();
  addPage();
  drawChecklist();
  drawDocuments();
  drawReviews();
  drawLaboratory();
  drawScope();

  const pages = document.getPages();
  pages.forEach((reportPage, index) => {
    drawFooter(
      reportPage,
      regular,
      input.dossier.internalReference,
      index + 1,
      pages.length,
    );
  });

  return document.save();

  function drawReportIntro() {
    page.drawText(t(input.dossier.checklist.validationStatus==="draft_unvalidated"?"INFORME ORIENTATIVO · BORRADOR NO VALIDADO":"INFORME ORIENTATIVO"), {
      color: coral,
      font: bold,
      size: 8,
      x: MARGIN,
      y,
    });
    y -= 34;
    const titleLines = wrapText(
      pdfText(input.dossier.alias),
      bold,
      27,
      CONTENT_WIDTH,
    );
    titleLines.forEach((lineText) => {
      page.drawText(lineText, {
        color: ink,
        font: bold,
        size: 27,
        x: MARGIN,
        y,
      });
      y -= 32;
    });
    page.drawText(input.dossier.internalReference, {
      color: teal,
      font: bold,
      size: 9,
      x: PAGE_WIDTH-MARGIN-bold.widthOfTextAtSize(input.dossier.internalReference,9),
      y: y + 3,
    });
    page.drawText(`${locale==="en"?"Generated on":"Generado el"} ${date(generatedAt.toISOString())}`, {
      color: muted,
      font: regular,
      size: 8.3,
      x: MARGIN,
      y: y + 3,
    });
    y -= 18;

    const reviewedItems = input.dossier.checklistItems.filter(
      (item) => item.itemKind!=="operational" && item.workflowStatus === "reviewed",
    ).length;
    const status = t(dossierStatusLabels[input.dossier.dossierStatus]);
    page.drawRectangle({
      borderColor: line,
      borderWidth: 0.7,
      color: coralSoft,
      height: 86,
      width: CONTENT_WIDTH,
      x: MARGIN,
      y: y - 80,
    });
    page.drawRectangle({
      color: teal,
      height: 86,
      width: 2,
      x: MARGIN,
      y: y - 80,
    });
    page.drawText(t("ESTADO ORIENTATIVO"), {
      color: muted,
      font: bold,
      size: 7.2,
      x: MARGIN + 19,
      y: y - 19,
    });
    page.drawText(fitText(pdfText(status), bold, 12, CONTENT_WIDTH-170), {
      color: ink,
      font: bold,
      size: 12,
      x: MARGIN + 19,
      y: y - 40,
    });
    page.drawText(t("REVISIÓN PROFESIONAL"), {
      color: muted,
      font: bold,
      size: 7.2,
      x: PAGE_WIDTH - MARGIN - 126,
      y: y - 19,
    });
    page.drawText(
      `${reviewedItems} ${locale==="en"?"of":"de"} ${input.dossier.checklistItems.filter(item=>item.itemKind!=="operational").length} ${locale==="en"?"reviewed":"revisados"}`,
      {
        color: teal,
        font: bold,
        size: 10,
        x: PAGE_WIDTH - MARGIN - 126,
        y: y - 39,
      },
    );
    const operations=input.dossier.checklistItems.filter(item=>item.itemKind==="operational");
    const operationalSummary=operations.length?`${operations.filter(item=>item.workflowStatus==="completed").length}/${operations.length} ${locale==="en"?"operational tasks completed":"tareas operativas completadas"}`:locale==="en"?"No operational tasks":"Sin tareas operativas";
    page.drawText(`${operationalSummary} · ${input.dossier.documents.length} ${locale==="en"?"document":"documento"}${input.dossier.documents.length===1?"":"s"}`,{font:regular,size:8,color:muted,x:MARGIN+19,y:y-65});
    y -= 97;
  }

  function drawIdentity() {
    sectionTitle("01", "Datos del expediente");
    const location = `${input.dossier.municipality}, ${islandName(input.dossier.islandCode)}`;
    const isPilot = input.dossier.dataProfile === "pilot_anonymized";
    const fields: InfoField[] = [
      { label: "LOCALIZACIÓN", value: location },
      { label: "CÓDIGO POSTAL", value: input.dossier.postalCode },
      {
        label: "PERFIL DE DATOS",
        value: t(isPilot ? "Prueba anonimizada" : "Operativo"),
      },
      { label: "ESTADO DE ACTIVIDAD", value: t(activityLabel(input.dossier.activityStatus)) },
      {
        label: "DIRECCIÓN",
        value: isPilot
          ? input.dossier.addressLine ? `${input.dossier.addressLine} (${t("ficticia")})` : t("No indicada (prueba)")
          : input.dossier.addressLine || t("No indicada"),
      },
      { label: "PROPIETARIO", value: input.dossier.ownerName },
      { label: "RESPONSABLE", value: input.dossier.managerName },
      {
        label: "REFERENCIA CATASTRAL",
        value: isPilot
          ? input.dossier.cadastralReference ? `${input.dossier.cadastralReference} (${t("prueba")})` : t("No indicada (prueba)")
          : input.dossier.cadastralReference || t("No indicada"),
      },
    ];
    drawFieldGrid(fields);
  }

  function drawFieldGrid(fields: InfoField[]) {
    const gap = 24;
    const cellWidth = (CONTENT_WIDTH - gap) / 2;
    for (let index = 0; index < fields.length; index += 2) {
      const pair = fields.slice(index, index + 2);
      const valueLines = pair.map((field) =>
        wrapText(pdfText(field.value || t("No indicado")), regular, 10, cellWidth - 8),
      );
      const rowHeight = Math.max(
        48,
        ...valueLines.map((lines) => 29 + lines.length * 13),
      );
      requireSpace(rowHeight + 8);
      pair.forEach((field, pairIndex) => {
        const x = MARGIN + pairIndex * (cellWidth + gap);
        page.drawLine({start:{x,y:y-rowHeight},end:{x:x+cellWidth,y:y-rowHeight},color:line,thickness:0.45});
        page.drawText(t(field.label), {
          color: muted,
          font: bold,
          size: 6.8,
          x,
          y: y - 12,
        });
        valueLines[pairIndex].forEach((text, lineIndex) => {
          page.drawText(text, {
            color: ink,
            font: regular,
            size: 10,
            x,
            y: y - 29 - lineIndex * 13,
          });
        });
      });
      y -= rowHeight + 8;
    }
  }

  function drawNextAction() {
    const action =
      input.dossier.nextAction ?? t("No se ha definido una siguiente acción.");
    const actionLines = wrapText(pdfText(action), bold, 11, CONTENT_WIDTH - 146);
    const cardHeight = Math.max(62, 28 + actionLines.length * 14);
    requireSpace(cardHeight + 83);
    sectionTitle("02", "Siguiente acción");
    page.drawRectangle({
      borderColor: line,
      borderWidth: 0.6,
      color: coralSoft,
      height: cardHeight,
      width: CONTENT_WIDTH,
      x: MARGIN,
      y: y - cardHeight,
    });
    page.drawRectangle({
      color: teal,
      height: cardHeight,
      width: 4,
      x: MARGIN,
      y: y - cardHeight,
    });
    actionLines.forEach((text, index) => {
      page.drawText(text, {
        color: ink,
        font: bold,
        size: 11,
        x: MARGIN + 16,
        y: y - 23 - index * 14,
      });
    });
    const dateLabel = input.dossier.nextActionDueAt
      ? date(input.dossier.nextActionDueAt)
      : t("Sin fecha objetivo");
    page.drawText(t("FECHA OBJETIVO"), {
      color: muted,
      font: bold,
      size: 6.8,
      x: PAGE_WIDTH - MARGIN - 116,
      y: y - 20,
    });
    page.drawText(fitText(dateLabel, bold, 8.8, 104), {
      color: coral,
      font: bold,
      size: 8.8,
      x: PAGE_WIDTH - MARGIN - 116,
      y: y - 36,
    });
    y -= cardHeight + 10;
  }

  function drawChecklist() {
    requireSpace(220);
    sectionTitle(
      "03",
      "Checklist",
      `${input.dossier.checklist.ruleVersionLabel} · ${date(input.dossier.checklist.generatedAt)}`,
    );
    const orderedItems=[...input.dossier.checklistItems.filter(item=>item.itemKind==="operational"),...input.dossier.checklistItems.filter(item=>item.itemKind!=="operational")];
    orderedItems.forEach((item, index) => {
      const titleLines = wrapText(pdfText(item.title), bold, 10.5, CONTENT_WIDTH-142);
      const explanationLines = wrapText(
        pdfText(item.explanation),
        regular,
        9,
        CONTENT_WIDTH - 28,
      );
      const responsibility=item.assigneeName??t("Sin asignar");
      const metadataLines=wrapText(pdfText(`${t("Responsable")}: ${responsibility}${item.dueAt?` · ${date(item.dueAt)}`:""}`),regular,8,CONTENT_WIDTH-28);
      const itemHeight = Math.max(76,48+titleLines.length*14+explanationLines.length*12+metadataLines.length*11);
      const groupStart=index===0 || orderedItems[index-1].itemKind!==item.itemKind;
      const previousPage=page;
      requireSpace(itemHeight + (groupStart?36:8));
      if(groupStart || previousPage!==page){page.drawText(`${t(item.itemKind==="operational"?"Tareas operativas":"Requisitos para revisión profesional")}${!groupStart?` · ${t("continuación")}`:""}`,{font:bold,size:10,color:teal,x:MARGIN,y:y-10});y-=30;}
      page.drawLine({start:{x:MARGIN,y:y-itemHeight},end:{x:PAGE_WIDTH-MARGIN,y:y-itemHeight},color:line,thickness:0.5});
      const number = String(index + 1).padStart(2, "0");
      page.drawText(number, {
        color: teal,
        font: bold,
        size: 7.2,
        x: MARGIN,
        y: y - 29,
      });
      page.drawText(fitText(pdfText(item.category.toUpperCase()),bold,7,CONTENT_WIDTH-155), {
        color: coral,
        font: bold,
        size: 7,
        x: MARGIN + 26,
        y: y - 12,
      });
      drawStatusPill(
        page,
        bold,
        t(checklistStatusLabels[item.workflowStatus]),
        PAGE_WIDTH - MARGIN - 126,
        y - 34,
      );
      titleLines.forEach((text, lineIndex) => {
        page.drawText(text, {
          color: ink,
          font: bold,
          size: 10.5,
          x: MARGIN + 26,
          y: y - 29 - lineIndex * 14,
        });
      });
      const explanationY = y - 37 - titleLines.length * 14;
      explanationLines.forEach((text, lineIndex) => {
        page.drawText(text, {
          color: muted,
          font: regular,
          size: 9,
          x: MARGIN + 26,
          y: explanationY - lineIndex * 12,
        });
      });
      metadataLines.forEach((text,index)=>page.drawText(text,{color:muted,font:regular,size:8,x:MARGIN+26,y:y-itemHeight+13+(metadataLines.length-1-index)*11}));
      y -= itemHeight + 12;
    });
  }

  function drawDocuments() {
    requireSpace(200);
    sectionTitle(
      "04",
      "Documentos",
      `${input.dossier.documents.length} ${locale==="en"?"registered":`registrado${input.dossier.documents.length === 1 ? "" : "s"}`}`,
    );
    if (input.dossier.documents.length === 0) {
      requireSpace(48);
      page.drawRectangle({
        borderColor: line,
        borderWidth: 0.6,
        color: white,
        height: 44,
        width: CONTENT_WIDTH,
        x: MARGIN,
        y: y - 44,
      });
      page.drawText(t("No hay documentos registrados en el expediente."), {
        color: muted,
        font: regular,
        size: 8.8,
        x: MARGIN + 14,
        y: y - 26,
      });
      y -= 54;
      return;
    }
    input.dossier.documents.forEach((item, index) => {
      const linkedRequirements = (input.dossier.evidenceLinks ?? [])
        .filter((link) => link.documentId === item.id)
        .map((link) => input.dossier.checklistItems.find((requirement) => requirement.id === link.checklistItemId)?.title)
        .filter((title): title is string => Boolean(title));
      const filenameLines = wrapText(
        pdfText(item.originalFilename),
        regular,
        7.8,
        315,
      );
      const cardHeight = Math.max(72, 57 + (filenameLines.length - 1) * 10);
      requireSpace(cardHeight + 7);
      page.drawRectangle({
        borderColor: line,
        borderWidth: 0.6,
        color: white,
        height: cardHeight,
        width: CONTENT_WIDTH,
        x: MARGIN,
        y: y - cardHeight,
      });
      page.drawText(String(index + 1).padStart(2, "0"), {
        color: coral,
        font: bold,
        size: 7.2,
        x: MARGIN + 13,
        y: y - 20,
      });
      page.drawText(fitText(pdfText(item.documentType), bold, 9.2, 300), {
        color: ink,
        font: bold,
        size: 9.2,
        x: MARGIN + 42,
        y: y - 20,
      });
      filenameLines.forEach((text, lineIndex) => {
        page.drawText(text, {
          color: muted,
          font: regular,
          size: 7.8,
          x: MARGIN + 42,
          y: y - 36 - lineIndex * 10,
        });
      });
      page.drawText(fitText(t(securityLabel(item.malwareScanStatus)),bold,7.6,125), {
        color:
          item.malwareScanStatus === "clean" ||
          item.malwareScanStatus === "structural_only"
            ? teal
            : coral,
        font: bold,
        size: 7.6,
        x: PAGE_WIDTH - MARGIN - 132,
        y: y - 20,
      });
      const documentDate = item.expiresAt
        ? `${t("Vence")}: ${date(item.expiresAt)}`
        : `${t("Subido")}: ${date(item.uploadedAt)}`;
      page.drawText(fitText(documentDate, regular, 7.4, 132), {
        color: muted,
        font: regular,
        size: 7.4,
        x: PAGE_WIDTH - MARGIN - 132,
        y: y - 37,
      });
      page.drawText(fitText(pdfText(linkedRequirements.length
        ? `${t("Respalda")}: ${linkedRequirements.join(" · ")}` : t("Sin requisito vinculado")), regular, 7.1, CONTENT_WIDTH - 58), {
        color: muted,
        font: regular,
        size: 7.1,
        x: MARGIN + 42,
        y: y - cardHeight + 12,
      });
      y -= cardHeight + 7;
    });
  }

  function drawReviews() {
    const reviews = input.dossier.reviews ?? [];
    requireSpace(reviews.length ? 225 + wrapText(pdfText(reviews[0].observation),regular,9.2,CONTENT_WIDTH-28).length*13 : 170);
    sectionTitle(
      "05",
      "Revisiones profesionales",
      `${reviews.filter((review) => !review.invalidatedAt).length} ${locale==="en"?"current":`vigente${reviews.filter((review) => !review.invalidatedAt).length === 1 ? "" : "s"}`}`,
    );
    if (!reviews.length) {
      requireSpace(48);
      page.drawRectangle({
        borderColor: line,
        borderWidth: 0.6,
        color: white,
        height: 44,
        width: CONTENT_WIDTH,
        x: MARGIN,
        y: y - 44,
      });
      page.drawText(t("No hay decisiones profesionales registradas."), {
        color: muted,
        font: regular,
        size: 8.8,
        x: MARGIN + 14,
        y: y - 26,
      });
      y -= 54;
      return;
    }
    reviews.forEach((review) => {
      const taskTitle=input.dossier.checklistItems.find(item=>item.id===review.checklistItemId)?.title ?? t("Tarea no disponible");
      const observationLines = wrapText(
        pdfText(review.observation),
        regular,
        9.2,
        CONTENT_WIDTH - 28,
      );
      const reviewDetails=wrapText(pdfText(`${review.reviewerName} · ${date(review.reviewedAt)}`),regular,8,CONTENT_WIDTH-28);
      const taskDetails=wrapText(pdfText(`${t("Tarea")}: ${taskTitle}`),bold,8.5,CONTENT_WIDTH-28);
      const fileDetails=wrapText(pdfText(`${review.documentType} · ${review.originalFilename} · ${t("versión")} ${review.documentVersionId.slice(0,12)}`),regular,8,CONTENT_WIDTH-28);
      const observationOffset=43+(reviewDetails.length+taskDetails.length+fileDetails.length)*12;
      const cardHeight = observationOffset + 25 + observationLines.length * 13;
      requireSpace(cardHeight + 7);
      page.drawRectangle({
        borderColor: line,
        borderWidth: 0.7,
        color: white,
        height: cardHeight,
        width: CONTENT_WIDTH,
        x: MARGIN,
        y: y - cardHeight,
      });
      page.drawText(t(reviewDecisionLabel(review.decision, Boolean(review.invalidatedAt))), {
        color: review.invalidatedAt ? muted : teal,
        font: bold,
        size: 8.6,
        x: MARGIN + 14,
        y: y - 20,
      });
      let detailY=y-38;
      for(const [lines,font,size] of [[reviewDetails,regular,8],[taskDetails,bold,8.5],[fileDetails,regular,8]] as const){
        for(const text of lines){page.drawText(text,{color:inkSoft,font,size,x:MARGIN+14,y:detailY});detailY-=12;}
      }
      observationLines.forEach((text, index) => {
        page.drawText(text, {
          color: inkSoft,
          font: regular,
          size: 9.2,
          x: MARGIN + 14,
          y: y - observationOffset - index * 13,
        });
      });
      if(review.invalidatedAt)page.drawText(fitText(pdfText(`${t("Invalidada")}: ${date(review.invalidatedAt)} · ${review.invalidationReason??t("Cambio de evidencia")}`),regular,7,CONTENT_WIDTH-28),{color:muted,font:regular,size:7,x:MARGIN+14,y:y-cardHeight+12});
      y -= cardHeight + 7;
    });
  }

  function drawScope() {
    const warning =
      "Este informe refleja los datos guardados en el momento de su generación. Editar el expediente exige generar una nueva copia; los PDF anteriores no se actualizan. No incorpora comentarios internos ni archivos adjuntos. Las reglas del laboratorio son borradores no validados y sus sugerencias no modifican el checklist automáticamente. Responsable significa coordinador del expediente; las decisiones identifican al profesional que las registró. No contiene una firma digital y no equivale a una certificación administrativa o jurídica.";
    const languageNote=locale==="en"?"Dossier names, task descriptions and evidence text remain in their original language. ":"Los nombres, descripciones y textos de evidencias se conservan en su idioma original. ";
    const lines = wrapText(pdfText(languageNote+t(warning)), regular, 8.4, CONTENT_WIDTH - 32);
    const boxHeight = 24 + lines.length * 12;
    requireSpace(boxHeight + 83);
    sectionTitle("07", "Alcance del informe");
    page.drawRectangle({
      borderColor: line,
      borderWidth: 0.6,
      color: tealSoft,
      height: boxHeight,
      width: CONTENT_WIDTH,
      x: MARGIN,
      y: y - boxHeight,
    });
    lines.forEach((text, index) => {
      page.drawText(text, {
        color: inkSoft,
        font: regular,
        size: 8.4,
        x: MARGIN + 16,
        y: y - 20 - index * 12,
      });
    });
    y -= boxHeight + 6;
  }
  function drawLaboratory() {
    requireSpace(330);
    sectionTitle("06","Laboratorio de borradores");
    const workspace=input.laboratory;
    const paragraph=(text:string)=>{const lines=wrapText(pdfText(text),regular,9.2,CONTENT_WIDTH-20);requireSpace(Math.min(lines.length*14+10,160));for(const textLine of lines){if(y-14<FOOTER_LIMIT){addPage();sectionTitle("06","Laboratorio · continuación");}page.drawText(textLine,{color:inkSoft,font:regular,size:9.2,x:MARGIN+10,y:y-10});y-=14;}y-=10;};
    if(!workspace){paragraph(t("Evaluación no incluida para este acceso. No debe interpretarse como ausencia de incertidumbre."));return;}
    paragraph(t("Hechos declarados por el equipo. No son hechos verificados ni acreditan cumplimiento jurídico."));
    for(const fact of workspace.facts)paragraph(`${t(fact.label)}: ${t(fact.value===null?"Sin dato":fact.value?"Sí":"No")}`);
    if(!workspace.evaluation){paragraph(t("Todavía no hay una evaluación guardada."));return;}
    const evaluation=workspace.evaluation;
    paragraph(`${t("Última evaluación guardada")}: ${date(evaluation.evaluatedAt)} · ${evaluation.ruleSetLabel} · ${t("motor")} ${evaluation.engineVersion}`);
    paragraph(`${t("Tareas sugeridas")}: ${evaluation.summary.applies}. ${t("Sin tarea en el borrador")}: ${evaluation.summary.not_applies}. ${t("Datos necesarios")}: ${evaluation.summary.unknown}.`);
    evaluation.items.forEach(item=>{paragraph(`${t(item.result==="applies"?"Tarea sugerida":item.result==="not_applies"?"Sin tarea en el borrador":"Dato necesario")}: ${item.displayTitle}. ${item.displayExplanation}`);});
    paragraph(`${t("Huella de la evaluación")}: ${evaluation.contentHash}`);
    paragraph(t("Las sugerencias no son requisitos jurídicos ni se añaden al checklist automáticamente."));
  }
}

function drawPageHeader(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  organizationName: string,
  locale: ReportLocale,
): number {
  drawBrandMark(page, MARGIN, 789);
  page.drawText("EXPEDIENTE VV", {
    color: ink,
    font: bold,
    size: 10,
    x: MARGIN + 42,
    y: 804,
  });
  page.drawText(reportText("CONTROL DOCUMENTAL",locale), {
    color: muted,
    font: regular,
    size: 6.5,
    x: MARGIN + 42,
    y: 793,
  });
  const organization = fitText(pdfText(organizationName), bold, 8, 230);
  page.drawText(organization, {
    color: inkSoft,
    font: bold,
    size: 8,
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(organization, 8),
    y: 801,
  });
  page.drawLine({
    color: line,
    end: { x: PAGE_WIDTH - MARGIN, y: 777 },
    start: { x: MARGIN, y: 777 },
    thickness: 0.6,
  });
  return 746;
}

function drawBrandMark(page: PDFPage, x: number, y: number): void {
  page.drawRectangle({
    borderColor: line,
    borderWidth: 0.7,
    color: paper,
    width:32,
    height:32,
    x,
    y,
  });
  const top = y + 22;
  const bottom = y + 10;
  page.drawLine({
    color: teal,
    end: { x: x + 12, y: bottom },
    start: { x: x + 7.5, y: top },
    thickness: 2.6,
  });
  page.drawLine({
    color: teal,
    end: { x: x + 16, y: top },
    start: { x: x + 12, y: bottom },
    thickness: 2.6,
  });
  page.drawLine({
    color: coral,
    end: { x: x + 20.5, y: bottom },
    start: { x: x + 16, y: top },
    thickness: 2.6,
  });
  page.drawLine({
    color: coral,
    end: { x: x + 24.5, y: top },
    start: { x: x + 20.5, y: bottom },
    thickness: 2.6,
  });
}

function drawStatusPill(
  page: PDFPage,
  bold: PDFFont,
  value: string,
  x: number,
  y: number,
): void {
  const approved=["Revisado","Completada","Reviewed","Completed"].includes(value);
  const observed=value==="Observado"||value==="Issues noted";
  const textColor=approved?rgb(0.15,0.35,0.26):observed?rgb(0.6,0.24,0.2):inkSoft;
  page.drawRectangle({
    borderColor: line,
    borderWidth: 0.5,
    color: approved?rgb(0.95,0.98,0.96):observed?rgb(0.99,0.96,0.95):coralSoft,
    height: 21,
    width: 116,
    x,
    y,
  });
  page.drawText(fitText(pdfText(value), bold, 7.1, 102), {
    color: textColor,
    font: bold,
    size: 7.1,
    x: x + 7,
    y: y + 7,
  });
}

function drawFooter(
  page: PDFPage,
  regular: PDFFont,
  internalReference: string,
  pageNumber: number,
  pageCount: number,
): void {
  page.drawLine({
    color: line,
    end: { x: PAGE_WIDTH - MARGIN, y: 43 },
    start: { x: MARGIN, y: 43 },
    thickness: 0.5,
  });
  page.drawText(pdfText(`Expediente VV · ${internalReference}`), {
    color: muted,
    font: regular,
    size: 7.2,
    x: MARGIN,
    y: 27,
  });
  const pagination = `${pageNumber} / ${pageCount}`;
  page.drawText(pagination, {
    color: muted,
    font: regular,
    size: 7.2,
    x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pagination, 7.2),
    y: 27,
  });
}

function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const rawWord of words) {
    const chunks = splitWord(rawWord, font, size, maxWidth);
    for (const word of chunks) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function splitWord(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return [value];
  const chunks: string[] = [];
  let chunk = "";
  for (const character of value) {
    const candidate = chunk + character;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !chunk) {
      chunk = candidate;
    } else {
      chunks.push(chunk);
      chunk = character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function fitText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let output = value;
  while (
    output.length > 1 &&
    font.widthOfTextAtSize(`${output}...`, size) > maxWidth
  ) {
    output = output.slice(0, -1);
  }
  return `${output.trimEnd()}...`;
}

function pdfText(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function formatDate(value: string, locale:ReportLocale): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat(locale==="en"?"en-GB":"es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Atlantic/Canary",
  }).format(date);
}

function securityLabel(value: string): string {
  return {
    clean: "Análisis antimalware superado",
    failed: "Control no superado",
    infected: "Archivo rechazado",
    pending: "Pendiente de control",
    structural_only: "Control estructural del piloto",
  }[value] ?? "Pendiente";
}

function reviewDecisionLabel(value: string, invalidated: boolean): string {
  if (invalidated) return "Decisión invalidada";
  return {
    approved: "Evidencia aprobada",
    changes_requested: "Cambios solicitados",
    rejected: "Evidencia rechazada",
  }[value] ?? "Decisión registrada";
}

function activityLabel(value: string): string {
  return {
    active: "Activa",
    ceased: "Cesada",
    not_started: "No iniciada",
    paused: "Pausada",
  }[value] ?? "Sin especificar";
}
