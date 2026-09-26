import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  varchar,
  pgEnum,
} from "drizzle-orm/pg-core";

export const docTypeEnum = pgEnum("doc_type", [
  "receipt",
  "delivery",
  "transfer",
  "adjustment",
]);

export const docStatusEnum = pgEnum("doc_status", [
  "draft",
  "waiting",
  "ready",
  "done",
  "canceled",
]);

export const roleEnum = pgEnum("role", ["manager", "staff"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("staff"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  unitOfMeasure: varchar("unit_of_measure", { length: 32 }).notNull(),
  reorderPoint: integer("reorder_point").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Current on-hand quantity per product per warehouse.
// This is a derived/cache table — the ledger below is the source of truth.
export const stockLevels = pgTable("stock_levels", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id).notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  docType: docTypeEnum("doc_type").notNull(),
  status: docStatusEnum("status").notNull().default("draft"),
  sourceWarehouseId: integer("source_warehouse_id").references(() => warehouses.id),
  destWarehouseId: integer("dest_warehouse_id").references(() => warehouses.id),
  reference: varchar("reference", { length: 120 }), // supplier/customer/note
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  validatedAt: timestamp("validated_at"),
});

export const documentLines = pgTable("document_lines", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
});

// Append-only, hash-chained audit ledger.
// Every stock-affecting event writes exactly one row here.
// prevHash + this row's canonical payload -> hash, so any row edited
// after the fact breaks the chain from that point forward and is detectable.
export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id).notNull(),
  deltaQuantity: numeric("delta_quantity", { precision: 14, scale: 3 }).notNull(), // signed
  reason: varchar("reason", { length: 32 }).notNull(), // receipt|delivery|transfer_out|transfer_in|adjustment
  prevHash: varchar("prev_hash", { length: 64 }).notNull(),
  hash: varchar("hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
