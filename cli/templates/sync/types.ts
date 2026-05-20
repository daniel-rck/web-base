export type SyncEnvelope = {
  /** Base64-encoded ciphertext (AES-GCM). */
  ciphertext: string;
  /** Base64-encoded 12-byte IV. */
  iv: string;
  /** Schema version of the plaintext payload. */
  v: number;
};

export type PairingSlot = {
  /** AES-GCM-wrapped device secret, base64. */
  wrapped: string;
  /** 12-byte IV used for the wrap, base64. */
  iv: string;
  /** Unix timestamp (ms) when the slot expires. */
  expiresAt: number;
};

export type SyncClientState = {
  /** Hex-encoded 32-byte device secret. Never leaves the device. */
  deviceSecret: string;
  /** Latest known R2 ETag, for If-Match conflict detection. */
  etag: string | null;
};
