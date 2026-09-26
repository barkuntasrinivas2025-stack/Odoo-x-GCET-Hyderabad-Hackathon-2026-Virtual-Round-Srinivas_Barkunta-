export const API_BASE = "http://localhost:4000";

export interface StockRisk {
  productId: number;
  sku: string;
  name: string;
  currentStock: number;
  avgDailyConsumption: number;
  daysOfCover: number | null;
  riskLevel: "critical" | "warning" | "ok";
}

export async function getRisk(): Promise<StockRisk[]> {
  const response = await fetch(`${API_BASE}/api/dashboard/risk`);

  if (!response.ok) {
    throw new Error("Failed to load stock risk");
  }

  return response.json();
}

export async function verifyLedger() {
  const response = await fetch(`${API_BASE}/api/ledger/verify`);

  if (!response.ok) {
    throw new Error("Failed to verify ledger");
  }

  return response.json();
}

export async function createDocument(payload: {
  docType: "receipt";
  destWarehouseId: number;
  reference?: string;
  lines: {
    productId: number;
    quantity: number;
  }[];
}) {
  const response = await fetch(`${API_BASE}/api/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to create document");
  }

  return response.json();
}

export async function validateDocument(documentId: number) {
  const response = await fetch(
    `${API_BASE}/api/documents/${documentId}/validate`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to validate document");
  }

  return response.json();
}
