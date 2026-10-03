export type SyncErrorCode =
  /** No secret on this device yet: call `enable()` or `importPairingCode()`. */
  | "not_enabled"
  /** `importPairingCode()` with a different secret; pass `{ replace: true }`. */
  | "already_enabled"
  | "invalid_code"
  | "offline"
  | "timeout"
  | "aborted"
  /** The remote object changed since the last pull (HTTP 409/412). */
  | "conflict"
  | "not_found"
  | "unauthorized"
  /** The object belongs to a different secret, or was re-created by one. */
  | "forbidden"
  | "rate_limited"
  | "too_large"
  /** The server rejected the request as malformed (other 4xx). */
  | "bad_request"
  /** The server answered, but not with something this client understands. */
  | "bad_response"
  /** The remote envelope uses a wire format this client does not know. */
  | "unsupported_version"
  | "decrypt_failed"
  | "storage_unavailable"
  | "server_error";

const MESSAGES: Record<SyncErrorCode, string> = {
  not_enabled: "Die Synchronisierung ist auf diesem Gerät nicht eingerichtet.",
  already_enabled: "Dieses Gerät ist bereits mit einer anderen Synchronisierung verbunden.",
  invalid_code: "Der Kopplungscode ist ungültig. Bitte prüfe die Eingabe.",
  offline: "Keine Verbindung zum Server. Bitte versuche es später erneut.",
  timeout: "Der Server antwortet nicht. Bitte versuche es später erneut.",
  aborted: "Die Synchronisierung wurde abgebrochen.",
  conflict: "Die Daten wurden inzwischen auf einem anderen Gerät geändert.",
  not_found: "Es wurden keine synchronisierten Daten gefunden.",
  unauthorized: "Der Server hat die Anmeldung abgelehnt.",
  forbidden: "Kein Zugriff auf diese Daten. Bitte kopple das Gerät neu.",
  rate_limited: "Zu viele Anfragen. Bitte warte einen Moment.",
  too_large: "Die Daten sind zu groß für die Synchronisierung.",
  bad_request: "Der Server hat die Anfrage abgelehnt.",
  bad_response: "Der Server hat eine ungültige Antwort geschickt.",
  unsupported_version:
    "Die Daten stammen aus einer neueren Version der App. Bitte aktualisiere die App.",
  decrypt_failed: "Die Daten konnten nicht entschlüsselt werden.",
  storage_unavailable: "Der Speicher des Browsers ist nicht verfügbar.",
  server_error: "Der Server hat einen Fehler gemeldet. Bitte versuche es später erneut.",
};

/** German default text for a code, ready to show in the UI. */
export function syncErrorMessage(code: SyncErrorCode): string {
  return MESSAGES[code];
}

export type SyncErrorOptions = {
  status?: number;
  /** Seconds, from `Retry-After` on a 429. */
  retryAfter?: number;
  cause?: unknown;
};

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  readonly status: number | undefined;
  readonly retryAfter: number | undefined;

  constructor(code: SyncErrorCode, options: SyncErrorOptions = {}) {
    super(syncErrorMessage(code), { cause: options.cause });
    this.name = "SyncError";
    this.code = code;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

/** Narrowing helper: `isSyncError(err, "conflict")`. */
export function isSyncError(error: unknown, code?: SyncErrorCode): error is SyncError {
  return error instanceof SyncError && (code === undefined || error.code === code);
}
