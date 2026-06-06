import type {
  CountEntry,
  InventoryProduct,
  InventorySummaryRow,
} from "@/types/inventory";

export function buildInventorySummary(
  products: InventoryProduct[],
  entries: CountEntry[]
): InventorySummaryRow[] {
  return products.map((product) => {
    const localCount = entries
      .filter((entry) => entry.productId === product.id)
      .reduce((sum, entry) => sum + entry.quantity, 0);

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
  summaryRows: InventorySummaryRow[]
): InventorySummaryRow[] {
  return summaryRows.filter((row) => row.difference !== 0);
}