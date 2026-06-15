import { NextResponse } from "next/server";
import { squareClient } from "@/lib/square/client";

type HistoryItem = {
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
    adjustment?: {
      id?: string;
      catalogObjectId?: string;
      catalog_object_id?: string;
      locationId?: string;
      location_id?: string;
      quantity?: string;
      fromState?: string;
      from_state?: string;
      toState?: string;
      to_state?: string;
      occurredAt?: string;
      occurred_at?: string;
      calculatedAt?: string;
      calculated_at?: string;
      referenceId?: string;
      reference_id?: string;
      source?: {
        product?: string;
        applicationId?: string;
        application_id?: string;
        name?: string;
      };
    };
  };

  if (inventoryChange.type === "ADJUSTMENT") {
    const adjustment = inventoryChange.adjustment;

    const fromState = adjustment?.fromState ?? adjustment?.from_state;
    const toState = adjustment?.toState ?? adjustment?.to_state;

    return {
      id: adjustment?.id,
      type: "ADJUSTMENT",
      catalogObjectId:
        adjustment?.catalogObjectId ?? adjustment?.catalog_object_id,
      locationId: adjustment?.locationId ?? adjustment?.location_id,
      quantity: adjustment?.quantity,
      fromState,
      toState,
      occurredAt: adjustment?.occurredAt ?? adjustment?.occurred_at,
      calculatedAt: adjustment?.calculatedAt ?? adjustment?.calculated_at,
      referenceId: adjustment?.referenceId ?? adjustment?.reference_id,
      source: adjustment?.source?.name ?? adjustment?.source?.product,
      label: getLabelForAdjustment(fromState, toState),
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
      types: ["ADJUSTMENT"],
      updatedAfter,
      limit,
    });

    const changes: HistoryItem[] = [];
    let inspectedChangeCount = 0;
    const maxChangesToInspect = 250;

    for await (const change of response) {
      inspectedChangeCount += 1;

      const normalizedChange = normalizeInventoryChange(change);

      const isSpeakStockChange =
        normalizedChange.referenceId?.startsWith("speakstock-") === true;

      const isTrackedAdjustment =
        normalizedChange.type === "ADJUSTMENT" &&
        ((normalizedChange.fromState === "NONE" &&
          normalizedChange.toState === "IN_STOCK") ||
          (normalizedChange.fromState === "IN_STOCK" &&
            normalizedChange.toState === "WASTE"));

      if (isSpeakStockChange && isTrackedAdjustment) {
        changes.push(normalizedChange);
      }

      if (
        changes.length >= limit ||
        inspectedChangeCount >= maxChangesToInspect
      ) {
        break;
      }
    }

    return NextResponse.json({
      success: true,
      locationId,
      days,
      count: changes.length,
      inspectedChangeCount,
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
