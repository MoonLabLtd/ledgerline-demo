import type { DB } from "@/db/client";

/**
 * The drizzle transaction handle passed to `db.transaction((tx) => ...)`.
 * Helpers that may run inside or outside a transaction accept `Tx | DB`.
 */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** A plain database handle or an active transaction handle. */
export type DbOrTx = DB | Tx;

/**
 * Escapes `\`, `%`, and `_` with a backslash so a LIKE search treats them as
 * literals. Pair with `LIKE ? ESCAPE '\'`.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Builds a `%<escaped>%` pattern for an ASCII case-insensitive substring
 * search. Use with `LIKE ? ESCAPE '\'`.
 */
export function likePattern(value: string): string {
  return `%${escapeLike(value)}%`;
}

/**
 * Normalizes an optional text field: trims surrounding whitespace and stores
 * an empty trimmed value as `null`.
 */
export function trimmedOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
