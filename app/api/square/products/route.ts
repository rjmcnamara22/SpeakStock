import { NextResponse } from "next/server";

import { loadSquareProducts } from "@/lib/inventory/loadSquareProducts";

export async function GET() {
  try {
    const products = await loadSquareProducts();

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
