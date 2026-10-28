import { cookies } from "next/headers";
import type { Metadata } from "next";
import catalog from "@/lib/ui-catalog.json";
import extra from "@/lib/ui-extra-en.json";
export async function localizedMetadata(metadata: Metadata): Promise<Metadata> {
  const english = (await cookies()).get("expediente-vv-language")?.value === "en";
  if (!english) return metadata;
  const t = (text: string) => (extra as Record<string,string>)[text] ?? (catalog as Record<string,string>)[text] ?? text;
  return { ...metadata, title: typeof metadata.title === "string" ? t(metadata.title) : metadata.title,
    description: metadata.description ? t(metadata.description) : metadata.description };
}
