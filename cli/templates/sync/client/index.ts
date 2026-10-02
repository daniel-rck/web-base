/**
 * The app's entry point into sync. A scaffold seam: `update` never overwrites
 * it, so configure the shared client here (endpoint, storage key, timeout).
 */
import { SyncClient } from "./client.ts";

export { SyncClient };
export { isSyncError, SyncError, syncErrorMessage, type SyncErrorCode } from "./errors.ts";
export { formatPairingCode } from "./pairing.ts";
export type { PullResult, RequestOptions, StorageLike, SyncClientOptions } from "./types.ts";

export const syncClient = new SyncClient();
