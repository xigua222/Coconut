/**
 * 底部状态栏:左=字数/字符/行数;右=编码(非 UTF-8 时标注转换)+ 保存状态。
 * 数据全部派生自 activeTab.session;内容经 400ms 防抖回写 md,与大纲同拍。
 * 只读徽标暂缺位:编辑器当前无只读模式,菜单"切换只读"落地后再补。
 */
import { tabStore } from "../lib/tabs/tabStore";
import { useStoreVersion } from "../lib/react/reactive";
import { countStats } from "../lib/utils/count";

export function StatusBar() {
  useStoreVersion(tabStore);
  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);

  const stats = session ? countStats(session.md) : null;
  const saving = session?.saving ?? false;
  const dirty = session?.dirty ?? false;
  const encoding = session?.encoding ?? "UTF-8";
  const willConvert = encoding !== "UTF-8";

  return (
    <footer className="statusbar">
      <div className="group">
        {stats && (
          <>
            <span className="item" title="字数:CJK 逐字 + 拉丁词">
              字数 {stats.words.toLocaleString()}
            </span>
            <span className="sep">·</span>
            <span className="item" title="字符数:含空白与 Markdown 标记">
              字符 {stats.chars.toLocaleString()}
            </span>
            <span className="sep">·</span>
            <span className="item" title="行数">
              行数 {stats.lines.toLocaleString()}
            </span>
          </>
        )}
      </div>
      <div className="group">
        <span
          className={willConvert ? "item warn" : "item"}
          title={willConvert ? "保存后将转为 UTF-8" : "文件编码"}>
          {encoding}
          {willConvert ? " → UTF-8" : ""}
        </span>
        <span
          className={saving ? "item save busy" : "item save"}
          title={dirty ? "有未保存的修改" : "内容已写入磁盘"}>
          {saving ? "保存中…" : dirty ? "未保存" : "已保存"}
        </span>
      </div>
    </footer>
  );
}
