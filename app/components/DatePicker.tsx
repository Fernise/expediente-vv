"use client";
import {useEffect,useRef,useState,useId,type KeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {CalendarDays,ChevronLeft,ChevronRight,X} from "lucide-react";
import {useLanguage} from "@/app/components/Language";
import {validTaskDate} from "@/lib/checklist-plan";
const iso=(date:Date)=>date.toISOString().slice(0,10);
const parse=(value:string)=>new Date(`${value}T12:00:00Z`);
export function DatePicker({name,defaultValue="",disabled=false}:{name:string;defaultValue?:string;disabled?:boolean}) {
  const {locale}=useLanguage();const en=locale==="en";const language=en?"en-GB":"es-ES";const id=useId();
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Atlantic/Canary",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const [value,setValue]=useState(defaultValue);const [open,setOpen]=useState(false);
  const [view,setView]=useState(()=>parse(defaultValue&&validTaskDate(defaultValue)?defaultValue:today));
  const [position,setPosition]=useState({left:0,top:0,width:320,maxHeight:440});const trigger=useRef<HTMLButtonElement>(null);const popup=useRef<HTMLDivElement>(null);
  const year=view.getUTCFullYear(),month=view.getUTCMonth();const first=new Date(Date.UTC(year,month,1,12));const start=(first.getUTCDay()+6)%7;const count=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  function close(){setOpen(false);trigger.current?.focus();}
  function choose(next:string){setValue(next);close();}
  useEffect(()=>{
    if(!open)return;
    function reposition(){const r=trigger.current!.getBoundingClientRect();const width=Math.min(320,innerWidth-24);const below=innerHeight-r.bottom-16;setPosition({left:Math.max(12,Math.min(r.left,innerWidth-width-12)),top:below>=350?r.bottom+8:Math.max(12,r.top-Math.min(440,r.top-24)),width,maxHeight:Math.max(220,Math.min(440,below>=350?below:r.top-24))});}
    reposition();const timer=requestAnimationFrame(()=>{const selected=popup.current?.querySelector<HTMLButtonElement>("[data-selected=true]")??popup.current?.querySelector<HTMLButtonElement>("[data-day]");selected?.focus();});
    function outside(event:PointerEvent){if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);}
    document.addEventListener("pointerdown",outside);window.addEventListener("resize",reposition);window.addEventListener("scroll",reposition,true);
    return()=>{cancelAnimationFrame(timer);document.removeEventListener("pointerdown",outside);window.removeEventListener("resize",reposition);window.removeEventListener("scroll",reposition,true);};
  },[open]);
  function keyboard(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==="Escape"){event.preventDefault();close();return;}
    if(event.key==="Tab") {const buttons=Array.from(popup.current!.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}
    const date=(event.target as HTMLElement).dataset.day;if(!date)return;
    const offsets:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
    if(event.key in offsets){event.preventDefault();const next=parse(date);next.setUTCDate(next.getUTCDate()+offsets[event.key]);setView(next);requestAnimationFrame(()=>popup.current?.querySelector<HTMLButtonElement>(`[data-day="${iso(next)}"]`)?.focus());}
    if(event.key==="PageUp"||event.key==="PageDown"){event.preventDefault();setView(new Date(Date.UTC(year,month+(event.key==="PageUp"?-1:1),1,12)));requestAnimationFrame(()=>popup.current?.querySelector<HTMLButtonElement>("[data-day]")?.focus());}
  }
  return <div className="date-picker"><input type="hidden" name={name} value={value}/><button ref={trigger} type="button" className="date-picker-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} aria-label={en?"Choose target date":"Elegir fecha objetivo"} onClick={()=>{setView(parse(value&&validTaskDate(value)?value:today));setOpen(!open);}}><span>{value&&validTaskDate(value)?new Intl.DateTimeFormat(language,{timeZone:"UTC",day:"2-digit",month:"long",year:"numeric"}).format(parse(value)):(en?"Choose a date":"Seleccionar fecha")}</span><CalendarDays aria-hidden="true"/></button>
    {open?createPortal(<div ref={popup} id={id} className="date-picker-popup" role="dialog" aria-modal="true" aria-label={en?"Target date calendar":"Calendario de fecha objetivo"} style={{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight}} onKeyDown={keyboard}>
      <header><button type="button" aria-label={en?"Previous month":"Mes anterior"} onClick={()=>setView(new Date(Date.UTC(year,month-1,1,12)))}><ChevronLeft aria-hidden="true"/></button><strong aria-live="polite">{new Intl.DateTimeFormat(language,{month:"long",year:"numeric",timeZone:"UTC"}).format(first)}</strong><button type="button" aria-label={en?"Next month":"Mes siguiente"} onClick={()=>setView(new Date(Date.UTC(year,month+1,1,12)))}><ChevronRight aria-hidden="true"/></button><button type="button" aria-label={en?"Close calendar":"Cerrar calendario"} onClick={close}><X aria-hidden="true"/></button></header>
      <div className="date-weekdays" aria-hidden="true">{(en?["Mo","Tu","We","Th","Fr","Sa","Su"]:["L","M","X","J","V","S","D"]).map(day=><span key={day}>{day}</span>)}</div>
      <div className="date-days" role="group" aria-label={en?"Days of month":"Días del mes"}>{Array.from({length:start},(_,i)=><span key={`empty-${i}`} aria-hidden="true"/>)}{Array.from({length:count},(_,i)=>{const date=iso(new Date(Date.UTC(year,month,i+1,12)));return <button type="button" key={date} data-day={date} data-selected={date===value} aria-pressed={date===value} aria-current={date===today?"date":undefined} aria-label={new Intl.DateTimeFormat(language,{dateStyle:"full",timeZone:"UTC"}).format(parse(date))} onClick={()=>choose(date)}>{i+1}</button>;})}</div>
      <footer><button type="button" onClick={()=>choose(today)}>{en?"Today":"Hoy"}</button><button type="button" onClick={()=>choose("")}>{en?"No date":"Sin fecha"}</button></footer><small>{en?"Arrow keys: move · Page Up/Down: month · Esc: close":"Flechas: moverse · RePág/AvPág: mes · Esc: cerrar"}</small>
    </div>,document.body):null}
  </div>;
}
