<script lang="ts">
  /**
   * 底部状态栏:左=字数/字符/行数;右=编码(非 UTF-8 时标注转换)+ 保存状态。
   * 数据全部派生自 activeTab.session;内容经 400ms 防抖回写 md,与大纲同拍。
   * 只读徽标暂缺位:编辑器当前无只读模式,菜单"切换只读"落地后再补。
   */
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { countStats } from "../lib/utils/count";

  const session = $derived(tabStore.activeTab?.session ?? null);
  const stats = $derived(session ? countStats(session.md) : null);
  const saving = $derived(session?.saving ?? false);
  const dirty = $derived(session?.dirty ?? false);
  const encoding = $derived(session?.encoding ?? "UTF-8");
  const willConvert = $derived(encoding !== "UTF-8");
</script>

<footer class="statusbar">
  <div class="group">
    {#if stats}
      <span class="item" title="字数:CJK 逐字 + 拉丁词">字数 {stats.words.toLocaleString()}</span>
      <span class="sep">·</span>
      <span class="item" title="字符数:含空白与 Markdown 标记">字符 {stats.chars.toLocaleString()}</span>
      <span class="sep">·</span>
      <span class="item" title="行数">行数 {stats.lines.toLocaleString()}</span>
    {/if}
  </div>
  <div class="group">
    <span
      class="item"
      class:warn={willConvert}
      title={willConvert ? "保存后将转为 UTF-8" : "文件编码"}>
      {encoding}{willConvert ? " → UTF-8" : ""}
    </span>
    <span class="item save" class:busy={saving} title={dirty ? "有未保存的修改" : "内容已写入磁盘"}>
      {saving ? "保存中…" : dirty ? "未保存" : "已保存"}
    </span>
  </div>
</footer>

<style>
  .statusbar {
    flex: none;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px;
    font-size: 11px;
    color: var(--mut);
    background: var(--panel);
    border-top: 1px solid var(--line);
    user-select: none;
    transition: background-color var(--dur-theme) ease;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sep {
    opacity: 0.45;
  }

  .item.warn {
    color: var(--acc);
  }

  .item.save.busy {
    color: var(--acc);
  }
</style>
