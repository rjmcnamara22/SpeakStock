import { NextResponse } from "next/server";
import { squareClient } from "@/lib/square/client";
import { productAliasOverrides } from "@/lib/inventory/productAliasOverrides";

type SpeakStockProduct = {
  id: string;
  name: string;
  aliases: string[];
  squareCount: number;
};

type SquareCatalogItemLike = {
  id: string;
  type?: string;
  itemData?: {
    name?: string;
    variations?: SquareCatalogVariationLike[];
  };
  item_data?: {
    name?: string;
    variations?: SquareCatalogVariationLike[];
  };
};

type SquareCatalogVariationLike = {
  id?: string;
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

function isSquareCatalogItemLike(
  value: unknown,
): value is SquareCatalogItemLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const objectValue = value as {
    id?: unknown;
    type?: unknown;
    itemData?: unknown;
    item_data?: unknown;
  };

  if (typeof objectValue.id !== "string") {
    return false;
  }

  if (objectValue.type !== "ITEM") {
    return false;
  }

  const itemData = objectValue.itemData ?? objectValue.item_data;

  if (!itemData || typeof itemData !== "object") {
    return false;
  }

  const itemDataValue = itemData as {
    name?: unknown;
    variations?: unknown;
  };

  return typeof itemDataValue.name === "string";
}

function getItemData(item: SquareCatalogItemLike) {
  return item.itemData ?? item.item_data;
}

function getVariationData(variation: SquareCatalogVariationLike) {
  return variation.itemVariationData ?? variation.item_variation_data;
}

function buildProductName(
  itemName: string,
  variationName: string | undefined,
): string {
  if (!variationName) {
    return itemName;
  }

  const normalizedVariationName = variationName.trim().toLowerCase();

  if (
    normalizedVariationName === "regular" ||
    normalizedVariationName === itemName.trim().toLowerCase()
  ) {
    return itemName;
  }

  return `${itemName} ${variationName}`;
}

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function removeInventoryDescriptorWords(value: string): string {
  return normalizeAlias(value)
    .replace(/\b\d+(\.\d+)?\s*(oz|ounce|ounces|ml|l|liter|litre)\b/g, " ")
    .replace(/\b(bottle|bottles|can|cans|draft|draught|regular)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAliases(name: string): string[] {
  const normalizedName = normalizeAlias(name);
  const simplifiedName = removeInventoryDescriptorWords(name);

  const overrideAliases = [
    ...(productAliasOverrides[normalizedName] ?? []),
    ...(productAliasOverrides[simplifiedName] ?? []),
  ];

  return Array.from(
    new Set([
      normalizedName,
      simplifiedName,
      normalizedName.replace(/\bhi\b/g, "high"),
      simplifiedName.replace(/\bhi\b/g, "high"),
      normalizedName.replace(/\bhigh\b/g, "hi"),
      simplifiedName.replace(/\bhigh\b/g, "hi"),
      ...overrideAliases.map(normalizeAlias),
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
      objectTypes: ["ITEM"],
      includeDeletedObjects: false,
    });

    const catalogObjects = (catalogResponse.objects ?? []) as unknown[];
    const items = catalogObjects.filter(isSquareCatalogItemLike);

    const productDrafts: {
      id: string;
      name: string;
      aliases: string[];
    }[] = [];

    for (const item of items) {
      const itemData = getItemData(item);
      const itemName = itemData?.name;

      if (!itemName) {
        continue;
      }

      const variations = itemData?.variations ?? [];

      for (const variation of variations) {
        if (!variation.id) {
          continue;
        }

        const variationData = getVariationData(variation);
        const productName = buildProductName(itemName, variationData?.name);

        productDrafts.push({
          id: variation.id,
          name: productName,
          aliases: buildAliases(productName),
        });
      }
    }

    const variationIds = productDrafts.map((product) => product.id);

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

    const products: SpeakStockProduct[] = productDrafts.map((product) => ({
      id: product.id,
      name: product.name,
      aliases: product.aliases,
      squareCount: countsByVariationId.get(product.id) ?? 0,
    }));

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
