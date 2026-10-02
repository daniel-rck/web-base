import { BackupError } from "./format.ts";

/**
 * JSON for IndexedDB values. Plain JSON.stringify would turn Dates into
 * strings and Blobs, Maps and Sets into `{}` without an error — the worst way
 * for a backup to fail, discovered only on restore. Non-JSON values become
 * tagged objects `{ "$wb": <type>, v: … }`.
 */
const TAG = "$wb";

const VIEWS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  DataView,
} as const;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const tag = (type: string, extra: Record<string, unknown> = {}) => ({ [TAG]: type, ...extra });

export async function encodeValue(value: unknown): Promise<unknown> {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (value === undefined) return tag("undef");
  if (typeof value === "number")
    return Number.isFinite(value) ? value : tag("num", { v: String(value) });
  if (typeof value === "bigint") return tag("bigint", { v: value.toString() });
  if (value instanceof Date)
    return tag("date", { v: Number.isNaN(value.getTime()) ? null : value.toISOString() });
  if (value instanceof Blob) {
    const v = toBase64(new Uint8Array(await value.arrayBuffer()));
    return value instanceof File
      ? tag("file", { v, t: value.type, n: value.name, m: value.lastModified })
      : tag("blob", { v, t: value.type });
  }
  if (value instanceof ArrayBuffer) return tag("buf", { v: toBase64(new Uint8Array(value)) });
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return tag("view", { t: value.constructor.name, v: toBase64(bytes) });
  }
  if (value instanceof Map) {
    return tag("map", {
      v: await Promise.all(
        [...value].map(async ([k, v]) => [await encodeValue(k), await encodeValue(v)]),
      ),
    });
  }
  if (value instanceof Set)
    return tag("set", { v: await Promise.all([...value].map(encodeValue)) });
  if (Array.isArray(value)) return Promise.all(value.map(encodeValue));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await encodeValue(v);
    // A real `$wb` key is escaped, so it can never be mistaken for a tag.
    return TAG in out ? tag("obj", { v: out }) : out;
  }
  throw new BackupError("Die Daten enthalten einen Wert, der sich nicht sichern lässt.");
}

export function decodeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const type = record[TAG];
  if (typeof type !== "string") {
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, decodeValue(v)]));
  }
  const v = record.v;
  switch (type) {
    case "undef":
      return undefined;
    case "num":
      return Number(v);
    case "bigint":
      return BigInt(String(v));
    case "date":
      return new Date(v === null ? Number.NaN : String(v));
    case "blob":
      return new Blob([fromBase64(String(v))], { type: String(record.t ?? "") });
    case "file":
      return new File([fromBase64(String(v))], String(record.n ?? ""), {
        type: String(record.t ?? ""),
        lastModified: Number(record.m ?? Date.now()),
      });
    case "buf":
      return fromBase64(String(v)).buffer;
    case "view": {
      // Every entry of VIEWS takes a bare ArrayBuffer; TypeScript can't see
      // that through the union of their constructor overloads.
      const View = VIEWS[String(record.t) as keyof typeof VIEWS] as
        | (new (buffer: ArrayBuffer) => ArrayBufferView)
        | undefined;
      if (!View) break;
      return new View(fromBase64(String(v)).buffer);
    }
    case "map":
      return new Map((v as [unknown, unknown][]).map(([k, x]) => [decodeValue(k), decodeValue(x)]));
    case "set":
      return new Set((v as unknown[]).map(decodeValue));
    case "obj":
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, decodeValue(x)]),
      );
  }
  throw new BackupError("Die Datei ist keine gültige Sicherung.");
}
