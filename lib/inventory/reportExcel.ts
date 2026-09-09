import ExcelJS from "exceljs";

export type ReportSummaryRow = {
  productName: string;
  operatorName: string;
  squareCount: number;
  physicalCount: number;
  difference: number;
  sevenDayDifference: number;
  adjustment: "Lost" | "Inventory Received" | "None";
};

export type ReportEntryRow = {
  time: string;
  operatorName: string;
  productName: string;
  quantity: number;
  rawText: string;
  source: "typed" | "voice";
};

type InventoryReport = {
  summaryRows: ReportSummaryRow[];
  entryRows: ReportEntryRow[];
  reportDate: Date;
};

export async function buildInventoryReportExcel({
  summaryRows,
  entryRows,
  reportDate,
}: InventoryReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "SpeakStock";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Daily Summary");
  const entrySheet = workbook.addWorksheet("Entry History");

  summarySheet.columns = [
    { header: "Product", key: "productName", width: 28 },
    { header: "Operator", key: "operatorName", width: 20 },
    { header: "Square Count", key: "squareCount", width: 16 },
    { header: "Physical Count", key: "physicalCount", width: 18 },
    { header: "Difference", key: "difference", width: 14 },
    {
      header: "7-Day Difference",
      key: "sevenDayDifference",
      width: 18,
    },
    { header: "Adjustment", key: "adjustment", width: 24 },
  ];

  for (const row of summaryRows) {
    summarySheet.addRow(row);
  }

  entrySheet.columns = [
    { header: "Time", key: "time", width: 14 },
    { header: "Operator", key: "operatorName", width: 20 },
    { header: "Product", key: "productName", width: 28 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Input", key: "rawText", width: 32 },
    { header: "Source", key: "source", width: 12 },
  ];

  for (const row of entryRows) {
    entrySheet.addRow(row);
  }

  for (const sheet of [summarySheet, entrySheet]) {
    const headerRow = sheet.getRow(1);

    headerRow.font = {
      bold: true,
    };

    headerRow.alignment = {
      vertical: "middle",
    };

    sheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    sheet.autoFilter = {
      from: "A1",
      to: `${String.fromCharCode(64 + sheet.columnCount)}1`,
    };
  }

  const reportDateText = reportDate.toISOString().slice(0, 10);

  summarySheet.addRow([]);
  summarySheet.addRow(["Report Date", reportDateText]);

  const buffer = await workbook.xlsx.writeBuffer();

  return Buffer.from(buffer);
}

export function buildInventoryReportFilename(reportDate: Date): string {
  const dateText = reportDate.toISOString().slice(0, 10);

  return `SpeakStock_Inventory_${dateText}.xlsx`;
}
