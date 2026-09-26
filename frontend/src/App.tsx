import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  createDocument,
  getRisk,
  validateDocument,
  verifyLedger,
  type StockRisk,
} from "./api";
import "./App.css";

const SOCKET_URL = "http://localhost:4000";

function App() {
  const [risk, setRisk] = useState<StockRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [ledger, setLedger] = useState<{
    valid: boolean;
    checkedRows?: number;
    brokenAtId?: number;
    reason?: string;
  } | null>(null);

  const [showReceive, setShowReceive] = useState(false);
  const [productId, setProductId] = useState(3);
  const [quantity, setQuantity] = useState(20);
  const [receiving, setReceiving] = useState(false);

  async function refreshRisk() {
    try {
      setError("");
      const data = await getRisk();
      setRisk(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshRisk();

    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
      setLive(true);
      socket.emit("join_warehouse", 1);
    });

    socket.on("disconnect", () => {
      setLive(false);
    });

    socket.on("stock_delta", () => {
      refreshRisk();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const counts = useMemo(
    () => ({
      critical: risk.filter((item) => item.riskLevel === "critical").length,
      warning: risk.filter((item) => item.riskLevel === "warning").length,
      ok: risk.filter((item) => item.riskLevel === "ok").length,
    }),
    [risk]
  );

  async function handleVerifyLedger() {
    try {
      setVerifying(true);
      const result = await verifyLedger();
      setLedger(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ledger verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleReceive() {
    if (quantity <= 0) return;

    try {
      setReceiving(true);
      setError("");

      const created = await createDocument({
        docType: "receipt",
        destWarehouseId: 1,
        reference: `DASHBOARD-${Date.now()}`,
        lines: [
          {
            productId,
            quantity,
          },
        ],
      });

      await validateDocument(created.documentId);

      await refreshRisk();

      setShowReceive(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receiving stock failed");
    } finally {
      setReceiving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            <span className="brand-mark">S</span>
            <span>StockSense</span>
          </div>
          <p className="subtitle">Predictive inventory intelligence</p>
        </div>

        <div className={`live-status ${live ? "online" : ""}`}>
          <span />
          {live ? "LIVE" : "OFFLINE"}
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div>
            <p className="eyebrow">WAREHOUSE · HYD-01</p>
            <h1>Inventory Risk</h1>
            <p>
              Stock coverage calculated from recent consumption velocity.
            </p>
          </div>

          <button className="primary-button" onClick={() => setShowReceive(true)}>
            + Receive Stock
          </button>
        </section>

        {error && <div className="error-banner">{error}</div>}

        <section className="summary-grid">
          <div className="summary-card critical-card">
            <span className="summary-label">Critical</span>
            <strong>{counts.critical}</strong>
            <small>≤ 3 days of cover</small>
          </div>

          <div className="summary-card warning-card">
            <span className="summary-label">Warning</span>
            <strong>{counts.warning}</strong>
            <small>≤ 7 days of cover</small>
          </div>

          <div className="summary-card healthy-card">
            <span className="summary-label">Healthy</span>
            <strong>{counts.ok}</strong>
            <small>More than 7 days</small>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">FORECAST</p>
              <h2>Stock coverage</h2>
            </div>
            <span className="window-badge">14-day consumption window</span>
          </div>

          {loading ? (
            <div className="empty-state">Loading inventory intelligence...</div>
          ) : (
            <div className="risk-table">
              <div className="table-row table-heading">
                <span>PRODUCT</span>
                <span>STOCK</span>
                <span>DAILY USE</span>
                <span>DAYS OF COVER</span>
                <span>STATUS</span>
              </div>

              {risk.map((item) => (
                <div className="table-row" key={item.productId}>
                  <div className="product-cell">
                    <strong>{item.name}</strong>
                    <small>{item.sku}</small>
                  </div>

                  <span>{item.currentStock.toLocaleString()} units</span>

                  <span>{item.avgDailyConsumption.toFixed(2)} / day</span>

                  <div className="cover-cell">
                    <strong>
                      {item.daysOfCover === null
                        ? "—"
                        : `${item.daysOfCover.toFixed(1)}d`}
                    </strong>

                    {item.daysOfCover !== null && (
                      <div className="cover-bar">
                        <span
                          style={{
                            width: `${Math.min(
                              Math.max(item.daysOfCover * 3, 5),
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <span className={`risk-badge ${item.riskLevel}`}>
                    {item.riskLevel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bottom-grid">
          <div className="panel ledger-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">AUDIT TRAIL</p>
                <h2>Ledger integrity</h2>
              </div>
            </div>

            <p className="ledger-description">
              Every stock movement is chained cryptographically. Any database
              modification breaks the chain and is detectable.
            </p>

            <button
              className="verify-button"
              onClick={handleVerifyLedger}
              disabled={verifying}
            >
              {verifying ? "VERIFYING..." : "VERIFY LEDGER"}
            </button>

            {ledger && (
              <div className={`ledger-result ${ledger.valid ? "valid" : "invalid"}`}>
                <span className="result-icon">
                  {ledger.valid ? "✓" : "!"}
                </span>

                <div>
                  <strong>
                    {ledger.valid
                      ? `${ledger.checkedRows} records valid`
                      : `Broken at record ${ledger.brokenAtId}`}
                  </strong>

                  <small>
                    {ledger.valid
                      ? "Hash chain integrity confirmed"
                      : ledger.reason}
                  </small>
                </div>
              </div>
            )}
          </div>

          <div className="panel demo-panel">
            <p className="eyebrow">LIVE DEMO</p>
            <h2>Inventory event pipeline</h2>

            <div className="pipeline">
              <span>Receive</span>
              <b>→</b>
              <span>Validate</span>
              <b>→</b>
              <span>Ledger</span>
              <b>→</b>
              <span>Forecast</span>
            </div>

            <p>
              Stock changes are broadcast to connected dashboards through
              Socket.IO without a page refresh.
            </p>
          </div>
        </section>
      </main>

      {showReceive && (
        <div className="modal-backdrop" onClick={() => setShowReceive(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">INVENTORY EVENT</p>
                <h2>Receive stock</h2>
              </div>

              <button
                className="close-button"
                onClick={() => setShowReceive(false)}
              >
                ×
              </button>
            </div>

            <label>
              Product
              <select
                value={productId}
                onChange={(event) => setProductId(Number(event.target.value))}
              >
                {risk.map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {item.name} · {item.sku}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Quantity
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </label>

            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setShowReceive(false)}
              >
                Cancel
              </button>

              <button
                className="primary-button"
                onClick={handleReceive}
                disabled={receiving}
              >
                {receiving ? "PROCESSING..." : "Receive & Validate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;