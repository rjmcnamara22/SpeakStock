import { NextResponse } from "next/server";
import { squareClient } from "@/lib/square/client";

type SpeakStockProduct = {
  id: string;
  name: string;
  aliases: string[];
  squareCount: number;
};

type SquareCatalogVariationLike = {
  id: string;
  type?: string;
  itemVariationData?: {
    name?: string;
  };
  item_variation_data?: {
    name?: string;
  };
};

type InventoryCountLike = {
  catalogObjectId?: string;
  catalog_object_id?: string;
  quantity?: string;
  state?: string;
};

function isSquareCatalogVariationLike(
  value: unknown,
): value is SquareCatalogVariationLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const objectValue = value as {
    id?: unknown;
    type?: unknown;
    itemVariationData?: unknown;
    item_variation_data?: unknown;
  };

  if (typeof objectValue.id !== "string") {
    return false;
  }

  if (objectValue.type !== "ITEM_VARIATION") {
    return false;
  }

  const variationData =
    objectValue.itemVariationData ?? objectValue.item_variation_data;

  if (!variationData || typeof variationData !== "object") {
    return false;
  }

  const variationDataValue = variationData as {
    name?: unknown;
  };

  return typeof variationDataValue.name === "string";
}

function getVariationName(variation: SquareCatalogVariationLike): string {
  return (
    variation.itemVariationData?.name ??
    variation.item_variation_data?.name ??
    "Unnamed Variation"
  );
}

function buildAliases(name: string): string[] {
  const normalizedName = name.toLowerCase();

  return Array.from(
    new Set([
      normalizedName,
      normalizedName.replace(/\b(bottle|can|draft)\b/g, "").trim(),
    ]),
  ).filter(Boolean);
}

function getQuantityAsNumber(quantity: string | undefined): number {
  if (!quantity) {
    return 0;
  }

  const parsedQuantity = Number(quantity);
  return Number.isFinite(parsedQuantity) ? parsedQuantity : 0;
}

export async function GET() {
  try {
    const catalogResponse = await squareClient.catalog.search({
      objectTypes: ["ITEM_VARIATION"],
      includeDeletedObjects: false,
    });

    const catalogObjects = (catalogResponse.objects ?? []) as unknown[];

    const itemVariations = catalogObjects.filter(isSquareCatalogVariationLike);

    const variationIds: string[] = itemVariations.map(
      (variation) => variation.id,
    );

    let countsByVariationId = new Map<string, number>();

    if (variationIds.length > 0) {
      const inventoryPage = await squareClient.inventory.batchGetCounts({
        catalogObjectIds: variationIds,
        states: ["IN_STOCK"],
      });

      const counts: InventoryCountLike[] = [];

      for await (const count of inventoryPage) {
        counts.push(count as InventoryCountLike);
      }

      countsByVariationId = new Map(
        counts
          .map((count): [string, number] | null => {
            const catalogObjectId =
              count.catalogObjectId ?? count.catalog_object_id;

            if (!catalogObjectId) {
              return null;
            }

            return [catalogObjectId, getQuantityAsNumber(count.quantity)];
          })
          .filter((entry): entry is [string, number] => entry !== null),
      );
    }

    const products: SpeakStockProduct[] = itemVariations.map((variation) => {
      const name = getVariationName(variation);

      return {
        id: variation.id,
        name,
        aliases: buildAliases(name),
        squareCount: countsByVariationId.get(variation.id) ?? 0,
      };
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Square products error:", error);

    return NextResponse.json(
      {
        error: "Failed to load Square products.",
      },
      {
        status: 500,
      },
    );
  }
}
