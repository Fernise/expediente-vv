"use client";
import { useRef } from "react";

export const uncertainMutationMessage = "No hemos podido confirmar el resultado. Conservamos lo escrito. Comprueba si la acción se completó antes de enviar datos distintos.";

export function propertyMutationFailureMessage(error:unknown,hostname:string):string {
  const local=["localhost","127.0.0.1","[::1]","::1"].includes(hostname);
  if(local && error instanceof TypeError)return "No se pudo conectar con el servidor local. Mantén abierta la terminal con npm run dev y comprueba que localhost:3000 responde. Conservamos lo escrito y la clave de reintento. Antes de cambiar los datos, revisa Viviendas por si la creación se completó.";
  if(error instanceof SyntaxError)return "El servidor devolvió una respuesta que no pudimos leer. Conservamos lo escrito. Revisa Viviendas antes de cambiar los datos o vuelve a intentar con los mismos datos.";
  return uncertainMutationMessage;
}

// Stable for the same draft; synchronous lock covers double clicks in one tick.
export function useMutationRequest() {
  const busy = useRef(false);
  const attempt = useRef({ fingerprint: "", key: "" });
  return {
    begin() { if (busy.current) return false; busy.current = true; return true; },
    end() { busy.current = false; },
    clear() { attempt.current = { fingerprint: "", key: "" }; },
    async headers(body: string | FormData) {
      const parts: string[] = [];
      if (typeof body === "string") parts.push(body);
      else for (const [name, value] of body.entries()) {
        if (typeof value === "string") parts.push(JSON.stringify([name, value]));
        else {
          const digest = await crypto.subtle.digest("SHA-256", await value.arrayBuffer());
          parts.push(JSON.stringify([name, value.name, value.type, value.size, [...new Uint8Array(digest)]]));
        }
      }
      const fingerprint = parts.join("\n");
      if (attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
      return { "idempotency-key": attempt.current.key };
    },
  };
}
