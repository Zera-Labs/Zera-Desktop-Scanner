export interface HistoryEvent {
  operation: "read" | "write";
  timestamp: string;
  tagUid?: string | null;
  success: boolean;
  error?: string;
}

type BigIntString = string;
type NoteMemo = [BigIntString, BigIntString, BigIntString, BigIntString];

export interface StoredNoteRecord {
  amount: BigIntString;
  asset: BigIntString;
  secret: BigIntString;
  blinding: BigIntString;
  memo: NoteMemo;
  commitment: BigIntString;
  nullifier: BigIntString;
  leafIndex: number;
  spent: boolean;
  createdAt: string;
}

export interface PrivateCashNote {
  // Legacy UI-compatibility fields
  voucherId: string;
  amount: number;
  secret: string;
  salt: string;
  recipient: string;
  txSignature: string;
  createdAt: string;

  // Canonical note fields
  noteAmount: BigIntString;
  asset: BigIntString;
  blinding: BigIntString;
  memo: NoteMemo;
  commitment: BigIntString;
  nullifier: BigIntString;
  leafIndex: number;
  spent: boolean;
}

export type PrivateCashNoteTile = PrivateCashNote & {
  id: string;
  history?: HistoryEvent[];
  lastReadAt?: string;
  lastWrittenAt?: string;
  readCount?: number;
  writeCount?: number;
};

const ZERO_MEMO: NoteMemo = ["0", "0", "0", "0"];

function toNumberAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toMemo(value: unknown): NoteMemo {
  if (Array.isArray(value) && value.length === 4) {
    return [String(value[0]), String(value[1]), String(value[2]), String(value[3])];
  }
  return ZERO_MEMO;
}

export function buildNote(parsed: any, idSource?: string): PrivateCashNoteTile {
  const idFromSource = idSource
    ? idSource.replace(/^.*[\\/]/, "").replace(/\.json$/i, "")
    : undefined;

  const noteAmount = String(parsed.amount ?? "0");
  const commitment = String(parsed.commitment ?? parsed.voucherId ?? parsed.id ?? idFromSource ?? Date.now());
  const nullifier = String(parsed.nullifier ?? parsed.txSignature ?? parsed.id ?? commitment);
  const blinding = String(parsed.blinding ?? parsed.salt ?? "0");
  const createdAt = parsed.createdAt || new Date().toISOString();

  const note: PrivateCashNoteTile = {
    id: parsed.id || idFromSource || commitment,
    voucherId: commitment,
    amount: toNumberAmount(parsed.amount),
    recipient: String(parsed.recipient ?? parsed.nullifier ?? "Unknown"),
    secret: String(parsed.secret ?? "0"),
    salt: blinding,
    txSignature: String(parsed.txSignature ?? parsed.nullifier ?? parsed.commitment ?? "Unknown"),
    createdAt,
    noteAmount,
    asset: String(parsed.asset ?? "0"),
    blinding,
    memo: toMemo(parsed.memo),
    commitment,
    nullifier,
    leafIndex: Number.isInteger(parsed.leafIndex) && parsed.leafIndex >= 0 ? parsed.leafIndex : 0,
    spent: Boolean(parsed.spent),
  };

  const required = [note.id, note.commitment, note.nullifier, note.createdAt];
  if (required.some((field) => field === undefined || field === null || field === "")) {
    throw new Error("Missing required note fields.");
  }

  return note;
}

export function toStoredNoteRecord(tile: PrivateCashNoteTile): StoredNoteRecord {
  return {
    amount: tile.noteAmount || String(tile.amount ?? 0),
    asset: tile.asset || "0",
    secret: tile.secret || "0",
    blinding: tile.blinding || tile.salt || "0",
    memo: toMemo(tile.memo),
    commitment: tile.commitment || tile.voucherId || tile.id,
    nullifier: tile.nullifier || tile.txSignature || tile.id,
    leafIndex: Number.isInteger(tile.leafIndex) && tile.leafIndex >= 0 ? tile.leafIndex : 0,
    spent: Boolean(tile.spent),
    createdAt: tile.createdAt || new Date().toISOString(),
  };
}

export function createMockPrivateCashNotes(_now: number = Date.now()): PrivateCashNoteTile[] {
  return [];
}

export function getMockOfflineBalanceUsd(): number {
  return 0;
}
