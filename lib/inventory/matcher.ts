import type { InventoryProduct, MatchedProduct } from "@/types/inventory";

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function matchProduct(
  productText: string,
  products: InventoryProduct[]
): MatchedProduct {
  const normalizedProductText = normalizeText(productText);

  for (const product of products) {
    const allNames = [product.name, ...product.aliases];

    for (const alias of allNames) {
      if (normalizeText(alias) === normalizedProductText) {
        return {
          product,
          matchedAlias: alias,
        };
      }
    }
  }

  throw new Error(`No product matched "${productText}". Try adding an alias later.`);
}