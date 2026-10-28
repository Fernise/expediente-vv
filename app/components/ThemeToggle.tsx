"use client";
import { I18nText, LocalizedControl } from "@/app/components/Language";


import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  resolveTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

function subscribe(onChange: () => void) {
  const syncFromStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    document.documentElement.dataset.theme = resolveTheme(event.newValue);
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", syncFromStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", syncFromStorage);
  };
}

function currentTheme() {
  return resolveTheme(document.documentElement.dataset.theme);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");
  const label = theme === "dark" ? "Activar modo claro" : "Activar modo oscuro";

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The control still works when the browser blocks local storage.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <LocalizedControl as="button"
      aria-label={label}
      aria-pressed={theme === "dark"}
      className="theme-toggle"
      onClick={toggleTheme}
      title={label}
      type="button"
    >
      <Moon aria-hidden="true" className="theme-moon" />
      <Sun aria-hidden="true" className="theme-sun" />
      <span className="sr-only"><I18nText>{label}</I18nText></span>
    </LocalizedControl>
  );
}
