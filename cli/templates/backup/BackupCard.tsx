import type { IDBPDatabase } from "idb";
import { useState } from "react";
import { Badge } from "../ui/Badge.tsx";
import { Button, buttonClassName } from "../ui/Button.tsx";
import { SectionCard } from "../ui/Card.tsx";
import { exportBackup, importBackup, type RestoreOptions, wipeAllData } from "./backup.ts";
import { BackupError } from "./format.ts";
import { formatBytes, requestPersistentStorage, useStorageStatus } from "./persistence.ts";

const LAST_BACKUP_KEY = "backup:last";

export type BackupCardProps<S> = {
  getDB: () => Promise<IDBPDatabase<S>>;
  /** Runs before „Alle Daten löschen" — a sync app deletes its remote copy here. */
  beforeWipe?: () => void | Promise<void>;
  migrate?: RestoreOptions["migrate"];
};

type Message = { kind: "ok" | "error"; text: string } | undefined;

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** „Daten & Sicherung": export, import, persistent storage, wipe. For a settings page. */
export function BackupCard<S>({ getDB, beforeWipe, migrate }: BackupCardProps<S>) {
  const { status, refresh } = useStorageStatus();
  const [message, setMessage] = useState<Message>();
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const fail = (err: unknown) =>
    setMessage({
      kind: "error",
      text:
        err instanceof BackupError
          ? err.message
          : "Das hat nicht geklappt. Bitte versuche es erneut.",
    });

  const onExport = async () => {
    try {
      const db = await getDB();
      const date = new Date().toISOString().slice(0, 10);
      download(`${db.name}-sicherung-${date}.json`, JSON.stringify(await exportBackup(db)));
      const now = new Date().toLocaleString("de-DE");
      try {
        localStorage.setItem(LAST_BACKUP_KEY, now);
      } catch {
        // Best effort.
      }
      setLastBackup(now);
      setMessage({ kind: "ok", text: "Sicherung gespeichert." });
    } catch (err) {
      fail(err);
    }
  };

  const onImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file || !window.confirm("Alle aktuellen Daten durch die Sicherung ersetzen?")) return;
    try {
      await importBackup(await getDB(), await file.text(), { migrate });
      setMessage({ kind: "ok", text: "Sicherung wiederhergestellt." });
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const onWipe = async () => {
    if (
      !window.confirm(
        "Wirklich alle Daten auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.",
      )
    )
      return;
    try {
      await beforeWipe?.();
      await wipeAllData(await getDB());
      window.location.assign("/");
    } catch (err) {
      fail(err);
    }
  };

  const onPersist = async () => {
    await requestPersistentStorage();
    refresh();
  };

  return (
    <SectionCard title="Daten & Sicherung">
      <p className="text-sm text-fg-muted">
        Deine Daten liegen nur auf diesem Gerät. Eine Sicherung ist eine JSON-Datei mit allem — sie
        ist unverschlüsselt, bewahre sie entsprechend auf.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {status?.usage !== undefined ? (
          <span className="text-fg-muted">Belegt: {formatBytes(status.usage)}</span>
        ) : null}
        {status?.persisted ? (
          <Badge variant="success">Dauerhaft gespeichert</Badge>
        ) : status ? (
          <Button size="sm" variant="ghost" onClick={() => void onPersist()}>
            Speicher dauerhaft machen
          </Button>
        ) : null}
      </div>
      {status && !status.persisted ? (
        <p className="mt-1 text-xs text-fg-subtle">
          Ohne dauerhaften Speicher darf der Browser die Daten bei Platzmangel löschen — Safari tut
          das nach sieben Tagen ohne Besuch, solange die App nicht installiert ist.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void onExport()}>Sicherung exportieren</Button>
        <label
          className={buttonClassName({
            variant: "secondary",
            className:
              "cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500",
          })}
        >
          Sicherung importieren
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => void onImport(event.currentTarget)}
          />
        </label>
        <Button variant="danger" onClick={() => void onWipe()}>
          Alle Daten löschen
        </Button>
      </div>
      {lastBackup ? (
        <p className="mt-2 text-xs text-fg-subtle">Letzte Sicherung: {lastBackup}</p>
      ) : null}
      <p role="status" className="mt-2 text-sm text-success-fg">
        {message?.kind === "ok" ? message.text : ""}
      </p>
      <p role="alert" className="text-sm text-danger-fg">
        {message?.kind === "error" ? message.text : ""}
      </p>
    </SectionCard>
  );
}
