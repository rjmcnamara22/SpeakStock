import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { squareClient } from "@/lib/square/client";

type InventorySubmissionItem = {
  productId: string;
  productName: string;
  physicalCount: number;
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
    physicalCount?: unknown;
  };

  return (
    typeof item.productId === "string" &&
    typeof item.productName === "string" &&
    typeof item.physicalCount === "number" &&
    Number.isInteger(item.physicalCount) &&
    item.physicalCount >= 0
  );
}

export async function POST(request: Request) {
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

    if (validItems.length === 0) {
      return NextResponse.json(
        { error: "No valid inventory items were submitted." },
        { status: 400 },
      );
    }

    const occurredAt = new Date().toISOString();

    const changes = validItems.map((item) => ({
      type: "PHYSICAL_COUNT" as const,
      physicalCount: {
        catalogObjectId: item.productId,
        locationId,
        state: "IN_STOCK" as const,
        quantity: item.physicalCount.toString(),
        occurredAt,
      },
    }));

    const response = await squareClient.inventory.batchCreateChanges({
      idempotencyKey: randomUUID(),
      changes,
      ignoreUnchangedCounts: true,
    });

    return NextResponse.json({
      success: true,
      submittedCount: validItems.length,
      result: response,
    });
  } catch (error) {
    console.error("Square inventory submit error:", error);

    return NextResponse.json(
      { error: "Failed to submit inventory counts to Square." },
      { status: 500 },
    );
  }
}
