import { SyncClient } from "../../templates/sync/client/client.ts";
import { deriveKeys, open, seal, type SyncKeys } from "../../templates/sync/client/crypto.ts";
import { SyncError } from "../../templates/sync/client/errors.ts";
import { decodePairingCode } from "../../templates/sync/client/pairing.ts";
import type { SyncEnvelope } from "../../templates/sync/client/types.ts";
import type { FakeFetch, Responder } from "./fakes/fetch.ts";
import type { MemoryStorage } from "./fakes/storage.ts";

export const KEY = "web-base-sync";
export const ENDPOINT = "https://app.test/api/sync";

/** What a rejected promise must match: `rejects.toMatchObject(failure("conflict"))`. */
export const failure = (code: string) => ({ name: "SyncError", code });

/** The `SyncError` code a promise rejects with, or "resolved". */
export async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof SyncError ? error.code : String(error);
  }
}

export function device(storage: MemoryStorage, server: FakeFetch, timeoutMs = 1000): SyncClient {
  return new SyncClient({ endpoint: ENDPOINT, storage, fetch: server.fetch, timeoutMs });
}

export function storedCode(storage: MemoryStorage): string {
  const raw = storage.data.get(KEY);
  if (!raw) throw new Error("no sync state stored");
  return (JSON.parse(raw) as { code: string }).code;
}

export async function keysOf(storage: MemoryStorage): Promise<SyncKeys> {
  return deriveKeys(await decodePairingCode(storedCode(storage)));
}

/** A 200 holding `payload`, as another device with the same secret pushed it. */
export function remote(storage: MemoryStorage, payload: unknown, etag: string): Responder {
  return async () => {
    const { encKey, objectId } = await keysOf(storage);
    const body = JSON.stringify(await seal(encKey, objectId, payload));
    return new Response(body, { status: 200, headers: { etag } });
  };
}

/** A successful PUT. */
export function stored(etag: string): Responder {
  return () => new Response(null, { status: 204, headers: { etag } });
}

/** Decrypt what the client uploaded. */
export async function openBody(storage: MemoryStorage, body: string | null): Promise<unknown> {
  const { encKey, objectId } = await keysOf(storage);
  return open(encKey, objectId, JSON.parse(body ?? "null") as SyncEnvelope);
}
