import type {
  InventoryProduct,
  MatchedProduct,
  ProductSuggestion,
} from "@/types/inventory";

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row++) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col++) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;

      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarityScore(a: string, b: string): number {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  const compactA = compactText(normalizedA);
  const compactB = compactText(normalizedB);

  if (compactA === compactB) {
    return 0.98;
  }

  if (normalizedB.includes(normalizedA) || normalizedA.includes(normalizedB)) {
    return 0.9;
  }

  const distance = levenshteinDistance(compactA, compactB);
  const longestLength = Math.max(compactA.length, compactB.length);

  return 1 - distance / longestLength;
}

function getProductAliases(product: InventoryProduct): string[] {
  return [product.name, ...product.aliases];
}

export function getProductSuggestions(
  productText: string,
  products: InventoryProduct[],
  limit = 3,
): ProductSuggestion[] {
  const suggestions: ProductSuggestion[] = [];

  for (const product of products) {
    for (const alias of getProductAliases(product)) {
      const score = similarityScore(productText, alias);

      suggestions.push({
        product,
        matchedAlias: alias,
        score,
      });
    }
  }

  const bestByProduct = new Map<string, ProductSuggestion>();

  for (const suggestion of suggestions) {
    const existingSuggestion = bestByProduct.get(suggestion.product.id);

    if (!existingSuggestion || suggestion.score > existingSuggestion.score) {
      bestByProduct.set(suggestion.product.id, suggestion);
    }
  }

  return Array.from(bestByProduct.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function matchProduct(
  productText: string,
  products: InventoryProduct[],
): MatchedProduct {
  const suggestions = getProductSuggestions(productText, products, 3);
  const bestSuggestion = suggestions[0];

  if (!bestSuggestion) {
    throw new Error(`No product matched "${productText}".`);
  }

  if (bestSuggestion.score >= 0.78) {
    return {
      product: bestSuggestion.product,
      matchedAlias: bestSuggestion.matchedAlias,
      score: bestSuggestion.score,
    };
  }

  const suggestionText = suggestions
    .map((suggestion) => suggestion.product.name)
    .join(", ");

  throw new Error(
    `No confident product match for "${productText}". Did you mean: ${suggestionText}?`,
  );
}
