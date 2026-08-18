import { isMac, isWindows } from "../utils/platform";
import { en, zh, type Catalog } from "./messages";

export type Locale = "zh" | "en";
export const DEFAULT_LOCALE: Locale = "zh";

export function asLocale(value: unknown): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

let current: Locale = DEFAULT_LOCALE;

export function setLocale(next: Locale): void {
  current = asLocale(next);
  if (typeof document !== "undefined") {
    document.documentElement.lang = current === "en" ? "en" : "zh-CN";
  }
}

export function getLocale(): Locale {
  return current;
}

export function catalog(): Catalog {
  return current === "en" ? en : zh;
}

type StringKey = { [K in keyof Catalog]: Catalog[K] extends string ? K : never }[keyof Catalog];
type ListKey = { [K in keyof Catalog]: Catalog[K] extends readonly string[] ? K : never }[keyof Catalog];

function format(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] === undefined ? `{${k}}` : String(vars[k]),
  );
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  return format(catalog()[key], vars);
}

export function list(key: ListKey): readonly string[] {
  return catalog()[key];
}

export function revealFolderLabel(): string {
  if (isMac) return t("revealFinder");
  if (isWindows) return t("revealExplorer");
  return t("revealFolder");
}

export function trashLabel(): string {
  if (isMac) return t("moveToTrash");
  if (isWindows) return t("moveToRecycle");
  return t("deleteItem");
}

export function trashConfirm(name: string): string {
  if (isMac) return t("trashConfirm", { name });
  if (isWindows) return t("recycleConfirm", { name });
  return t("deleteConfirm", { name });
}
