/** The backup file: one JSON document with every store of the app's database. */
export const BACKUP_FORMAT = "web-base-backup";
export const FORMAT_VERSION = 1;

export type StoreDump = {
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  /** `k` only for stores with out-of-line keys; values are codec-encoded. */
  records: { k?: unknown; v: unknown }[];
};

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof FORMAT_VERSION;
  /** The IndexedDB name — it identifies the app. */
  app: string;
  /** The schema version the data was exported from. */
  dbVersion: number;
  exportedAt: string;
  stores: Record<string, StoreDump>;
};

/** An error whose message is meant for the user (German). */
export class BackupError extends Error {
  override name = "BackupError";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const INVALID = "Die Datei ist keine gültige Sicherung.";

export function parseBackupFile(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError(INVALID);
  }
  if (
    !isRecord(data) ||
    data.format !== BACKUP_FORMAT ||
    data.formatVersion !== FORMAT_VERSION ||
    typeof data.app !== "string" ||
    typeof data.dbVersion !== "number" ||
    !isRecord(data.stores) ||
    !Object.values(data.stores).every((s) => isRecord(s) && Array.isArray(s.records))
  ) {
    throw new BackupError(INVALID);
  }
  return data as BackupFile;
}

/**
 * Whether a backup fits this database. **Decision:** a backup from an older
 * schema version is accepted as long as all its stores still exist — the
 * importer passes a `migrate` function when the data shape changed.
 */
export function checkCompatibility(
  file: BackupFile,
  db: { name: string; version: number; objectStoreNames: DOMStringList },
): void {
  if (file.app !== db.name) {
    throw new BackupError(`Die Sicherung stammt aus einer anderen App (${file.app}).`);
  }
  if (file.dbVersion > db.version) {
    throw new BackupError(
      "Die Sicherung stammt aus einer neueren Version der App. Aktualisiere die App und versuche es erneut.",
    );
  }
  for (const store of Object.keys(file.stores)) {
    if (!db.objectStoreNames.contains(store)) {
      throw new BackupError(`Die Sicherung enthält unbekannte Daten (${store}).`);
    }
  }
}
