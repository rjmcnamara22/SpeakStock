import type { ParsedCountCommand } from "@/types/inventory";

export function parseCountCommand(input: string): ParsedCountCommand {
  const cleanedInput = input.trim();

  if (!cleanedInput) {
    throw new Error("Enter a product and quantity.");
  }

  const match = cleanedInput.match(/^(.*?)[,\s]+(\d+)$/);

  if (!match) {
    throw new Error('Use a format like "Miller Lite 48" or "Miller Lite, 48".');
  }

  const productText = match[1]?.trim();
  const quantityText = match[2]?.trim();

  if (!productText) {
    throw new Error("Could not find a product name.");
  }

  const quantity = Number(quantityText);

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a whole number greater than or equal to 0.");
  }

  return {
    rawText: cleanedInput,
    productText,
    quantity,
  };
}