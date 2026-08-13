import { load, type Store } from "@tauri-apps/plugin-store";
import {
  DEFAULT_SETTINGS,
  FIXED_THEME,
  MEASURE_LEVEL_PX,
  SIZE_LEVEL_PX,
  type Settings,
} from "./defaults";
import { debounce } from "../utils/debounce";
import { ReactiveStore } from "../react/reactive";

/**
 * 全局设置:ReactiveStore 状态 + tauri-plugin-store 持久化(settings.json)。
 * 任何字段变更防抖 300ms 落盘。
 * 主题:单一固定主题(FIXED_THEME),旧的多主题设置一律归并。
 */
class SettingsStore extends ReactiveStore {
  settings: Settings = { ...DEFAULT_SETTINGS };

  /** 固定主题(单一) */
  resolvedTheme: "coconut" = FIXED_THEME;

  #store: Store | null = null;
  #ready = false;

  async init(): Promise<void> {
    this.#store = await load("settings.json", { autoSave: true });
    const stored = await this.#store.get<Partial<Settings>>("settings");
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    // 旧数据里的多主题值(light/dark/sepia/midnight…)一律归并为固定主题
    this.settings.theme = FIXED_THEME;
    this.#applyTheme();
    this.#ready = true;
    this.notify();
  }

  /** 更新单个字段并即时应用/持久化 */
  update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
    if (["fontSize", "fontFamily", "serif", "sizeLevel", "measureLevel"].includes(key)) {
      this.#applyTheme();
    }
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
    const root = document.documentElement;
    root.dataset.theme = FIXED_THEME;
    const serifStack =
      '"Noto Serif SC", Georgia, "Songti SC", "SimSun", "Hiragino Mincho ProN", serif';
    const fontStack = this.settings.serif
      ? serifStack
      : this.settings.fontFamily;
    root.style.setProperty("--editor-font-size", `${SIZE_LEVEL_PX[this.settings.sizeLevel]}px`);
    root.style.setProperty("--editor-font-family", fontStack);
    root.style.setProperty("--editor-measure", `${MEASURE_LEVEL_PX[this.settings.measureLevel]}px`);
  }
}

export const settingsStore = new SettingsStore();
