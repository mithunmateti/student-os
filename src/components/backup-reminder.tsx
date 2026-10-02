"use client";
/**
 * Saved data survives closing the app and switching the device off, but clearing the browser's
 * data (or losing the device) wipes it. Every two weeks, nudge the student to download a backup.
 */
import { HardDriveDownload } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { addDays, daysBetween } from "@/domain/util";
import { downloadBackup } from "@/lib/backup";
import { useToday } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { Button, toast } from "./ui";

const EVERY_DAYS = 14;
/** Don't nag in the first few days of using the app. */
const GRACE_DAYS = 3;

export function BackupReminder() {
  const d = useToday();
  const { isDemo, exams, lastBackupAt, snoozed, update } = useStore(useShallow((s) => ({
    isDemo: s.isDemo, exams: s.exams, lastBackupAt: s.settings.lastBackupAt, snoozed: s.settings.backupSnoozedUntil, update: s.updateSettings,
  })));
  if (isDemo || !exams.length) return null;
  const firstUse = exams.map((e) => e.createdAt.slice(0, 10)).sort()[0];
  if (daysBetween(firstUse, d) < GRACE_DAYS) return null;
  if (lastBackupAt && daysBetween(lastBackupAt.slice(0, 10), d) < EVERY_DAYS) return null;
  if (snoozed && snoozed > d) return null;
  return (
    <div role="note" className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3">
      <HardDriveDownload className="size-5 shrink-0 text-accent-text" aria-hidden />
      <div className="min-w-48 flex-1 text-sm">
        <p className="font-bold text-fg">{lastBackupAt ? "Time for a fresh backup" : "Keep a backup copy"}</p>
        <p className="text-fg-2">Your data is saved on this device. A backup file keeps it safe even if the browser&apos;s data is cleared or you change devices.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => { downloadBackup(); toast("Backup downloaded. Keep it somewhere safe, like iCloud Drive or Google Drive."); }}>Download backup</Button>
        <Button size="sm" variant="ghost" onClick={() => update({ backupSnoozedUntil: addDays(d, 7) })}>Later</Button>
      </div>
    </div>
  );
}
