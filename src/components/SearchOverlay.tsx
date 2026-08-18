/**
 * ⌘K:已打开标签 + 所有工作区与近期访问中的 Markdown,支持文件名与全文检索。
 */
import { useEffect, useState } from "react";
import { CommandPalette, type CommandItem } from "./interior/command-palette";
import { tabStore } from "../lib/tabs/tabStore";
import { treeStore } from "../lib/files/treeStore";
import { settingsStore } from "../lib/settings/settingsStore";
import { searchQuery, type SearchHit } from "../ipc/commands";
import { syncSearchIndex } from "../lib/files/search";
import { useStoreVersion } from "../lib/react/reactive";
import { useT, t } from "../lib/i18n";

function kindHint(kind: string): string {
  if (kind === "open") return t("hintOpen");
  if (kind === "recent") return t("recentOpened");
  return t("workspaces");
}

function toItems(hits: SearchHit[]): CommandItem[] {
  return hits.map((hit) => {
    const tabId = hit.id.startsWith("tab:") ? hit.id.slice(4) : null;
    return {
      id: tabId ? `tab:${tabId}` : `lib:${hit.path || hit.id}`,
      label: hit.title || hit.path,
      hint: kindHint(hit.kind),
      sub: hit.snippet || undefined,
    };
  });
}

export function SearchOverlay() {
  useStoreVersion(tabStore);
  useStoreVersion(treeStore);
  const t = useT();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CommandItem[]>([]);
  const [ready, setReady] = useState(false);
  const open = tabStore.searchOpen;

  useEffect(() => {
    if (!open) {
      setReady(false);
      setItems([]);
      return;
    }
    let cancelled = false;
    void syncSearchIndex()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, treeStore.fileCount, tabStore.tabs.length]);

  useEffect(() => {
    if (!open || !ready) return;
    const q = query.trim();
    if (!q) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchQuery(q)
        .then((hits) => {
          if (!cancelled) setItems(toItems(hits));
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, ready, query, settingsStore.settings.locale]);

  return (
    <CommandPalette
      open={open}
      autoFocus
      skipFilter
      highlightFirst={false}
      className="search-palette"
      onDismiss={() => (tabStore.searchOpen = false)}
      onQueryChange={setQuery}
      onSelect={(item) => {
        tabStore.searchOpen = false;
        if (item.id.startsWith("tab:")) tabStore.activate(item.id.slice(4));
        else if (item.id.startsWith("lib:")) void tabStore.openPath(item.id.slice("lib:".length), { replace: true });
      }}
      items={items}
      placeholder={t("searchPlaceholder")}
      emptyLabel={t("searchEmpty")}
      idleLabel={t("searchIdle")}
      label={t("searchDocs")}
      maxRows={7}
      showCount={false}
    />
  );
}
