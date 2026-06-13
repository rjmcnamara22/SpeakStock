import type {
  CountEntry,
  InventoryProduct,
  InventorySummaryRow,
} from "@/types/inventory";

export function buildInventorySummary(
  products: InventoryProduct[],
  entries: CountEntry[],
): InventorySummaryRow[] {
  const localCounts = new Map<string, number>();

  for (const entry of entries) {
    const currentCount = localCounts.get(entry.productId) ?? 0;
    localCounts.set(entry.productId, currentCount + entry.quantity);
  }

  const countedProductIds = new Set(entries.map((entry) => entry.productId));

  return products
    .filter((product) => countedProductIds.has(product.id))
    .map((product) => {
      const localCount = localCounts.get(product.id) ?? 0;

      return {
        productId: product.id,
        productName: product.name,
        squareCount: product.squareCount,
        localCount,
        difference: localCount - product.squareCount,
      };
    });
}

export function getDiscrepancyRows(
  summaryRows: InventorySummaryRow[],
): InventorySummaryRow[] {
  return summaryRows.filter((row) => row.difference !== 0);
}
