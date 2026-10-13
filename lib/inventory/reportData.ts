import { sql } from "@/lib/db/client";
import { loadSquareProducts } from "@/lib/inventory/loadSquareProducts";
import type {
  ReportEntryRow,
  ReportSummaryRow,
} from "@/lib/inventory/reportExcel";

type SubmissionItemRow = {
  product_id: string;
  product_name: string;
  square_count: number;
  physical_count: number;
  difference: number;
  label: string;
};

type EntryRow = {
  created_at: string;
  product_name: string;
  quantity: number;
  raw_text: string;
  source: string;
};

type SevenDayDifferenceRow = {
  product_id: string;
  product_name: string;
  total_difference: number | string | null;
};

type BuildReportDataOptions = {
  submissionId: string;
  submittedAt: string;
};

type InventoryReportData = {
  summaryRows: ReportSummaryRow[];
  entryRows: ReportEntryRow[];
};

export async function buildInventoryReportData({
  submissionId,
  submittedAt,
}: BuildReportDataOptions): Promise<InventoryReportData> {
  const submissionItems = (await sql`
    SELECT
      product_id,
      product_name,
      square_count,
      physical_count,
      difference,
      label
    FROM inventory_submission_items
    WHERE submission_id = ${submissionId}
    ORDER BY product_name ASC
  `) as SubmissionItemRow[];

  const entries = (await sql`
    SELECT
      product_id,
      created_at,
      product_name,
      quantity,
      raw_text,
      source
    FROM inventory_entries
    WHERE submission_id = ${submissionId}
    ORDER BY created_at ASC
`) as EntryRow[];

  const sevenDayDifferences = (await sql`
    SELECT
      isi.product_id,
      (ARRAY_AGG(
        isi.product_name
        ORDER BY isi.created_at DESC
      ))[1] AS product_name,
      SUM(isi.difference) AS total_difference
    FROM inventory_submission_items AS isi
    WHERE isi.created_at >= (
      (
        ${submittedAt}::timestamptz
        AT TIME ZONE 'America/New_York'
      )::date - INTERVAL '7 days'
    ) AT TIME ZONE 'America/New_York'
      AND isi.created_at < (
        (
          ${submittedAt}::timestamptz
          AT TIME ZONE 'America/New_York'
        )::date::timestamp
      ) AT TIME ZONE 'America/New_York'
      AND isi.difference <> 0
    GROUP BY isi.product_id
  `) as SevenDayDifferenceRow[];

  const summaryByProduct = new Map<string, ReportSummaryRow>();

  for (const row of sevenDayDifferences) {
    summaryByProduct.set(row.product_id, {
      productName: row.product_name,
      squareCount: null,
      physicalCount: null,
      difference: 0,
      sevenDayDifference: Number(row.total_difference ?? 0),
      adjustment: "None",
    });
  }

  for (const item of submissionItems) {
    const existing = summaryByProduct.get(item.product_id);

    if (Number(item.difference) === 0 && !existing) {
      continue;
    }

    summaryByProduct.set(item.product_id, {
      productName: item.product_name,
      squareCount: Number(item.square_count),
      physicalCount: Number(item.physical_count),
      difference: Number(item.difference),
      sevenDayDifference: existing?.sevenDayDifference ?? 0,
      adjustment:
        item.label === "Lost" || item.label === "Inventory Received"
          ? item.label
          : "None",
    });
  }

  const squareProducts = await loadSquareProducts();

  const squareCountByProduct = new Map(
    squareProducts.map((product) => [product.id, product.squareCount]),
  );

  for (const [productId, row] of summaryByProduct) {
    if (row.squareCount === null) {
      row.squareCount = squareCountByProduct.get(productId) ?? null;
    }
  }

  const summaryRows = Array.from(summaryByProduct.values()).sort((a, b) =>
    a.productName.localeCompare(b.productName),
  );

  const entryRows: ReportEntryRow[] = entries.map((entry) => ({
    time: new Date(entry.created_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }),
    productName: entry.product_name,
    quantity: Number(entry.quantity),
    rawText: entry.raw_text,
    source: entry.source === "voice" ? "voice" : "typed",
  }));

  return {
    summaryRows,
    entryRows,
  };
}
