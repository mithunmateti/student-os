"use client";
/** Downloading a full backup, from Settings or from the dashboard reminder. */
import { today } from "@/domain/util";
import { getData, useStore } from "@/store/store";
import { backupJson, download } from "./export";

export function downloadBackup() {
  download(`student-os-backup-${today()}.json`, backupJson(getData()), "application/json");
  useStore.getState().updateSettings({ lastBackupAt: new Date().toISOString(), backupSnoozedUntil: undefined });
}
