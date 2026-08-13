/** 欢迎页:品牌印、打开/新建、最近打开卡片、拖放提示。 */
import { useEffect, useState } from "react";
import { tabStore } from "../lib/tabs/tabStore";
import { list, clear } from "../lib/files/recent";
import { basename } from "../lib/utils/platform";

export function WelcomePage() {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    void list().then(setRecents);
  }, []);

  return (
    <div className="welcome">
      <div className="logo">墨</div>
      <h1>
        把 Markdown
        <br />
        读成一本书。
      </h1>
      <p className="sub">极简、圆角、丝滑。打开一份文档,或把文件拖进窗口。</p>

      <div className="actions">
        <button className="btn primary" onClick={() => void tabStore.openFiles()}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M6 4h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          </svg>
          打开文件
        </button>
        <button className="btn" onClick={() => tabStore.newTab()}>
          新建文档
        </button>
      </div>

      {recents.length > 0 && (
        <>
          <div className="hr" />
          <div className="recent-label">
            最近打开
            <button className="clear" onClick={() => void clear().then(() => setRecents([]))}>
              清空
            </button>
          </div>
          <div className="cards">
            {recents.map((path) => (
              <button key={path} className="card" title={path} onClick={() => void tabStore.openPath(path)}>
                <span className="card-name">{basename(path)}</span>
                <span className="card-path">{path}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="drop-hint">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 8 12 3 17 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>把 .md 文件拖到这里</span>
      </div>
    </div>
  );
}
