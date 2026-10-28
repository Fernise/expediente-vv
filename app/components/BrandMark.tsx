
import { I18nText } from "@/app/components/Language";
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-letter brand-letter-primary"><I18nText>V</I18nText></span>
      <span className="brand-letter brand-letter-accent"><I18nText>V</I18nText></span>
    </span>
  );
}
