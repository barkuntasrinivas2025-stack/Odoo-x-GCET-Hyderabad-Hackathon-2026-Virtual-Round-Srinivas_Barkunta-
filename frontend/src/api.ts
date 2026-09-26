export interface StockRisk {
  productId: number;
  sku: string;
  name: string;
  currentStock: number;
  avgDailyConsumption: number;
  daysOfCover: number | null;
  riskLevel: "critical" | "warning" | "ok";
}

const API_URL = "http://localhost:4000";

export async function fetchRisk(): Promise<StockRisk[]> {
  const response = await fetch(
    `${API_URL}/api/dashboard/risk`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch risk data");
  }

  return response.json();
}

export async function verifyLedger(): Promise<{
  valid: boolean;
  checkedRows: number;
}> {
  const response = await fetch(
    `${API_URL}/api/ledger/verify`
  );

  if (!response.ok) {
    throw new Error("Failed to verify ledger");
  }

  return response.json();
}

export async function receiveStock(
  productId: number,
  quantity: number
) {
  const createResponse = await fetch(
    `${API_URL}/api/documents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        docType: "receipt",
        destWarehouseId: 1,
        reference: `UI-RECEIPT-${Date.now()}`,
        lines: [
          {
            productId,
            quantity,
          },
        ],
      }),
    }
  );

  if (!createResponse.ok) {
    throw new Error("Failed to create receipt");
  }

  const document = await createResponse.json();

  const validateResponse = await fetch(
    `${API_URL}/api/documents/${document.documentId}/validate`,
    {
      method: "POST",
    }
  );

  if (!validateResponse.ok) {
    throw new Error("Failed to validate receipt");
  }

  return validateResponse.json();
}