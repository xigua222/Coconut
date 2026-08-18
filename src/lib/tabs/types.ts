import type { DocumentSession } from "../files/document";

export const LIBRARY_TAB_ID = "__coconut_library__";

export interface Tab {
  id: string;
  session: DocumentSession | null;
}

/** 关闭确认对话框的三种选择 */
export type ConfirmChoice = "save" | "discard" | "cancel";
