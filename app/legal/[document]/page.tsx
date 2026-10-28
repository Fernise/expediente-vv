import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/app/components/PublicChrome";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { LEGAL_VERSION, PILOT_CONTACT, legalDocuments } from "@/lib/legal-documents";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const doc = Object.hasOwn(legalDocuments, document) ? legalDocuments[document] : undefined;
  const locale = (await cookies()).get("expediente-vv-language")?.value === "en" ? "en" : "es";
  return { title: doc?.title[locale], description: doc?.intro[locale] };
}
export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!Object.hasOwn(legalDocuments, document)) notFound();
  const doc = legalDocuments[document];
  const locale = (await cookies()).get("expediente-vv-language")?.value === "en" ? "en" : "es";
  const en = locale === "en";
  const user = await getChatGPTUser();
  return <main className="public-page">
    <PublicHeader appHref={user ? "/app" : chatGPTSignInPath("/app")} signedIn={Boolean(user)} />
    <div className="legal-layout">
      <header className="page-heading"><div><span className="eyebrow">{en ? "Transparency · Private beta" : "Transparencia · Beta privada"}</span><h1>{doc.title[locale]}</h1><p>{doc.intro[locale]}</p></div></header>
      <aside className="legal-draft-note" role="note"><strong>{en ? "Provisional private-beta information" : "Información provisional de la beta privada"}</strong><p>{en ? "For internal evaluation only. Operator identification and legal review remain pending; these documents do not authorise commercial launch or certify compliance." : "Para evaluación interna. La identificación del titular y la revisión jurídica siguen pendientes; estos documentos no habilitan el lanzamiento comercial ni certifican el cumplimiento."}</p><small>{en ? "Document version" : "Versión del documento"}: {LEGAL_VERSION}</small></aside>
      <nav className="legal-tabs" aria-label={en ? "Legal documents" : "Documentos legales"}>{Object.entries(legalDocuments).map(([slug, item]) => <Link key={slug} href={`/legal/${slug}`} aria-current={slug === document ? "page" : undefined}>{item.title[locale]}</Link>)}</nav>
      <div className="legal-sections">{doc.sections.map((section, index) => <section key={index}><h2>{section.heading[locale]}</h2><p>{section.body[locale]}</p>{section.href ? <a href={section.href} target="_blank" rel="noreferrer">{section.link?.[locale]} ↗</a> : null}</section>)}</div>
      <footer className="legal-contact"><span>{en ? "Pilot contact" : "Contacto del piloto"}</span><a href={`mailto:${PILOT_CONTACT}`}>{PILOT_CONTACT}</a></footer>
    </div><PublicFooter />
  </main>;
}
