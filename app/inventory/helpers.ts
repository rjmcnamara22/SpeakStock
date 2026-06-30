import type {
  InventoryProduct,
  InventorySubmissionPreview,
  InventorySummaryRow,
} from "@/types/inventory";

type SquareInventoryHistoryItem = {
  id?: string;
  type: "ADJUSTMENT" | "UNKNOWN";
  catalogObjectId?: string;
  locationId?: string;
  quantity?: string;
  fromState?: string;
  toState?: string;
  occurredAt?: string;
  calculatedAt?: string;
  referenceId?: string;
  source?: string;
  label: "Lost" | "Inventory Received" | "Other";
};

export function buildSubmissionPreview(
  discrepancyRows: InventorySummaryRow[],
): InventorySubmissionPreview[] {
  return discrepancyRows.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    squareCount: row.squareCount,
    physicalCount: row.localCount,
    difference: row.difference,
    label: getSubmissionLabel(row.difference),
  }));
}

export function formatHistoricalEntryDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatHistoryDate(value?: string): string {
  if (!value) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatSubmittedSessionDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getAdjustmentActionText(difference: number): string {
  if (difference < 0) {
    return `Apply ${difference} as Lost`;
  }

  if (difference > 0) {
    return `Apply +${difference} as Inventory Received`;
  }

  return "No correction";
}

export function getDifferenceLabel(difference: number): string {
  if (difference < 0) return "Lost";
  if (difference > 0) return "Inventory Received";
  return "No correction";
}

export function getHistoryItemTitle(item: SquareInventoryHistoryItem): string {
  if (item.label === "Inventory Received") {
    return "Inventory Received";
  }

  if (item.label === "Lost") {
    return "Lost";
  }

  if (
    item.type === "ADJUSTMENT" &&
    item.fromState === "IN_STOCK" &&
    item.toState === "WASTE"
  ) {
    return "Lost";
  }

  return "Inventory Change";
}

export function getProductNameForHistoryItem(
  item: SquareInventoryHistoryItem,
  products: InventoryProduct[],
): string {
  const product = products.find(
    (candidate) => candidate.id === item.catalogObjectId,
  );

  return product?.name ?? item.catalogObjectId ?? "Unknown product";
}

export function getSubmissionLabel(
  difference: number,
): "Lost" | "Inventory Received" {
  return difference < 0 ? "Lost" : "Inventory Received";
}
