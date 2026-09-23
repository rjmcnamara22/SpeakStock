import type { ParsedCountCommand } from "@/types/inventory";

const singleDigitWords: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const teenWords: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const tensWords: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function normalizeInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberWords(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let foundNumberWord = false;

  for (const word of words) {
    if (singleDigitWords[word] !== undefined) {
      current += singleDigitWords[word];
      foundNumberWord = true;
      continue;
    }

    if (teenWords[word] !== undefined) {
      current += teenWords[word];
      foundNumberWord = true;
      continue;
    }

    if (tensWords[word] !== undefined) {
      current += tensWords[word];
      foundNumberWord = true;
      continue;
    }

    if (word === "hundred") {
      if (current === 0) {
        current = 1;
      }

      current *= 100;
      foundNumberWord = true;
      continue;
    }

    return null;
  }

  if (!foundNumberWord) {
    return null;
  }

  total += current;
  return total;
}

function parseQuantityFromEnd(words: string[]): {
  productWords: string[];
  quantity: number;
} | null {
  const lastWord = words[words.length - 1];

  if (!lastWord) {
    return null;
  }

  let quantity: number | null = null;
  let quantityStartIndex = words.length - 1;
  let isNegative = false;

  // handle numeric quantities
  if (/^-?\d+$/.test(lastWord)) {
    quantity = Number(lastWord);
    isNegative = lastWord.startsWith("-");
  } else {
    // handle spoken quantities
    for (let startIndex = words.length - 1; startIndex >= 0; startIndex--) {
      const possibleNumberWords = words.slice(startIndex);
      const parsedNumber = parseNumberWords(possibleNumberWords);

      if (
        parsedNumber !== null &&
        Number.isInteger(parsedNumber) &&
        parsedNumber >= 0
      ) {
        quantity = parsedNumber;
        quantityStartIndex = startIndex;
      } else {
        break;
      }
    }
  }

  if (quantity === null || !Number.isSafeInteger(quantity)) {
    return null;
  }

  // recognize 'minus' or 'subtract' before the quantity
  const precedingWord = words[quantityStartIndex - 1];

  if (precedingWord === "minus" || precedingWord === "subtract") {
    isNegative = true;
    quantityStartIndex--;
  } else if (precedingWord === "-") {
    isNegative = true;
    quantityStartIndex--;
  }

  // avoid interpreting a negative number as an addition
  if (isNegative) {
    quantity = -Math.abs(quantity);
  }

  return {
    productWords: words.slice(0, quantityStartIndex),
    quantity,
  };
}

export function parseCountCommand(input: string): ParsedCountCommand {
  const cleanedInput = normalizeInput(input);

  if (!cleanedInput) {
    throw new Error("Enter a product and quantity.");
  }

  const words = cleanedInput.split(" ");
  const parsedQuantity = parseQuantityFromEnd(words);

  if (!parsedQuantity) {
    throw new Error(
      'Use a format like "Miller Lite 48", "Miller Lite minus 1", or "Miller Lite -1".',
    );
  }

  const productText = parsedQuantity.productWords.join(" ").trim();

  if (!productText) {
    throw new Error("Could not find a product name.");
  }

  return {
    rawText: input.trim(),
    productText,
    quantity: parsedQuantity.quantity,
  };
}
