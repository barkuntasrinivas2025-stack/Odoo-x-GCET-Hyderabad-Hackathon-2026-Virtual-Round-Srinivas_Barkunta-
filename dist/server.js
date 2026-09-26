"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./lib/db");
const ledger_1 = require("./lib/ledger");
const forecast_1 = require("./lib/forecast");
const schema_1 = require("./db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, { cors: { origin: "*" } });
// Clients join a room per warehouse so updates only reach relevant dashboards.
io.on("connection", (socket) => {
    socket.on("join_warehouse", (warehouseId) => {
        socket.join(`warehouse:${warehouseId}`);
    });
});
/**
 * Validate a document (receipt/delivery/transfer/adjustment).
 * Writes ledger entries, updates cached stock, then broadcasts the delta
 * to every connected dashboard for that warehouse — this is the "live"
 * moment: no polling, no refresh, the KPI number just moves.
 */
app.post("/api/documents/:id/validate", async (req, res) => {
    const docId = Number(req.params.id);
    const [doc] = await db_1.db.select().from(schema_1.documents).where((0, drizzle_orm_1.eq)(schema_1.documents.id, docId));
    if (!doc)
        return res.status(404).json({ error: "Document not found" });
    if (doc.status === "done")
        return res.status(400).json({ error: "Already validated" });
    const lines = await db_1.db
        .select()
        .from(schema_1.documentLines)
        .where((0, drizzle_orm_1.eq)(schema_1.documentLines.documentId, docId));
    const reasonMap = {
        receipt: "receipt",
        delivery: "delivery",
        transfer: "transfer_out",
        adjustment: "adjustment",
    };
    const signMap = {
        receipt: 1,
        delivery: -1,
        transfer: -1, // source side; destination side handled separately for transfers
        adjustment: 1, // adjustment line stores the signed delta itself
    };
    for (const line of lines) {
        const qty = Number(line.quantity);
        const delta = doc.docType === "adjustment" ? qty : qty * signMap[doc.docType];
        const entry = await (0, ledger_1.appendLedgerEntry)(db_1.db, {
            documentId: doc.id,
            productId: line.productId,
            warehouseId: doc.sourceWarehouseId ?? doc.destWarehouseId,
            deltaQuantity: delta,
            reason: reasonMap[doc.docType],
        });
        io.to(`warehouse:${doc.sourceWarehouseId ?? doc.destWarehouseId}`).emit("stock_delta", {
            productId: line.productId,
            delta,
            docType: doc.docType,
            ledgerEntryId: entry.id,
        });
    }
    // Transfers also credit the destination warehouse
    if (doc.docType === "transfer" && doc.destWarehouseId) {
        for (const line of lines) {
            const qty = Number(line.quantity);
            const entry = await (0, ledger_1.appendLedgerEntry)(db_1.db, {
                documentId: doc.id,
                productId: line.productId,
                warehouseId: doc.destWarehouseId,
                deltaQuantity: qty,
                reason: "transfer_in",
            });
            io.to(`warehouse:${doc.destWarehouseId}`).emit("stock_delta", {
                productId: line.productId,
                delta: qty,
                docType: "transfer_in",
                ledgerEntryId: entry.id,
            });
        }
    }
    await db_1.db
        .update(schema_1.documents)
        .set({ status: "done", validatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.documents.id, docId));
    res.json({ ok: true });
});
app.get("/api/dashboard/risk", async (_req, res) => {
    const risk = await (0, forecast_1.computeStockRisk)(db_1.db);
    res.json(risk);
});
// This is the "prove it wasn't tampered with" button for the demo.
app.get("/api/ledger/verify", async (_req, res) => {
    const result = await (0, ledger_1.verifyLedgerIntegrity)(db_1.db);
    res.json(result);
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
httpServer.listen(PORT, () => console.log(`StockSense API on :${PORT}`));
