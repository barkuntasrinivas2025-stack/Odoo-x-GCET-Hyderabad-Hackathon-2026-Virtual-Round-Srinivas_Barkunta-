import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";
import {
  fetchRisk,
  verifyLedger,
  receiveStock,
  type StockRisk,
} from "./api";

const API_URL = "http://localhost:4000";

function App() {
  const [risk, setRisk] = useState<StockRisk[]>([]);
  const [ledgerValid, setLedgerValid] = useState<boolean | null>(null);
  const [checkedRows, setCheckedRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [eventMessage, setEventMessage] = useState("");

  const loadDashboard = async () => {
    try {
      const data = await fetchRisk();
      setRisk(data);

      const ledger = await verifyLedger();
      setLedgerValid(ledger.valid);
      setCheckedRows(ledger.checkedRows);
    } catch (error) {
      console.error("Dashboard load failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();

    const socket = io(API_URL);

    socket.on("stock_delta", () => {
      loadDashboard();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const critical = useMemo(
    () => risk.filter((item) => item.riskLevel === "critical").length,
    [risk]
  );

  const warning = useMemo(
    () => risk.filter((item) => item.riskLevel === "warning").length,
    [risk]
  );

  const healthy = useMemo(
    () => risk.filter((item) => item.riskLevel === "ok").length,
    [risk]
  );

  const handleVerify = async () => {
    setVerifying(true);

    try {
      const result = await verifyLedger();
      setLedgerValid(result.valid);
      setCheckedRows(result.checkedRows);
    } finally {
      setVerifying(false);
    }
  };

  const handleReceive = async (
    productId: number,
    quantity: number
  ) => {
    setReceiving(true);
    setEventMessage("");

    try {
      await receiveStock(productId, quantity);

      setEventMessage(
        `Received ${quantity} units successfully.`
      );

      await loadDashboard();

      setTimeout(() => {
        setEventMessage("");
      }, 3000);
    } catch (error) {
      console.error(error);
      setEventMessage("Failed to receive stock.");
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>

          <div>
            <div className="brand-name">StockSense</div>
            <div className="brand-subtitle">
              Predictive inventory intelligence
            </div>
          </div>
        </div>

        <div className="topbar-meta">
          <span className="status-dot" />
          <span>ONLINE</span>
          <span className="separator">•</span>
          <span>WAREHOUSE · HYD-01</span>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div>
            <p className="eyebrow">INVENTORY CONTROL</p>

            <h1>Inventory Risk</h1>

            <p className="hero-description">
              Stock coverage calculated from recent consumption
              velocity.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => setShowReceive(true)}
          >
            <span>＋</span>
            Receive Stock
          </button>
        </section>

        <section className="risk-summary">
          <div className="risk-card critical">
            <span className="risk-label">CRITICAL</span>
            <strong>{critical}</strong>
            <span>≤ 3 days of cover</span>
          </div>

          <div className="risk-card warning">
            <span className="risk-label">WARNING</span>
            <strong>{warning}</strong>
            <span>≤ 7 days of cover</span>
          </div>

          <div className="risk-card healthy">
            <span className="risk-label">HEALTHY</span>
            <strong>{healthy}</strong>
            <span>More than 7 days</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">FORECAST</p>
              <h2>Stock coverage</h2>
            </div>

            <span className="window-badge">
              14-day consumption window
            </span>
          </div>

          <div className="table-header">
            <span>PRODUCT</span>
            <span>STOCK</span>
            <span>DAILY USED</span>
            <span>DAYS OF COVER</span>
            <span>STATUS</span>
          </div>

          {loading ? (
            <div className="empty-state">
              Loading inventory intelligence...
            </div>
          ) : (
            risk.map((item) => (
              <RiskRow
                key={item.productId}
                item={item}
              />
            ))
          )}
        </section>

        <section className="bottom-grid">
          <div className="panel audit-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">AUDIT TRAIL</p>
                <h2>Ledger integrity</h2>
              </div>
            </div>

            <p className="audit-description">
              Every stock movement is chained cryptographically.
              Any database modification breaks the chain and is
              detectable.
            </p>

            <button
              className="verify-button"
              onClick={handleVerify}
              disabled={verifying}
            >
              {verifying ? "VERIFYING..." : "VERIFY LEDGER"}
            </button>

            <div
              className={`ledger-result ${
                ledgerValid ? "valid" : "invalid"
              }`}
            >
              <div className="ledger-icon">
                {ledgerValid ? "✓" : "!"}
              </div>

              <div>
                <strong>
                  {ledgerValid
                    ? `${checkedRows} records valid`
                    : "Integrity check failed"}
                </strong>

                <span>
                  {ledgerValid
                    ? "Hash chain integrity confirmed"
                    : "Hash chain requires investigation"}
                </span>
              </div>
            </div>
          </div>

          <div className="panel pipeline-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">LIVE DEMO</p>
                <h2>Inventory event pipeline</h2>
              </div>
            </div>

            <div className="pipeline">
              <PipelineStep label="Receive" />
              <PipelineArrow />
              <PipelineStep label="Validate" />
              <PipelineArrow />
              <PipelineStep label="Ledger" />
              <PipelineArrow />
              <PipelineStep label="Forecast" />
            </div>

            <p className="pipeline-description">
              Stock changes are broadcast to connected dashboards
              through Socket.IO without a page refresh.
            </p>

            {eventMessage && (
              <div className="event-message">
                ✓ {eventMessage}
              </div>
            )}
          </div>
        </section>
      </main>

      {showReceive && (
        <ReceiveModal
          risk={risk}
          receiving={receiving}
          onClose={() => setShowReceive(false)}
          onReceive={handleReceive}
        />
      )}
    </div>
  );
}

function RiskRow({ item }: { item: StockRisk }) {
  const statusLabel =
    item.riskLevel === "critical"
      ? "CRITICAL"
      : item.riskLevel === "warning"
      ? "WARNING"
      : "OK";

  return (
    <div className="risk-row">
      <div className="product-cell">
        <strong>{item.name}</strong>
        <span>{item.sku}</span>
      </div>

      <span>{item.currentStock} units</span>

      <span>{item.avgDailyConsumption.toFixed(2)} / day</span>

      <strong className={`cover ${item.riskLevel}`}>
        {item.daysOfCover === null
          ? "—"
          : `${item.daysOfCover.toFixed(1)}d`}
      </strong>

      <span className={`status-pill ${item.riskLevel}`}>
        <i />
        {statusLabel}
      </span>
    </div>
  );
}

function PipelineStep({ label }: { label: string }) {
  return (
    <div className="pipeline-step">
      <div className="pipeline-icon">✓</div>
      <span>{label}</span>
    </div>
  );
}

function PipelineArrow() {
  return <span className="pipeline-arrow">→</span>;
}

function ReceiveModal({
  risk,
  receiving,
  onClose,
  onReceive,
}: {
  risk: StockRisk[];
  receiving: boolean;
  onClose: () => void;
  onReceive: (productId: number, quantity: number) => void;
}) {
  const [productId, setProductId] = useState(
    risk[0]?.productId ?? 1
  );
  const [quantity, setQuantity] = useState(10);

  const selected = risk.find(
    (item) => item.productId === productId
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">INVENTORY EVENT</p>
            <h2>Receive stock</h2>
          </div>

          <button
            className="close-button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <label>
          Product
          <select
            value={productId}
            onChange={(event) =>
              setProductId(Number(event.target.value))
            }
          >
            {risk.map((item) => (
              <option
                key={item.productId}
                value={item.productId}
              >
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
            onChange={(event) =>
              setQuantity(Number(event.target.value))
            }
          />
        </label>

        {selected && (
          <div className="receive-preview">
            <span>Current stock</span>
            <strong>
              {selected.currentStock} →{" "}
              {selected.currentStock + quantity} units
            </strong>
          </div>
        )}

        <button
          className="primary-button modal-submit"
          disabled={receiving || quantity <= 0}
          onClick={() =>
            onReceive(productId, quantity)
          }
        >
          {receiving ? "PROCESSING..." : "RECEIVE STOCK"}
        </button>
      </div>
    </div>
  );
}

export default App;