/** 欢迎页:问候、打开文件/新建、最近与工作区。 */
import { useEffect, useMemo, useState } from "react";
import Lottie from "lottie-react";
import { motion, useReducedMotion } from "motion/react";
import { FileTextIcon, PlusIcon } from "lucide-animated";
import { MovingIcon } from "./MovingIcon";
import { tabStore } from "../lib/tabs/tabStore";
import { settingsStore } from "../lib/settings/settingsStore";
import { folderName } from "../lib/files/paths";
import { list as listRecent } from "../lib/files/recent";
import { basename } from "../lib/utils/platform";
import { PressDepth } from "./interior/press-depth";
import { TextReveal } from "./interior/text-reveal";
import { FilterGrid, type FilterDefinition } from "./interior/filter-grid";
import { list, useT } from "../lib/i18n";
import sun from "../assets/emoji/sun-with-face.json";
import cloud from "../assets/emoji/partly-sunny.json";
import moon from "../assets/emoji/moon-face.json";
import sleep from "../assets/emoji/sleep.json";

type HomeItem = {
  id: string;
  kind: "file" | "workspace";
  path: string;
  name: string;
};

function pick(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** 按时段抽一条问候;Noto 表情仍按早晚切换。 */
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: pick(list("greetMorning")), emoji: sun };
  if (h >= 12 && h < 18) return { text: pick(list("greetAfternoon")), emoji: cloud };
  if (h >= 18 && h < 23) return { text: pick(list("greetEvening")), emoji: moon };
  return { text: pick(list("greetNight")), emoji: sleep };
}

function openHomeItem(item: HomeItem) {
  if (item.kind === "file") {
    void tabStore.openPath(item.path);
    return;
  }
  if (!settingsStore.settings.sidebarVisible) {
    settingsStore.update("sidebarVisible", true);
  }
}

export function WelcomePage() {
  const t = useT();
  const [recents, setRecents] = useState<string[]>([]);
  const locale = settingsStore.settings.locale;
  const hello = useMemo(greeting, [locale]);
  const reduced = useReducedMotion();
  const workspaces = [
    settingsStore.settings.defaultWorkspace,
    ...settingsStore.settings.workspaces,
  ].filter((p): p is string => !!p);

  const items = useMemo<HomeItem[]>(() => {
    const files: HomeItem[] = recents.map((path) => ({
      id: `file:${path}`,
      kind: "file",
      path,
      name: basename(path),
    }));
    const places: HomeItem[] = workspaces.map((path) => ({
      id: `workspace:${path}`,
      kind: "workspace",
      path,
      name: folderName(path),
    }));
    return [...files, ...places];
  }, [recents, workspaces]);

  const filters = useMemo<FilterDefinition<HomeItem>[]>(
    () => [
      { id: "all", label: t("filterAll"), match: () => true },
      { id: "recent", label: t("recentOpened"), match: (item) => item.kind === "file" },
      { id: "workspace", label: t("workspaces"), match: (item) => item.kind === "workspace" },
    ],
    [locale, t],
  );

  useEffect(() => {
    void listRecent().then(setRecents);
  }, []);

  return (
    <div className="welcome">
      <h1>
        <motion.span
          className="welcome-emoji"
          aria-hidden
          initial={reduced ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}>
          <Lottie animationData={hello.emoji} loop={reduced !== true} autoplay={reduced !== true} />
        </motion.span>
        <TextReveal text={hello.text} className="welcome-reveal" by="character" startOnView={false} />
      </h1>

      <div className="actions">
        <PressDepth className="welcome-action press-red" onClick={() => void tabStore.openFiles()}>
          <MovingIcon icon={FileTextIcon} size={14} />
          {t("openFile")}
        </PressDepth>
        <PressDepth className="welcome-action" onClick={() => void tabStore.newTab()}>
          <MovingIcon icon={PlusIcon} size={14} />
          {t("newDocument")}
        </PressDepth>
      </div>
      <hr className="welcome-rule" />

      {items.length > 0 && (
        <FilterGrid
          label={t("homeFilterLabel")}
          items={items}
          filters={filters}
          getKey={(item) => item.id}
          columns={3}
          maxRows={0}
          emptyLabel={t("filterEmpty")}
          renderItem={(item) => (
            <button type="button" className="fg-item" title={item.path} onClick={() => openHomeItem(item)}>
              <span className="card-name">{item.name}</span>
              <span className="card-path">{item.path}</span>
            </button>
          )}
        />
      )}
    </div>
  );
}
