import { productAliasOverrides } from "@/lib/inventory/productAliasOverrides";
import { squareClient } from "@/lib/square/client";

export type SpeakStockProduct = {
  id: string;
  name: string;
  aliases: string[];
  squareCount: number;
};

type SquareCatalogItemLike = {
  id: string;
  type?: string;
  isDeleted?: boolean;
  is_deleted?: boolean;
  presentAtAllLocations?: boolean;
  present_at_all_locations?: boolean;
  absentAtLocationIds?: string[];
  absent_at_location_ids?: string[];
  itemData?: {
    name?: string;
    variations?: SquareCatalogVariationLike[];
    isArchived?: boolean;
    is_archived?: boolean;
    categoryId?: string;
    category_id?: string;
    categories?: SquareCatalogObjectCategoryLike[];
  };

  item_data?: {
    name?: string;
    variations?: SquareCatalogVariationLike[];
    isArchived?: boolean;
    is_archived?: boolean;
    categoryId?: string;
    category_id?: string;
    categories?: SquareCatalogObjectCategoryLike[];
  };
};

type SquareCatalogVariationLike = {
  id?: string;
  type?: string;
  isDeleted?: boolean;
  is_deleted?: boolean;
  presentAtAllLocations?: boolean;
  present_at_all_locations?: boolean;
  absentAtLocationIds?: string[];
  absent_at_location_ids?: string[];
  itemVariationData?: {
    name?: string;
    trackInventory?: boolean;
    track_inventory?: boolean;
    sellable?: boolean;
    stockable?: boolean;
  };
  item_variation_data?: {
    name?: string;
    trackInventory?: boolean;
    track_inventory?: boolean;
    sellable?: boolean;
    stockable?: boolean;
  };
};

type InventoryCountLike = {
  catalogObjectId?: string;
  catalog_object_id?: string;
  quantity?: string;
  state?: string;
};

type SquareCatalogObjectCategoryLike = {
  id?: string;
  ordinal?: bigint | number | string;
};

type SquareCatalogCategoryLike = {
  id: string;
  type?: string;
  isDeleted?: boolean;
  is_deleted?: boolean;
  categoryData?: {
    name?: string;
  };
  category_data?: {
    name?: string;
  };
};

const ALLOWED_CATEGORY_NAMES = new Set([
  "beer",
  "draft",
  "gin",
  "liqueur",
  "rum",
  "tequila",
  "vodka",
  "whiskey",
  "wine",
]);

function isSquareCatalogCategoryLike(
  value: unknown,
): value is SquareCatalogCategoryLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const objectValue = value as {
    id?: unknown;
    type?: unknown;
    categoryData?: unknown;
    category_data?: unknown;
  };

  if (typeof objectValue.id !== "string" || objectValue.type !== "CATEGORY") {
    return false;
  }

  const categoryData = objectValue.categoryData ?? objectValue.category_data;

  if (!categoryData || typeof categoryData !== "object") {
    return false;
  }

  return typeof (categoryData as { name?: unknown }).name === "string";
}

function getCategoryName(
  category: SquareCatalogCategoryLike,
): string | undefined {
  return (category.categoryData ?? category.category_data)?.name;
}

function getItemCategoryIds(
  itemData:
    | SquareCatalogItemLike["itemData"]
    | SquareCatalogItemLike["item_data"],
): string[] {
  if (!itemData) {
    return [];
  }

  const categoryIds =
    itemData.categories
      ?.map((category) => category.id)
      .filter(
        (categoryId): categoryId is string => typeof categoryId === "string",
      ) ?? [];

  const legacyCategoryId = itemData.categoryId ?? itemData.category_id;

  if (legacyCategoryId && !categoryIds.includes(legacyCategoryId)) {
    categoryIds.push(legacyCategoryId);
  }

  return categoryIds;
}

function itemBelongsToAllowedCategory(
  itemData:
    | SquareCatalogItemLike["itemData"]
    | SquareCatalogItemLike["item_data"],
  categoryNamesById: Map<string, string>,
): boolean {
  const categoryIds = getItemCategoryIds(itemData);

  return categoryIds.some((categoryId) => {
    const categoryName = categoryNamesById.get(categoryId);

    return (
      categoryName !== undefined &&
      ALLOWED_CATEGORY_NAMES.has(categoryName.trim().toLowerCase())
    );
  });
}

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

function isDeletedCatalogObject(object: {
  isDeleted?: boolean;
  is_deleted?: boolean;
}): boolean {
  return object.isDeleted === true || object.is_deleted === true;
}

function isArchivedItem(
  itemData:
    | {
        isArchived?: boolean;
        is_archived?: boolean;
      }
    | undefined,
): boolean {
  return itemData?.isArchived === true || itemData?.is_archived === true;
}

function isVariationStockTracked(
  variationData:
    | {
        trackInventory?: boolean;
        track_inventory?: boolean;
      }
    | undefined,
): boolean {
  return (
    variationData?.trackInventory === true ||
    variationData?.track_inventory === true
  );
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

export async function loadSquareProducts(): Promise<SpeakStockProduct[]> {
  const itemResponse = await squareClient.catalog.search({
    objectTypes: ["ITEM"],
    includeDeletedObjects: false,
  });

  const categoryResponse = await squareClient.catalog.search({
    objectTypes: ["CATEGORY"],
    includeDeletedObjects: false,
  });

  const itemObjects = (itemResponse.objects ?? []) as unknown[];

  const categoryObjects = (categoryResponse.objects ?? []) as unknown[];

  const items = itemObjects.filter(isSquareCatalogItemLike);

  const categories = categoryObjects.filter(isSquareCatalogCategoryLike);

  const categoryNamesById = new Map(
    categories
      .map((category): [string, string] | null => {
        const categoryName = getCategoryName(category);

        if (!categoryName) {
          return null;
        }

        return [category.id, categoryName];
      })
      .filter((entry): entry is [string, string] => entry !== null),
  );

  const productDrafts: {
    id: string;
    name: string;
    aliases: string[];
  }[] = [];

  for (const item of items) {
    if (isDeletedCatalogObject(item)) {
      continue;
    }

    const itemData = getItemData(item);

    if (isArchivedItem(itemData)) {
      continue;
    }

    if (!itemBelongsToAllowedCategory(itemData, categoryNamesById)) {
      continue;
    }

    const itemName = itemData?.name;

    if (!itemName) {
      continue;
    }

    const variations = itemData?.variations ?? [];

    for (const variation of variations) {
      if (!variation.id) {
        continue;
      }

      if (isDeletedCatalogObject(variation)) {
        continue;
      }

      const variationData = getVariationData(variation);

      if (!isVariationStockTracked(variationData)) {
        continue;
      }

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

  return productDrafts.map((product) => ({
    id: product.id,
    name: product.name,
    aliases: product.aliases,
    squareCount: countsByVariationId.get(product.id) ?? 0,
  }));
}
