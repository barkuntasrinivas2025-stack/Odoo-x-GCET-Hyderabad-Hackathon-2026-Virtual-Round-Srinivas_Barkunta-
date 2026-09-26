import { sql } from "drizzle-orm";
import type { db as DbType } from "./db";

export interface StockRisk {
  productId: number;
  sku: string;
  name: string;
  currentStock: number;
  avgDailyConsumption: number;
  daysOfCover: number | null; // null = no recent consumption, can't forecast
  riskLevel: "critical" | "warning" | "ok";
}

/**
 * For each product, looks at outbound ledger entries (deliveries) over the
 * trailing window, computes average daily consumption, and derives days
 * until stockout at current velocity. This replaces the spec's static
 * "reorder point" flag with a ranked, actionable list.
 */
export async function computeStockRisk(
  db: typeof DbType,
  windowDays = 14
): Promise<StockRisk[]> {
  const rows = await db.execute<{
    product_id: number;
    sku: string;
    name: string;
    current_stock: string;
    total_consumed: string;
  }>(sql`
    SELECT
      p.id AS product_id,
      p.sku,
      p.name,
      COALESCE(sl.quantity, 0) AS current_stock,
      COALESCE(SUM(
        CASE WHEN le.reason = 'delivery' AND le.created_at >= NOW() - (${windowDays} || ' days')::interval
        THEN ABS(le.delta_quantity) ELSE 0 END
      ), 0) AS total_consumed
    FROM products p
    LEFT JOIN stock_levels sl ON sl.product_id = p.id
    LEFT JOIN ledger_entries le ON le.product_id = p.id
    GROUP BY p.id, p.sku, p.name, sl.quantity
  `);

  return rows.rows.map((r) => {
    const currentStock = Number(r.current_stock);
    const avgDaily = Number(r.total_consumed) / windowDays;
    const daysOfCover = avgDaily > 0 ? currentStock / avgDaily : null;

    let riskLevel: StockRisk["riskLevel"] = "ok";
    if (daysOfCover !== null) {
      if (daysOfCover <= 3) riskLevel = "critical";
      else if (daysOfCover <= 7) riskLevel = "warning";
    } else if (currentStock === 0) {
      riskLevel = "critical";
    }

    return {
      productId: r.product_id,
      sku: r.sku,
      name: r.name,
      currentStock,
      avgDailyConsumption: Number(avgDaily.toFixed(2)),
      daysOfCover: daysOfCover !== null ? Number(daysOfCover.toFixed(1)) : null,
      riskLevel,
    };
  }).sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity));
}
