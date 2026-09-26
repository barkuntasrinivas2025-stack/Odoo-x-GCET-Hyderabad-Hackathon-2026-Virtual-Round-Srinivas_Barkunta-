import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import { db } from "./lib/db";
import { appendLedgerEntry, verifyLedgerIntegrity } from "./lib/ledger";
import { computeStockRisk } from "./lib/forecast";
import { documents, documentLines } from "./db/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: "*" } });

// Clients join a room per warehouse so updates only reach relevant dashboards.
io.on("connection", (socket) => {
  socket.on("join_warehouse", (warehouseId: number) => {
    socket.join(`warehouse:${warehouseId}`);
  });
});

/**
 * Validate a document (receipt/delivery/transfer/adjustment).
 * Writes ledger entries, updates cached stock, then broadcasts the delta
 * to every connected dashboard for that warehouse — this is the "live"
 * moment: no polling, no refresh, the KPI number just moves.
 */
app.post("/api/documents", async (req, res) => {
  try {
    const {
      docType,
      sourceWarehouseId,
      destWarehouseId,
      reference,
      lines,
    } = req.body;

    if (!["receipt", "delivery", "transfer", "adjustment"].includes(docType)) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "At least one line is required" });
    }

    const [document] = await db
      .insert(documents)
      .values({
        docType,
        sourceWarehouseId: sourceWarehouseId ?? null,
        destWarehouseId: destWarehouseId ?? null,
        reference: reference ?? null,
        status: "draft",
      })
      .returning();

    for (const line of lines) {
      await db.insert(documentLines).values({
        documentId: document.id,
        productId: Number(line.productId),
        quantity: String(line.quantity),
      });
    }

    res.status(201).json({
      ok: true,
      documentId: document.id,
    });
  } catch (error) {
    console.error("Create document failed:", error);
    res.status(500).json({ error: "Failed to create document" });
  }
});
app.post("/api/documents/:id/validate", async (req, res) => {
  const docId = Number(req.params.id);

  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.status === "done") return res.status(400).json({ error: "Already validated" });

  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, docId));

  const reasonMap: Record<string, "receipt" | "delivery" | "transfer_out" | "adjustment"> = {
    receipt: "receipt",
    delivery: "delivery",
    transfer: "transfer_out",
    adjustment: "adjustment",
  };

  const signMap: Record<string, 1 | -1> = {
    receipt: 1,
    delivery: -1,
    transfer: -1, // source side; destination side handled separately for transfers
    adjustment: 1, // adjustment line stores the signed delta itself
  };

  for (const line of lines) {
    const qty = Number(line.quantity);
    const delta = doc.docType === "adjustment" ? qty : qty * signMap[doc.docType];

    const entry = await appendLedgerEntry(db, {
      documentId: doc.id,
      productId: line.productId,
      warehouseId: doc.sourceWarehouseId ?? doc.destWarehouseId!,
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
      const entry = await appendLedgerEntry(db, {
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

  await db
    .update(documents)
    .set({ status: "done", validatedAt: new Date() })
    .where(eq(documents.id, docId));

  res.json({ ok: true });
});

app.get("/api/dashboard/risk", async (_req, res) => {
  const risk = await computeStockRisk(db);
  res.json(risk);
});

// This is the "prove it wasn't tampered with" button for the demo.
app.get("/api/ledger/verify", async (_req, res) => {
  const result = await verifyLedgerIntegrity(db);
  res.json(result);
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
httpServer.listen(PORT, () => console.log(`StockSense API on :${PORT}`));
