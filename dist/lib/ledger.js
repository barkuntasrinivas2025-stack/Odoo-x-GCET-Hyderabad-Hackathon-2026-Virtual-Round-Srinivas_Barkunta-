"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendLedgerEntry = appendLedgerEntry;
exports.verifyLedgerIntegrity = verifyLedgerIntegrity;
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../db/schema");
const GENESIS_HASH = "0".repeat(64);
function canonicalPayload(entry) {
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
async function appendLedgerEntry(db, params) {
    return db.transaction(async (tx) => {
        const [last] = await tx
            .select({ hash: schema_1.ledgerEntries.hash })
            .from(schema_1.ledgerEntries)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.ledgerEntries.id))
            .limit(1);
        const prevHash = last?.hash ?? GENESIS_HASH;
        const createdAt = new Date().toISOString();
        const deltaStr = params.deltaQuantity.toFixed(3);
        const hash = (0, crypto_1.createHash)("sha256")
            .update(canonicalPayload({
            documentId: params.documentId,
            productId: params.productId,
            warehouseId: params.warehouseId,
            deltaQuantity: deltaStr,
            reason: params.reason,
            prevHash,
            createdAt,
        }))
            .digest("hex");
        const [row] = await tx
            .insert(schema_1.ledgerEntries)
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
            .from(schema_1.stockLevels)
            .where((0, drizzle_orm_1.eq)(schema_1.stockLevels.productId, params.productId));
        if (existing) {
            await tx
                .update(schema_1.stockLevels)
                .set({
                quantity: (Number(existing.quantity) + params.deltaQuantity).toFixed(3),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.stockLevels.id, existing.id));
        }
        else {
            await tx.insert(schema_1.stockLevels).values({
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
async function verifyLedgerIntegrity(db) {
    const rows = await db
        .select()
        .from(schema_1.ledgerEntries)
        .orderBy(schema_1.ledgerEntries.id);
    let expectedPrev = GENESIS_HASH;
    for (const row of rows) {
        if (row.prevHash !== expectedPrev) {
            return { valid: false, brokenAtId: row.id, reason: "prevHash mismatch" };
        }
        const recomputed = (0, crypto_1.createHash)("sha256")
            .update(canonicalPayload({
            documentId: row.documentId,
            productId: row.productId,
            warehouseId: row.warehouseId,
            deltaQuantity: row.deltaQuantity,
            reason: row.reason,
            prevHash: row.prevHash,
            createdAt: row.createdAt.toISOString(),
        }))
            .digest("hex");
        if (recomputed !== row.hash) {
            return { valid: false, brokenAtId: row.id, reason: "hash mismatch" };
        }
        expectedPrev = row.hash;
    }
    return { valid: true, checkedRows: rows.length };
}
