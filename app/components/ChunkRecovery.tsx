"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "expediente-vv-chunk-recovery";

function isChunkFailure(value: unknown): boolean {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "";

  return /ChunkLoadError|dynamically imported module|module script/i.test(message);
}

export function ChunkRecovery() {
  useEffect(() => {
    const recover = () => {
      if (sessionStorage.getItem(RECOVERY_KEY)) return;
      sessionStorage.setItem(RECOVERY_KEY, "1");
      window.location.reload();
    };
    const clearRecovery = window.setTimeout(
      () => sessionStorage.removeItem(RECOVERY_KEY),
      5_000,
    );
    const handleResourceError = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLScriptElement &&
        target.src.includes("/assets/")
      ) {
        recover();
      }
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isChunkFailure(event.reason)) recover();
    };

    window.addEventListener("error", handleResourceError, true);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.clearTimeout(clearRecovery);
      window.removeEventListener("error", handleResourceError, true);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
