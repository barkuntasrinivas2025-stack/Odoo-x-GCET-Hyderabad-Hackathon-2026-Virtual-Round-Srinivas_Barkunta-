"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerEntries = exports.documentLines = exports.documents = exports.stockLevels = exports.products = exports.categories = exports.warehouses = exports.users = exports.roleEnum = exports.docStatusEnum = exports.docTypeEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.docTypeEnum = (0, pg_core_1.pgEnum)("doc_type", [
    "receipt",
    "delivery",
    "transfer",
    "adjustment",
]);
exports.docStatusEnum = (0, pg_core_1.pgEnum)("doc_status", [
    "draft",
    "waiting",
    "ready",
    "done",
    "canceled",
]);
exports.roleEnum = (0, pg_core_1.pgEnum)("role", ["manager", "staff"]);
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }).notNull().unique(),
    passwordHash: (0, pg_core_1.text)("password_hash").notNull(),
    role: (0, exports.roleEnum)("role").notNull().default("staff"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.warehouses = (0, pg_core_1.pgTable)("warehouses", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    name: (0, pg_core_1.varchar)("name", { length: 120 }).notNull(),
    code: (0, pg_core_1.varchar)("code", { length: 20 }).notNull().unique(),
});
exports.categories = (0, pg_core_1.pgTable)("categories", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    name: (0, pg_core_1.varchar)("name", { length: 120 }).notNull(),
});
exports.products = (0, pg_core_1.pgTable)("products", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    sku: (0, pg_core_1.varchar)("sku", { length: 64 }).notNull().unique(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    categoryId: (0, pg_core_1.integer)("category_id").references(() => exports.categories.id),
    unitOfMeasure: (0, pg_core_1.varchar)("unit_of_measure", { length: 32 }).notNull(),
    reorderPoint: (0, pg_core_1.integer)("reorder_point").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
// Current on-hand quantity per product per warehouse.
// This is a derived/cache table — the ledger below is the source of truth.
exports.stockLevels = (0, pg_core_1.pgTable)("stock_levels", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    productId: (0, pg_core_1.integer)("product_id").references(() => exports.products.id).notNull(),
    warehouseId: (0, pg_core_1.integer)("warehouse_id").references(() => exports.warehouses.id).notNull(),
    quantity: (0, pg_core_1.numeric)("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
});
exports.documents = (0, pg_core_1.pgTable)("documents", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    docType: (0, exports.docTypeEnum)("doc_type").notNull(),
    status: (0, exports.docStatusEnum)("status").notNull().default("draft"),
    sourceWarehouseId: (0, pg_core_1.integer)("source_warehouse_id").references(() => exports.warehouses.id),
    destWarehouseId: (0, pg_core_1.integer)("dest_warehouse_id").references(() => exports.warehouses.id),
    reference: (0, pg_core_1.varchar)("reference", { length: 120 }), // supplier/customer/note
    createdBy: (0, pg_core_1.integer)("created_by").references(() => exports.users.id),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    validatedAt: (0, pg_core_1.timestamp)("validated_at"),
});
exports.documentLines = (0, pg_core_1.pgTable)("document_lines", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    documentId: (0, pg_core_1.integer)("document_id").references(() => exports.documents.id).notNull(),
    productId: (0, pg_core_1.integer)("product_id").references(() => exports.products.id).notNull(),
    quantity: (0, pg_core_1.numeric)("quantity", { precision: 14, scale: 3 }).notNull(),
});
// Append-only, hash-chained audit ledger.
// Every stock-affecting event writes exactly one row here.
// prevHash + this row's canonical payload -> hash, so any row edited
// after the fact breaks the chain from that point forward and is detectable.
exports.ledgerEntries = (0, pg_core_1.pgTable)("ledger_entries", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    documentId: (0, pg_core_1.integer)("document_id").references(() => exports.documents.id),
    productId: (0, pg_core_1.integer)("product_id").references(() => exports.products.id).notNull(),
    warehouseId: (0, pg_core_1.integer)("warehouse_id").references(() => exports.warehouses.id).notNull(),
    deltaQuantity: (0, pg_core_1.numeric)("delta_quantity", { precision: 14, scale: 3 }).notNull(), // signed
    reason: (0, pg_core_1.varchar)("reason", { length: 32 }).notNull(), // receipt|delivery|transfer_out|transfer_in|adjustment
    prevHash: (0, pg_core_1.varchar)("prev_hash", { length: 64 }).notNull(),
    hash: (0, pg_core_1.varchar)("hash", { length: 64 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
