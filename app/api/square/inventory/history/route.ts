import { NextResponse } from "next/server";
import { squareClient } from "@/lib/square/client";

type HistoryItem = {
  id?: string;
  type: "PHYSICAL_COUNT" | "ADJUSTMENT" | "UNKNOWN";
  catalogObjectId?: string;
  locationId?: string;
  quantity?: string;
  fromState?: string;
  toState?: string;
  occurredAt?: string;
  calculatedAt?: string;
  referenceId?: string;
  source?: string;
  label: "Lost" | "Inventory Received" | "Physical Count" | "Other";
};

function getLabelForAdjustment(fromState?: string, toState?: string) {
  if (fromState === "NONE" && toState === "IN_STOCK") {
    return "Inventory Received" as const;
  }

  if (fromState === "IN_STOCK" && toState === "WASTE") {
    return "Lost" as const;
  }

  return "Other" as const;
}

function normalizeInventoryChange(change: unknown): HistoryItem {
  const inventoryChange = change as {
    type?: string;
    physicalCount?: {
      id?: string;
      catalogObjectId?: string;
      locationId?: string;
      quantity?: string;
      occurredAt?: string;
      calculatedAt?: string;
      referenceId?: string;
      source?: {
        product?: string;
        applicationId?: string;
        name?: string;
      };
    };
    adjustment?: {
      id?: string;
      catalogObjectId?: string;
      locationId?: string;
      quantity?: string;
      fromState?: string;
      toState?: string;
      occurredAt?: string;
      calculatedAt?: string;
      referenceId?: string;
      source?: {
        product?: string;
        applicationId?: string;
        name?: string;
      };
    };
  };

  if (inventoryChange.type === "PHYSICAL_COUNT") {
    const physicalCount = inventoryChange.physicalCount;

    return {
      id: physicalCount?.id,
      type: "PHYSICAL_COUNT",
      catalogObjectId: physicalCount?.catalogObjectId,
      locationId: physicalCount?.locationId,
      quantity: physicalCount?.quantity,
      occurredAt: physicalCount?.occurredAt,
      calculatedAt: physicalCount?.calculatedAt,
      referenceId: physicalCount?.referenceId,
      source: physicalCount?.source?.name ?? physicalCount?.source?.product,
      label: "Physical Count",
    };
  }

  if (inventoryChange.type === "ADJUSTMENT") {
    const adjustment = inventoryChange.adjustment;

    return {
      id: adjustment?.id,
      type: "ADJUSTMENT",
      catalogObjectId: adjustment?.catalogObjectId,
      locationId: adjustment?.locationId,
      quantity: adjustment?.quantity,
      fromState: adjustment?.fromState,
      toState: adjustment?.toState,
      occurredAt: adjustment?.occurredAt,
      calculatedAt: adjustment?.calculatedAt,
      referenceId: adjustment?.referenceId,
      source: adjustment?.source?.name ?? adjustment?.source?.product,
      label: getLabelForAdjustment(adjustment?.fromState, adjustment?.toState),
    };
  }

  return {
    type: "UNKNOWN",
    label: "Other",
  };
}

export async function GET(request: Request) {
  try {
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!locationId) {
      return NextResponse.json(
        { error: "Missing SQUARE_LOCATION_ID environment variable." },
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    const catalogObjectId = url.searchParams.get("catalogObjectId");
    const daysParam = url.searchParams.get("days");
    const limitParam = url.searchParams.get("limit");

    const days = daysParam ? Number(daysParam) : 7;
    const limit = limitParam ? Number(limitParam) : 50;

    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json(
        { error: "days must be a positive number." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(limit) || limit <= 0 || limit > 100) {
      return NextResponse.json(
        { error: "limit must be between 1 and 100." },
        { status: 400 },
      );
    }

    const updatedAfter = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const response = await squareClient.inventory.batchGetChanges({
      catalogObjectIds: catalogObjectId ? [catalogObjectId] : undefined,
      locationIds: [locationId],
      types: ["PHYSICAL_COUNT", "ADJUSTMENT"],
      updatedAfter,
      limit,
    });

    const changes = [];

    for await (const change of response) {
      changes.push(normalizeInventoryChange(change));

      if (changes.length >= limit) {
        break;
      }
    }

    return NextResponse.json({
      success: true,
      locationId,
      days,
      count: changes.length,
      changes: changes.reverse(),
    });
  } catch (error) {
    console.error("Square inventory history error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown Square history error.";

    return NextResponse.json(
      {
        error: "Failed to load Square inventory history.",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 },
    );
  }
}
