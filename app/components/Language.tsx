"use client";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode, type ComponentPropsWithRef, type JSX } from "react";
import { useRouter } from "next/navigation";
import catalog from "@/lib/ui-catalog.json";
import extra from "@/lib/ui-extra-en.json";
export type Locale = "es" | "en";
const LanguageContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: "es", setLocale: () => {} });
export function translate(text: string, locale: Locale): string {
  if (locale === "es") return text;
  const key = text.replace(/\s+/g, " ").trim();
  const translated = (extra as Record<string, string>)[key] ?? (catalog as Record<string, string>)[key];
  return translated ? text.replace(text.trim(), translated) : text;
}
export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState(initialLocale);
  useEffect(() => setLocale(initialLocale), [initialLocale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <LanguageContext.Provider value={{ locale, setLocale }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  return { ...context, t: (text: string) => translate(text, context.locale) };
}
export function I18nText({ children }: { children: string | number | null | undefined }) {
  const { t } = useLanguage();
  return <>{typeof children === "string" ? t(children) : children}</>;
}
export function LocalizedControl<T extends keyof JSX.IntrinsicElements>({ as, ...original }: { as: T } & ComponentPropsWithRef<T>) {
  const { t } = useLanguage();
  const props = { ...original } as Record<string, unknown>;
  for (const key of ["placeholder", "aria-label", "title", "alt"]) {
    if (typeof props[key] === "string") props[key] = t(props[key]);
  }
  return createElement(as, props);
}
export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const router = useRouter();
  function change(next: Locale) {
    document.cookie = `expediente-vv-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setLocale(next);
    router.refresh();
  }
  return <div className="language-switcher" role="group" aria-label={locale === "en" ? "Website language" : "Idioma de la web"}>
    <button type="button" lang="es" aria-pressed={locale === "es"} onClick={() => change("es")}>ES</button>
    <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => change("en")}>EN</button>
  </div>;
}
