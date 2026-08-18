/**
 * 未保存修改的关闭确认对话框。
 * 「不保存」单击即关:对话框本身已是确认,再长按会像卡死。
 */
import { Modal } from "./interior/modal";
import { PressDepth } from "./interior/press-depth";
import { tabStore } from "../lib/tabs/tabStore";
import { useStoreVersion } from "../lib/react/reactive";
import { useT } from "../lib/i18n";

export function ConfirmModal() {
  useStoreVersion(tabStore);
  const t = useT();
  const session = tabStore.pendingClose;

  return (
    <Modal
      open={!!session}
      onClose={() => tabStore.resolveConfirm("cancel")}
      title={session ? t("unsavedChanges", { title: session.title }) : ""}
      description={t("saveBeforeClose")}
      closeOnEscape
      closeOnBackdrop={false}
      closeLabel={t("cancel")}
      showClose={false}
      maxWidth={360}
      className="confirm-modal"
      footer={
        <>
          <PressDepth
            className="press-sm press-red"
            depth={2}
            onClick={() => tabStore.resolveConfirm("save")}>
            {t("save")}
          </PressDepth>
          <PressDepth
            className="press-sm"
            depth={2}
            onClick={() => tabStore.resolveConfirm("discard")}>
            {t("discard")}
          </PressDepth>
          <PressDepth
            className="press-sm"
            depth={2}
            onClick={() => tabStore.resolveConfirm("cancel")}>
            {t("cancel")}
          </PressDepth>
        </>
      }
    />
  );
}
