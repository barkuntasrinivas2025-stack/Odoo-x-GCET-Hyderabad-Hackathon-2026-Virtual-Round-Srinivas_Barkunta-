"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const crypto_1 = require("crypto");
const db_1 = require("../lib/db");
const schema_1 = require("../db/schema");
const GENESIS_HASH = "0".repeat(64);
function canonicalPayload(entry) {
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
function makeHash(entry) {
    return (0, crypto_1.createHash)("sha256")
        .update(canonicalPayload(entry))
        .digest("hex");
}
async function seed() {
    console.log("Seeding StockSense...");
    // ------------------------------------------------------------
    // Warehouse
    // ------------------------------------------------------------
    const existingWarehouses = await db_1.db.select().from(schema_1.warehouses);
    let warehouseId;
    if (existingWarehouses.length === 0) {
        const [warehouse] = await db_1.db
            .insert(schema_1.warehouses)
            .values({
            name: "Hyderabad Central Warehouse",
            code: "HYD-01",
        })
            .returning();
        warehouseId = warehouse.id;
    }
    else {
        warehouseId = existingWarehouses[0].id;
    }
    // ------------------------------------------------------------
    // Category
    // ------------------------------------------------------------
    const existingCategories = await db_1.db.select().from(schema_1.categories);
    let categoryId;
    if (existingCategories.length === 0) {
        const [category] = await db_1.db
            .insert(schema_1.categories)
            .values({
            name: "Electronics",
        })
            .returning();
        categoryId = category.id;
    }
    else {
        categoryId = existingCategories[0].id;
    }
    // ------------------------------------------------------------
    // Products
    // ------------------------------------------------------------
    const existingProducts = await db_1.db.select().from(schema_1.products);
    let productRows = existingProducts;
    if (existingProducts.length === 0) {
        productRows = await db_1.db
            .insert(schema_1.products)
            .values([
            {
                sku: "SKU-1001",
                name: "Wireless Mouse",
                categoryId,
                unitOfMeasure: "units",
                reorderPoint: 20,
            },
            {
                sku: "SKU-1002",
                name: "Mechanical Keyboard",
                categoryId,
                unitOfMeasure: "units",
                reorderPoint: 15,
            },
            {
                sku: "SKU-1003",
                name: "USB-C Cable",
                categoryId,
                unitOfMeasure: "units",
                reorderPoint: 30,
            },
            {
                sku: "SKU-1004",
                name: "Laptop Stand",
                categoryId,
                unitOfMeasure: "units",
                reorderPoint: 10,
            },
            {
                sku: "SKU-1005",
                name: "Webcam",
                categoryId,
                unitOfMeasure: "units",
                reorderPoint: 12,
            },
        ])
            .returning();
    }
    // ------------------------------------------------------------
    // Current stock
    // ------------------------------------------------------------
    const existingStock = await db_1.db.select().from(schema_1.stockLevels);
    if (existingStock.length === 0) {
        await db_1.db.insert(schema_1.stockLevels).values([
            {
                productId: productRows[0].id,
                warehouseId,
                quantity: "18",
            },
            {
                productId: productRows[1].id,
                warehouseId,
                quantity: "42",
            },
            {
                productId: productRows[2].id,
                warehouseId,
                quantity: "8",
            },
            {
                productId: productRows[3].id,
                warehouseId,
                quantity: "27",
            },
            {
                productId: productRows[4].id,
                warehouseId,
                quantity: "6",
            },
        ]);
    }
    // ------------------------------------------------------------
    // Historical delivery activity
    //
    // These entries represent past consumption.
    // They are written directly to the ledger so they DO NOT
    // change today's current stock.
    // ------------------------------------------------------------
    const existingLedger = await db_1.db.select().from(schema_1.ledgerEntries);
    if (existingLedger.length === 0) {
        console.log("Creating historical consumption data...");
        /*
         * Each array represents daily outbound consumption.
         *
         * Product 1: moderate consumption
         * Product 2: low consumption
         * Product 3: high consumption -> CRITICAL
         * Product 4: low/moderate consumption
         * Product 5: moderate consumption -> WARNING
         */
        const history = {
            [productRows[0].id]: [
                2, 1, 2, 1, 2, 1, 2,
                2, 1, 2, 1, 2, 1, 2,
            ],
            [productRows[1].id]: [
                1, 1, 0, 1, 1, 0, 1,
                1, 0, 1, 1, 0, 1, 1,
            ],
            [productRows[2].id]: [
                4, 5, 3, 4, 5, 4, 3,
                5, 4, 5, 3, 4, 5, 4,
            ],
            [productRows[3].id]: [
                1, 1, 1, 0, 1, 1, 1,
                1, 0, 1, 1, 1, 0, 1,
            ],
            [productRows[4].id]: [
                2, 1, 2, 1, 2, 1, 2,
                1, 2, 1, 2, 1, 2, 1,
            ],
        };
        let previousHash = GENESIS_HASH;
        /*
         * Start 14 days ago and create one ledger event per product
         * per day where consumption occurred.
         */
        for (let day = 13; day >= 0; day--) {
            for (const product of productRows) {
                const consumption = history[product.id]?.[13 - day] ?? 0;
                if (consumption <= 0) {
                    continue;
                }
                const createdAtDate = new Date();
                createdAtDate.setDate(createdAtDate.getDate() - day);
                // Keep events deterministic but avoid exactly midnight.
                createdAtDate.setHours(10, 0, 0, 0);
                const createdAt = createdAtDate.toISOString();
                const deltaQuantity = (-consumption).toFixed(3);
                const payload = {
                    documentId: null,
                    productId: product.id,
                    warehouseId,
                    deltaQuantity,
                    reason: "delivery",
                    prevHash: previousHash,
                    createdAt,
                };
                const hash = makeHash(payload);
                await db_1.db.insert(schema_1.ledgerEntries).values({
                    documentId: null,
                    productId: product.id,
                    warehouseId,
                    deltaQuantity,
                    reason: "delivery",
                    prevHash: previousHash,
                    hash,
                    createdAt: createdAtDate,
                });
                previousHash = hash;
            }
        }
        console.log("Historical consumption created.");
    }
    else {
        console.log(`Ledger already contains ${existingLedger.length} entries. Skipping history.`);
    }
    console.log("");
    console.log("Seed complete.");
    console.log(`Warehouse ID: ${warehouseId}`);
    console.log(`Products: ${productRows.length}`);
    process.exit(0);
}
seed().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
});
