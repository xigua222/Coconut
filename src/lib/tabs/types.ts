import type { DocumentSession } from "../files/document.svelte";

export interface Tab {
  id: string;
  session: DocumentSession;
}

/** 关闭确认对话框的三种选择 */
export type ConfirmChoice = "save" | "discard" | "cancel";
