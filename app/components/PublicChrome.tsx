
import { I18nText, LocalizedControl } from "@/app/components/Language";
import Link from "next/link";
import { BrandMark } from "@/app/components/BrandMark";
import { PendingLink } from "@/app/components/PendingLink";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { LanguageSwitcher } from "@/app/components/Language";

export function PublicHeader({
  appHref,
  signedIn,
}: {
  appHref: string;
  signedIn: boolean;
}) {
  return (
    <><header className="landing-header public-header">
      <Link className="landing-brand" href="/">
        <BrandMark />
        <span><I18nText>Expediente VV</I18nText></span>
      </Link>
      <LocalizedControl as="nav" aria-label="Navegación pública" className="landing-nav">
        <Link href="/#producto"><I18nText>Producto</I18nText></Link>
        <Link href="/comprobador"><I18nText>Comprobador</I18nText></Link>
        <Link href="/precios"><I18nText>Precios</I18nText></Link>
        <Link href="/solicitar-demo"><I18nText>Demostración</I18nText></Link>
      </LocalizedControl>
      <div className="public-header-actions">
      <LanguageSwitcher />
      <ThemeToggle />
      <PendingLink className="button button-ghost" href={appHref}>
        <I18nText>{signedIn ? "Ir al panel" : "Acceder"}</I18nText>
      </PendingLink>
      </div>
    </header>
    <LocalizedControl as="aside" className="private-beta-notice" aria-label="Beta privada"><span><i aria-hidden="true" /><I18nText>Beta privada</I18nText></span><p><I18nText>Entorno de evaluación con datos ficticios o anonimizados. Sin contratación ni cobros.</I18nText></p><Link href="/legal/condiciones"><I18nText>Condiciones de acceso</I18nText></Link></LocalizedControl></>
  );
}

export function PublicFooter() {
  return (
    <footer className="landing-footer public-footer">
      <Link className="landing-brand" href="/">
        <BrandMark />
        <span><I18nText>Expediente VV</I18nText></span>
      </Link>
      <p><I18nText>Organización documental para viviendas vacacionales.</I18nText></p>
      <div>
        <Link href="/comprobador"><I18nText>Comprobador</I18nText></Link>
        <Link href="/precios"><I18nText>Precios</I18nText></Link>
        <Link href="/solicitar-demo"><I18nText>Demostración</I18nText></Link>
        <Link href="/legal/aviso-legal"><I18nText>Aviso legal</I18nText></Link>
        <Link href="/legal/privacidad"><I18nText>Privacidad</I18nText></Link>
        <Link href="/legal/condiciones"><I18nText>Condiciones del piloto</I18nText></Link>
        <Link href="/legal/fuentes-oficiales"><I18nText>Fuentes oficiales</I18nText></Link>
      </div>
    </footer>
  );
}
