export type InventoryProduct = {
  id: string;
  name: string;
  aliases: string[];
  squareCount: number;
};

export type CountEntry = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  rawText: string;
  source: "typed" | "voice";
  createdAt: string;
};

export type ParsedCountCommand = {
  rawText: string;
  productText: string;
  quantity: number;
};

export type MatchedProduct = {
  product: InventoryProduct;
  matchedAlias: string;
  score: number;
};

export type ProductSuggestion = {
  product: InventoryProduct;
  matchedAlias: string;
  score: number;
};

export type InventorySummaryRow = {
  productId: string;
  productName: string;
  squareCount: number;
  localCount: number;
  difference: number;
};

export type InventorySubmissionPreview = {
  productId: string;
  productName: string;
  squareCount: number;
  physicalCount: number;
  difference: number;
  label: "Lost" | "Received";
};
