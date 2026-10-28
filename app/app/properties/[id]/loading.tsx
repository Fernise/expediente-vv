
import { I18nText, LocalizedControl } from "@/app/components/Language";
export default function PropertyDossierLoading() {
  return (
    <LocalizedControl as="div" aria-busy="true" aria-label="Abriendo expediente" className="dossier-loading">
      <div className="dossier-loading-heading">
        <span className="loading-block loading-mark" />
        <div>
          <span className="loading-block loading-kicker" />
          <span className="loading-block loading-title" />
          <span className="loading-block loading-copy" />
        </div>
      </div>
      <div className="dossier-loading-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <span className="loading-block loading-card" key={index} />
        ))}
      </div>
      <span className="loading-block loading-panel" />
    </LocalizedControl>
  );
}
