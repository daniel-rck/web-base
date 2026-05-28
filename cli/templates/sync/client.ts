import {
  base64ToBytes,
  bytesToBase64,
  decrypt,
  deriveDataKey,
  deriveObjectId,
  encrypt,
} from "./crypto.ts";
import type { SyncClientState, SyncEnvelope } from "./types.ts";

const STORAGE_KEY = "sync-state-v1";

export class SyncClient {
  private state: SyncClientState | null = null;

  constructor(private readonly endpoint: string = "/api/sync") {}

  async enable(): Promise<void> {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    this.state = {
      deviceSecret: bytesToHex(secret),
      etag: null,
    };
    this.persist();
  }

  isEnabled(): boolean {
    if (this.state) return true;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      this.state = JSON.parse(raw) as SyncClientState;
      return true;
    } catch {
      // Corrupted state: drop it so the user can re-enable cleanly.
      localStorage.removeItem(STORAGE_KEY);
      this.state = null;
      return false;
    }
  }

  async push(payload: unknown): Promise<void> {
    if (!this.state) throw new Error("Sync not enabled.");
    const secret = hexToBytes(this.state.deviceSecret);
    const key = await deriveDataKey(secret.buffer as ArrayBuffer, "data");
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const { ciphertext, iv } = await encrypt(key, plaintext.buffer as ArrayBuffer);
    const envelope: SyncEnvelope = {
      ciphertext: bytesToBase64(ciphertext),
      iv: bytesToBase64(iv),
      v: 1,
    };

    const objectId = await deriveObjectId(secret.buffer as ArrayBuffer);
    const headers: HeadersInit = { "content-type": "application/json" };
    if (this.state.etag) headers["if-match"] = this.state.etag;

    const res = await fetch(`${this.endpoint}/${objectId}/data.json`, {
      method: "PUT",
      headers,
      body: JSON.stringify(envelope),
    });
    if (!res.ok) throw new Error(`push failed: ${res.status}`);
    this.state.etag = res.headers.get("etag");
    this.persist();
  }

  async pull<T>(): Promise<T | null> {
    if (!this.state) throw new Error("Sync not enabled.");
    const secret = hexToBytes(this.state.deviceSecret);
    const objectId = await deriveObjectId(secret.buffer as ArrayBuffer);
    const headers: HeadersInit = {};
    if (this.state.etag) headers["if-none-match"] = this.state.etag;

    const res = await fetch(`${this.endpoint}/${objectId}/data.json`, { headers });
    if (res.status === 304) return null;
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`pull failed: ${res.status}`);

    const envelope = (await res.json()) as SyncEnvelope;
    const key = await deriveDataKey(secret.buffer as ArrayBuffer, "data");
    let value: T;
    try {
      const plaintext = await decrypt(
        key,
        base64ToBytes(envelope.ciphertext).buffer as ArrayBuffer,
        base64ToBytes(envelope.iv).buffer as ArrayBuffer,
      );
      value = JSON.parse(new TextDecoder().decode(plaintext)) as T;
    } catch (cause) {
      // AES-GCM auth failure, truncated ciphertext, or non-JSON plaintext.
      throw new Error("Sync data could not be decrypted or parsed.", { cause });
    }
    this.state.etag = res.headers.get("etag");
    this.persist();
    return value;
  }

  private persist(): void {
    if (!this.state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
