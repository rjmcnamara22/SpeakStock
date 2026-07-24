import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, verifyMobileAccessToken } from "@/lib/auth/mobileAuth";
import { loadSquareProducts } from "@/lib/inventory/loadSquareProducts";

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request.headers.get("authorization"));

    if (!token || !verifyMobileAccessToken(token)) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      );
    }

    const products = await loadSquareProducts();

    return NextResponse.json({
      products,
    });
  } catch (error) {
    console.error("Failed to load mobile inventory products:", error);

    return NextResponse.json(
      {
        error: "Unable to load inventory products.",
      },
      {
        status: 500,
      },
    );
  }
}
