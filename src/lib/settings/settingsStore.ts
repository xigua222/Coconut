import { load, type Store } from "@tauri-apps/plugin-store";
import {
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  MEASURE_LEVEL_PX,
  SIZE_LEVEL_PX,
  type Settings,
  type Theme,
} from "./defaults";
import { debounce } from "../utils/debounce";
import { ReactiveStore } from "../react/reactive";
import { findContainingPlace, samePath, uniquePaths } from "../files/paths";
import { asLocale, setLocale } from "../i18n/runtime";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 旧 settings.json:folderRoot / places / looseFiles / activePlace */
type StoredSettings = Partial<Settings> & {
  folderRoot?: string | null;
  places?: string[];
  activePlace?: string | null;
  looseFiles?: string[];
};

function migrate(stored: StoredSettings | undefined): Settings {
  const {
    folderRoot,
    places: rawPlaces,
    looseFiles,
    defaultWorkspace: rawDefault,
    workspaces: rawWorkspaces,
    recentAccess: rawRecent,
    ...rest
  } = stored ?? {};

  const oldPlaces = uniquePaths((rawPlaces ?? []).filter((p): p is string => typeof p === "string"));
  let defaultWorkspace =
    typeof rawDefault === "string" && rawDefault ? rawDefault : null;
  let workspaces = uniquePaths((rawWorkspaces ?? []).filter((p): p is string => typeof p === "string"));

  if (!defaultWorkspace && typeof folderRoot === "string" && folderRoot) {
    defaultWorkspace = folderRoot;
  }
  if (!defaultWorkspace && oldPlaces.length) {
    defaultWorkspace = oldPlaces[0] ?? null;
    workspaces = uniquePaths([...workspaces, ...oldPlaces.slice(1)]);
  } else if (oldPlaces.length) {
    workspaces = uniquePaths([
      ...workspaces,
      ...oldPlaces.filter((p) => !defaultWorkspace || !samePath(p, defaultWorkspace)),
    ]);
  }
  if (defaultWorkspace) {
    workspaces = workspaces.filter((p) => !samePath(p, defaultWorkspace!));
  }

  const roots = uniquePaths(defaultWorkspace ? [defaultWorkspace, ...workspaces] : workspaces);
  const recentAccess = uniquePaths(
    [
      ...(Array.isArray(rawRecent) ? rawRecent : []),
      ...(Array.isArray(looseFiles) ? looseFiles : []),
    ].filter((p): p is string => typeof p === "string" && !findContainingPlace(p, roots)),
  );

  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    defaultWorkspace,
    workspaces,
    recentAccess,
    theme: asTheme(rest.theme),
    locale: asLocale(rest.locale),
    headingMarks: rest.headingMarks !== false,
    openTabs: (Array.isArray(rest.openTabs) ? rest.openTabs : []).filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    ),
    activeTab: typeof rest.activeTab === "string" && rest.activeTab ? rest.activeTab : null,
  };
}

function asTheme(value: unknown): Theme {
  return value === "coconut-dark" ? "coconut-dark" : DEFAULT_THEME;
}

/**
 * 全局设置:ReactiveStore 状态 + tauri-plugin-store 持久化(settings.json)。
 * 任何字段变更防抖 300ms 落盘。
 * 主题:coconut 浅色 / coconut-dark 深色;旧的其它 theme 值归并为浅色。
 */
class SettingsStore extends ReactiveStore {
  settings: Settings = { ...DEFAULT_SETTINGS };

  resolvedTheme: Theme = DEFAULT_THEME;

  #store: Store | null = null;
  #ready = false;

  async init(): Promise<void> {
    this.#store = await load("settings.json", { autoSave: true });
    const stored = await this.#store.get<StoredSettings>("settings");
    this.settings = migrate(stored);
    this.#applyTheme();
    this.#applyLocale();
    this.#ready = true;
    this.notify();
    if (
      stored &&
      ("folderRoot" in stored || "places" in stored || "looseFiles" in stored || "activePlace" in stored)
    ) {
      this.#persist();
    } else if (stored && this.settings.recentAccess.length !== (Array.isArray(stored.recentAccess) ? stored.recentAccess.length : 0)) {
      this.#persist();
    }
  }

  /** 更新单个字段并即时应用/持久化 */
  update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.patch({ [key]: value } as Partial<Settings>);
  }

  patch(partial: Partial<Settings>): void {
    Object.assign(this.settings, partial);
    if (["fontSize", "sizeLevel", "measureLevel", "theme", "headingMarks"].some((k) => k in partial)) {
      this.#applyTheme();
    }
    if ("locale" in partial) this.#applyLocale();
    this.#persist();
    this.notify();
  }

  get ready(): boolean {
    return this.#ready;
  }

  #persist = debounce(() => {
    void this.#store?.set("settings", { ...this.settings });
    void this.#store?.save();
  }, 300);

  #applyTheme(): void {
    const theme = asTheme(this.settings.theme);
    this.settings.theme = theme;
    this.resolvedTheme = theme;
    const dark = theme === "coconut-dark";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = dark ? "dark" : "light";
    root.style.setProperty("--editor-font-size", `${SIZE_LEVEL_PX[this.settings.sizeLevel]}px`);
    root.style.setProperty("--editor-measure", `${MEASURE_LEVEL_PX[this.settings.measureLevel]}px`);
    root.dataset.headingMarks = this.settings.headingMarks ? "on" : "off";
    void this.#syncNativeTheme(dark);
  }

  #applyLocale(): void {
    const locale = asLocale(this.settings.locale);
    this.settings.locale = locale;
    setLocale(locale);
  }

  async #syncNativeTheme(dark: boolean): Promise<void> {
    try {
      await getCurrentWindow().setTheme(dark ? "dark" : "light");
    } catch {
      // 浏览器 mock / 无窗口权限时忽略
    }
  }
}

export const settingsStore = new SettingsStore();
