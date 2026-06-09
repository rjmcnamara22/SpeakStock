import { NextResponse } from "next/server";
import { squareClient } from "@/lib/square/client";

export async function GET() {
  try {
    const response = await squareClient.locations.list();

    return NextResponse.json({
      locations: response.locations ?? [],
    });
  } catch (error) {
    console.error("Square locations error:", error);

    return NextResponse.json(
      {
        error: "Failed to load Square locations.",
      },
      {
        status: 500,
      },
    );
  }
}
