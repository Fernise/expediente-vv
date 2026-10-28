import type { Metadata } from "next";
import { headers, cookies } from "next/headers";
import { LanguageProvider } from "@/app/components/Language";
import { ChunkRecovery } from "@/app/components/ChunkRecovery";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { themeInitializationScript } from "@/lib/theme";
import "./globals.css";
import "./refinement.css";
import "./theme.css";
import "./professional.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol === "http" ? "http" : "https";
  const rawHost =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "expediente-vv.local";
  const safeHost = rawHost.replace(/[^\w.:[\]-]/g, "");
  const socialImage = `${protocol}://${safeHost}/og.png`;
  const english = (await cookies()).get("expediente-vv-language")?.value === "en";
  const description = english
    ? "Document management and professional coordination for holiday rentals in the Canary Islands."
    : "Control documental y coordinación profesional para viviendas vacacionales en Canarias.";

  return {
    title: {
      default: "Expediente VV",
      template: "%s · Expediente VV",
    },
    description,
    applicationName: "Expediente VV",
    openGraph: {
      description,
      images: [{ alt: "Expediente VV", height: 1024, url: socialImage, width: 1536 }],
      locale: english ? "en_GB" : "es_ES",
      siteName: "Expediente VV",
      title: "Expediente VV",
      type: "website",
    },
    robots: {
      follow: false,
      index: false,
    },
    twitter: {
      card: "summary_large_image",
      description,
      images: [socialImage],
      title: "Expediente VV",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = (await cookies()).get("expediente-vv-language")?.value === "en" ? "en" : "es";
  return (
    <html lang={locale} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>
        <LanguageProvider initialLocale={locale}>
        <ChunkRecovery />
        <div className="theme-fallback"><ThemeToggle /></div>
        {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
