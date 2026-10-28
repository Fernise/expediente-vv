"use client";
import {useEffect,useState} from "react";
import {FileCheck2} from "lucide-react";
import {useLanguage} from "./Language";
import {PremiumSelect} from "./PremiumSelect";
import type {ReportLocale} from "@/lib/property-report-copy";

export function ReportDownloadControls({propertyId,organizationId}:{propertyId:string;organizationId:string}){
  const {locale}=useLanguage();
  const [reportLocale,setReportLocale]=useState<ReportLocale>(locale);
  useEffect(()=>setReportLocale(locale),[locale]);
  const label=locale==="en"?"PDF language":"Idioma del PDF";
  return <div className="report-download-controls" role="group" aria-label={locale==="en"?"Export dossier report":"Exportar informe del expediente"}>
    <span className="report-language-label">{label}</span>
    <PremiumSelect ariaLabel={label} value={reportLocale} onChange={value=>{if(value==="es"||value==="en")setReportLocale(value);}} options={[
      {value:"es",label:"Español",translate:false},
      {value:"en",label:"English",translate:false},
    ]}/>
    <a className="button button-secondary" href={`/api/properties/${encodeURIComponent(propertyId)}/report?organizationId=${encodeURIComponent(organizationId)}&lang=${reportLocale}`}>
      <FileCheck2 aria-hidden="true"/>{locale==="en"?"Download PDF":"Descargar PDF"}
    </a>
  </div>;
}
