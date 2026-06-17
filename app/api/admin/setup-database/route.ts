import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export async function POST() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_entries (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        submitted_at TIMESTAMPTZ,
        submission_id TEXT
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_submissions (
        id TEXT PRIMARY KEY,
        submitted_at TIMESTAMPTZ NOT NULL,
        submitted_count INTEGER NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_submission_items (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL REFERENCES inventory_submissions(id),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        square_count INTEGER NOT NULL,
        physical_count INTEGER NOT NULL,
        difference INTEGER NOT NULL,
        label TEXT NOT NULL,
        adjustment_quantity INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS inventory_entries_created_at_idx
      ON inventory_entries (created_at DESC);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS inventory_entries_submission_id_idx
      ON inventory_entries (submission_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS inventory_submission_items_submission_id_idx
      ON inventory_submission_items (submission_id);
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database setup error:", error);

    return NextResponse.json(
      {
        error: "Failed to set up database.",
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}
