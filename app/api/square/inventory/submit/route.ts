import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { squareClient } from "@/lib/square/client";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  buildInventoryReportExcel,
  buildInventoryReportFilename,
} from "@/lib/inventory/reportExcel";
import { buildInventoryReportData } from "@/lib/inventory/reportData";
import { sql } from "@/lib/db/client";

type InventorySubmissionItem = {
  productId: string;
  productName: string;
  squareCount: number;
  physicalCount: number;
  difference: number;
};

type InventorySubmitRequest = {
  items: InventorySubmissionItem[];
};

function isInventorySubmissionItem(
  value: unknown,
): value is InventorySubmissionItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as {
    productId?: unknown;
    productName?: unknown;
    squareCount?: unknown;
    physicalCount?: unknown;
    difference?: unknown;
  };

  return (
    typeof item.productId === "string" &&
    typeof item.productName === "string" &&
    typeof item.squareCount === "number" &&
    typeof item.physicalCount === "number" &&
    typeof item.difference === "number" &&
    Number.isInteger(item.squareCount) &&
    Number.isInteger(item.physicalCount) &&
    Number.isInteger(item.difference) &&
    item.squareCount >= 0 &&
    item.physicalCount >= 0
  );
}

function getAdjustmentReason(
  difference: number,
): "Lost" | "Inventory Received" {
  return difference < 0 ? "Lost" : "Inventory Received";
}

function buildInventoryAdjustmentChange(
  item: InventorySubmissionItem,
  locationId: string,
  occurredAt: string,
) {
  const adjustmentQuantity = Math.abs(item.difference);

  if (item.difference > 0) {
    return {
      type: "ADJUSTMENT" as const,
      adjustment: {
        referenceId: `speakstock-${randomUUID()}`,
        catalogObjectId: item.productId,
        locationId,
        fromState: "NONE" as const,
        toState: "IN_STOCK" as const,
        quantity: adjustmentQuantity.toString(),
        occurredAt,
      },
    };
  }

  return {
    type: "ADJUSTMENT" as const,
    adjustment: {
      referenceId: `speakstock-${randomUUID()}`,
      catalogObjectId: item.productId,
      locationId,
      fromState: "IN_STOCK" as const,
      toState: "WASTE" as const,
      quantity: adjustmentQuantity.toString(),
      occurredAt,
    },
  };
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { error: "Admin login required." },
      { status: 401 },
    );
  }

  try {
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!locationId) {
      return NextResponse.json(
        { error: "Missing SQUARE_LOCATION_ID environment variable." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as InventorySubmitRequest;

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "Request body must include an items array." },
        { status: 400 },
      );
    }

    const validItems = body.items.filter(isInventorySubmissionItem);

    const adjustmentItems = validItems.filter((item) => item.difference !== 0);

    if (adjustmentItems.length === 0) {
      return NextResponse.json(
        { error: "No inventory differences were submitted." },
        { status: 400 },
      );
    }

    const occurredAt = new Date().toISOString();

    const changes = adjustmentItems.map((item) =>
      buildInventoryAdjustmentChange(item, locationId, occurredAt),
    );

    const response = await squareClient.inventory.batchCreateChanges({
      idempotencyKey: randomUUID(),
      changes,
      ignoreUnchangedCounts: true,
    });

    const submissionId = randomUUID();

    await sql`
  INSERT INTO inventory_submissions (
    id,
    submitted_at,
    submitted_count
  )
  VALUES (
    ${submissionId},
    ${occurredAt},
    ${adjustmentItems.length}
  );
`;

    for (const item of adjustmentItems) {
      await sql`
    INSERT INTO inventory_submission_items (
      id,
      submission_id,
      product_id,
      product_name,
      square_count,
      physical_count,
      difference,
      label,
      adjustment_quantity,
      created_at
    )
    VALUES (
      ${randomUUID()},
      ${submissionId},
      ${item.productId},
      ${item.productName},
      ${item.squareCount},
      ${item.physicalCount},
      ${item.difference},
      ${getAdjustmentReason(item.difference)},
      ${Math.abs(item.difference)},
      ${occurredAt}
    );
  `;
    }

    await sql`
      UPDATE inventory_entries
      SET
        submitted_at = ${occurredAt},
        submission_id = ${submissionId}
      WHERE submitted_at IS NULL
        AND created_at <= ${occurredAt};
    `;

    const reportData = await buildInventoryReportData({
      submissionId,
      submittedAt: occurredAt,
    });

    const reportBuffer = await buildInventoryReportExcel({
      summaryRows: reportData.summaryRows,
      entryRows: reportData.entryRows,
    });

    const reportFilename = buildInventoryReportFilename(new Date(occurredAt));

    console.log("Inventory report generated:", {
      reportFilename,
      size: reportBuffer.length,
    });

    return NextResponse.json({
      success: true,
      submittedCount: adjustmentItems.length,
      submittedItems: adjustmentItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        squareCount: item.squareCount,
        physicalCount: item.physicalCount,
        difference: item.difference,
        reason: getAdjustmentReason(item.difference),
        adjustmentQuantity: Math.abs(item.difference),
      })),
      result: response,
    });
  } catch (error) {
    console.error("Square inventory submit error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown Square submit error.";

    return NextResponse.json(
      {
        error: "Failed to submit inventory adjustments to Square.",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 },
    );
  }
}
