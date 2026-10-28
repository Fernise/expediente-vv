export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "expediente-vv-theme";
export const THEME_CHANGE_EVENT = "expediente-vv-theme-change";

export function resolveTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}

// Runs before the page is painted; no user content is interpolated here.
export const themeInitializationScript = `(() => {
  let theme = "light";
  try { theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === "dark" ? "dark" : "light"; } catch {}
  document.documentElement.dataset.theme = theme;
})();`;
