import { useStoreVersion } from "../react/reactive";
import { settingsStore } from "../settings/settingsStore";
import { t } from "./runtime";

export {
  asLocale,
  catalog,
  DEFAULT_LOCALE,
  getLocale,
  list,
  revealFolderLabel,
  setLocale,
  t,
  trashConfirm,
  trashLabel,
  type Locale,
} from "./runtime";

/** 订阅设置后取文案:语言一变,组件跟着重渲染。 */
export function useT(): typeof t {
  useStoreVersion(settingsStore);
  return t;
}
