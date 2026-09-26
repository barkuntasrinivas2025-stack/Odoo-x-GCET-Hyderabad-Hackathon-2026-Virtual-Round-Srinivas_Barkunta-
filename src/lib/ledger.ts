import { createHash } from "crypto";
import { eq, desc } from "drizzle-orm";
import { ledgerEntries, stockLevels } from "../db/schema";
import type { db as DbType } from "./db";

const GENESIS_HASH = "0".repeat(64);

function canonicalPayload(entry: {
  documentId: number | null;
  productId: number;
  warehouseId: number;
  deltaQuantity: string;
  reason: string;
  prevHash: string;
  createdAt: string;
}) {
  // Deterministic ordering matters — never JSON.stringify an object with
  // unstable key order into a hash input.
  return [
    entry.documentId ?? "",
    entry.productId,
    entry.warehouseId,
    entry.deltaQuantity,
    entry.reason,
    entry.prevHash,
    entry.createdAt,
  ].join("|");
}

/**
 * Appends one ledger entry and updates the cached stock level.
 * Runs inside a transaction so the chain can never fork under concurrent writes.
 */
export async function appendLedgerEntry(
  db: typeof DbType,
  params: {
    documentId: number | null;
    productId: number;
    warehouseId: number;
    deltaQuantity: number; // signed: +50 receipt, -10 delivery
    reason: "receipt" | "delivery" | "transfer_out" | "transfer_in" | "adjustment";
  }
) {
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ hash: ledgerEntries.hash })
      .from(ledgerEntries)
      .orderBy(desc(ledgerEntries.id))
      .limit(1);

    const prevHash = last?.hash ?? GENESIS_HASH;
    const createdAt = new Date().toISOString();
    const deltaStr = params.deltaQuantity.toFixed(3);

    const hash = createHash("sha256")
      .update(
        canonicalPayload({
          documentId: params.documentId,
          productId: params.productId,
          warehouseId: params.warehouseId,
          deltaQuantity: deltaStr,
          reason: params.reason,
          prevHash,
          createdAt,
        })
      )
      .digest("hex");

    const [row] = await tx
      .insert(ledgerEntries)
      .values({
        documentId: params.documentId,
        productId: params.productId,
        warehouseId: params.warehouseId,
        deltaQuantity: deltaStr,
        reason: params.reason,
        prevHash,
        hash,
        createdAt: new Date(createdAt), // must match the timestamp that was hashed, not defaultNow()
      })
      .returning();

    // Upsert the cached stock level
    const [existing] = await tx
      .select()
      .from(stockLevels)
      .where(eq(stockLevels.productId, params.productId));

    if (existing) {
      await tx
        .update(stockLevels)
        .set({
          quantity: (Number(existing.quantity) + params.deltaQuantity).toFixed(3),
        })
        .where(eq(stockLevels.id, existing.id));
    } else {
      await tx.insert(stockLevels).values({
        productId: params.productId,
        warehouseId: params.warehouseId,
        quantity: deltaStr,
      });
    }

    return row;
  });
}

/**
 * Walks the entire ledger and re-derives each hash from its stored payload.
 * If anything was edited directly in the DB after the fact, this fails at
 * the first tampered row and every row after it. Expose this as a
 * "Verify Ledger Integrity" button on the dashboard — it's the whole point.
 */
export async function verifyLedgerIntegrity(db: typeof DbType) {
  const rows = await db
    .select()
    .from(ledgerEntries)
    .orderBy(ledgerEntries.id);

  let expectedPrev = GENESIS_HASH;

  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return { valid: false, brokenAtId: row.id, reason: "prevHash mismatch" as const };
    }
    const recomputed = createHash("sha256")
      .update(
        canonicalPayload({
          documentId: row.documentId,
          productId: row.productId,
          warehouseId: row.warehouseId,
          deltaQuantity: row.deltaQuantity,
          reason: row.reason,
          prevHash: row.prevHash,
          createdAt: row.createdAt.toISOString(),
        })
      )
      .digest("hex");

    if (recomputed !== row.hash) {
      return { valid: false, brokenAtId: row.id, reason: "hash mismatch" as const };
    }
    expectedPrev = row.hash;
  }

  return { valid: true, checkedRows: rows.length };
}
