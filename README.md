# SpeakStock

SpeakStock is a mobile-friendly inventory management web app built for a bar/restaurant environment. It allows inventory counts to be entered by voice or text, matches those entries to Square catalog items, reviews count differences, and submits approved inventory adjustments directly to Square.

The project was built to replace a slow manual inventory workflow with a faster, guided process that reduces counting time and makes inventory corrections easier to review.

## Features

* Voice or typed inventory count entry
* Product matching with alias support for common item names and shorthand terms
* Square catalog integration
* Square inventory count loading
* Review screen showing counted quantity, Square quantity, and adjustment difference
* Inventory adjustment submission to Square

  * Positive differences are submitted as `Inventory Received`
  * Negative differences are submitted as `Lost` in SpeakStock and submitted using Square's supported inventory adjustment transition
* Shared-password authentication for protected access
* Recent Square inventory changes panel
* Submitted session summary
* Current session entry log
* Historical entry log backed by a database
* Mobile-friendly interface for use during physical inventory counts

## Tech Stack

* **Framework:** Next.js
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **Database:** Neon Postgres
* **Deployment:** Vercel
* **External API:** Square API
* **Authentication:** Shared password with HTTP-only session cookie

## Project Purpose

The app was designed for a real business inventory workflow where the owner or manager physically counts products and needs to update Square inventory quickly.

Instead of manually searching for each product in Square and adjusting quantities one at a time, SpeakStock lets the user enter counts in a natural format such as:

```text
Miller Lite 24
Bud Light 18
High Life 12
```

The app then matches each entry to a Square catalog item, accumulates counts during the session, compares the final count to Square's current inventory, and prepares the correct adjustment.

## Inventory Workflow

1. Load active, inventory-tracked products from Square.
2. Enter counts using voice or typed input.
3. Match each entry to a Square product using aliases and fuzzy matching.
4. Accumulate counts for each product during the session.
5. Review only products that were actually counted.
6. Confirm the reviewed differences.
7. Submit the inventory adjustments to Square.
8. Store entry history in the database for later review.

## Important Inventory Behavior

SpeakStock intentionally updates **only products entered during the current session**.

Products that are loaded from Square but not counted are ignored. This prevents uncounted items from being accidentally adjusted to zero.

## Alias Matching

Square product names often do not match how staff naturally refer to products. SpeakStock supports alias overrides so products can be matched using common names.

Example:

```ts
export const productAliasOverrides: Record<string, string[]> = {
  "bud light": ["bud light", "budlight", "bud lite"],
  budweiser: ["budweiser", "bud", "bud weiser"],
  "coors light": ["coors", "coors lite", "coorslight"],
  "miller lite": ["miller", "miller lite", "millerlite"],
};
```

## Environment Variables

Create a `.env.local` file for local development.

```env
SQUARE_ACCESS_TOKEN=
SQUARE_ENVIRONMENT=production
SQUARE_LOCATION_ID=

SPEAKSTOCK_SHARED_PASSWORD=
SPEAKSTOCK_SESSION_SECRET=

DATABASE_URL=
```

### Notes

* `SQUARE_ACCESS_TOKEN` must never be exposed to the browser.
* Do not prefix Square credentials with `NEXT_PUBLIC_`.
* `.env.local` should not be committed.
* Production environment variables should be configured through Vercel.

## Running Locally

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Database Setup

SpeakStock uses Postgres to store historical inventory entries.

The database schema includes tables for:

* inventory entries
* submitted sessions
* submitted session items

A setup route is included for creating the required tables.

```text
POST /api/admin/setup-database
```

This route should be protected and only used during setup.

## Scripts

Run lint checks:

```bash
npm run lint
```

Run TypeScript checks:

```bash
npx tsc --noEmit
```

Build the app:

```bash
npm run build
```

## Deployment

The app is deployed through Vercel.

Recommended production setup:

1. Add all required environment variables in Vercel.
2. Use the production Square access token only for the production deployment.
3. Keep test and preview deployments separate from real Square inventory when possible.
4. Verify login protection before sharing the deployed URL.
5. Test a small reversible inventory adjustment before live use.

## Security

SpeakStock uses a shared-password login system for MVP access control. After successful login, the server sets an HTTP-only session cookie.

Protected areas include:

* `/inventory`
* `/api/square/*`
* `/api/inventory/*`
* `/api/admin/*`

The Square access token is stored server-side only and is never sent to the browser.

## Current Limitations

* The login system uses a shared password rather than individual user accounts.
* Square may display API-submitted loss adjustments using Square's own internal dashboard terminology.
* Historical database logging is focused on inventory entries and submitted sessions, not full role-based auditing.
* Voice input depends on browser and device support.

## Future Improvements

* Individual user accounts and roles
* User-managed product aliases
* More advanced historical search and filtering
* Exportable inventory reports
* Permanent submitted-session audit dashboard
* More robust mobile voice input support
* Separate staging and production Square environments

## Summary

SpeakStock streamlines bar inventory counting by combining mobile-friendly input, alias-based product matching, Square inventory integration, and database-backed entry history. It was built around a real business workflow where speed, accuracy, and reviewability are more important than generic inventory-management complexity.

