import { sql } from "@/lib/db/client";
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
      product_id,
      SUM(difference) AS total_difference
    FROM inventory_submission_items
    WHERE created_at >= ${submittedAt}::timestamptz - INTERVAL '7 days'
      AND created_at <= ${submittedAt}::timestamptz
    GROUP BY product_id
  `) as SevenDayDifferenceRow[];

  const sevenDayDifferenceByProduct = new Map(
    sevenDayDifferences.map((row) => [
      row.product_id,
      Number(row.total_difference ?? 0),
    ]),
  );

  const summaryRows: ReportSummaryRow[] = submissionItems.map((item) => ({
    productName: item.product_name,
    squareCount: item.square_count,
    physicalCount: item.physical_count,
    difference: item.difference,
    sevenDayDifference:
      sevenDayDifferenceByProduct.get(item.product_id) ?? item.difference,
    adjustment:
      item.label === "Lost" || item.label === "Inventory Received"
        ? item.label
        : "None",
  }));

  const entryRows: ReportEntryRow[] = entries.map((entry) => ({
    time: new Date(entry.created_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }),
    productName: entry.product_name,
    quantity: entry.quantity,
    rawText: entry.raw_text,
    source: entry.source === "voice" ? "voice" : "typed",
  }));

  return {
    summaryRows,
    entryRows,
  };
}
