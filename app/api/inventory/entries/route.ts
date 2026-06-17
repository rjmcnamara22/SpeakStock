import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

type CreateEntryRequest = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  rawText: string;
  source: "typed" | "voice";
  createdAt: string;
};

type InventoryEntryRow = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  raw_text: string;
  source: string;
  created_at: string;
  submitted_at: string | null;
  submission_id: string | null;
};

function isCreateEntryRequest(value: unknown): value is CreateEntryRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as {
    id?: unknown;
    productId?: unknown;
    productName?: unknown;
    quantity?: unknown;
    rawText?: unknown;
    source?: unknown;
    createdAt?: unknown;
  };

  return (
    typeof body.id === "string" &&
    typeof body.productId === "string" &&
    typeof body.productName === "string" &&
    typeof body.quantity === "number" &&
    Number.isInteger(body.quantity) &&
    body.quantity >= 0 &&
    typeof body.rawText === "string" &&
    (body.source === "typed" || body.source === "voice") &&
    typeof body.createdAt === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!isCreateEntryRequest(body)) {
      return NextResponse.json(
        { error: "Invalid inventory entry payload." },
        { status: 400 },
      );
    }

    await sql`
      INSERT INTO inventory_entries (
        id,
        product_id,
        product_name,
        quantity,
        raw_text,
        source,
        created_at
      )
      VALUES (
        ${body.id},
        ${body.productId},
        ${body.productName},
        ${body.quantity},
        ${body.rawText},
        ${body.source},
        ${body.createdAt}
      )
      ON CONFLICT (id) DO NOTHING;
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Create inventory entry error:", error);

    return NextResponse.json(
      {
        error: "Failed to save inventory entry.",
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const rows = (await sql`
      SELECT
        id,
        product_id,
        product_name,
        quantity,
        raw_text,
        source,
        created_at,
        submitted_at,
        submission_id
      FROM inventory_entries
      ORDER BY created_at DESC
      LIMIT 100;
    `) as InventoryEntryRow[];

    return NextResponse.json({
      success: true,
      entries: rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        quantity: row.quantity,
        rawText: row.raw_text,
        source: row.source,
        createdAt: row.created_at,
        submittedAt: row.submitted_at,
        submissionId: row.submission_id,
      })),
    });
  } catch (error) {
    console.error("Load inventory entries error:", error);

    return NextResponse.json(
      {
        error: "Failed to load inventory entries.",
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}
