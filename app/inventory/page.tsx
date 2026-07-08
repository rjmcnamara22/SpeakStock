"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CountEntry,
  InventoryProduct,
  InventorySubmissionPreview,
} from "@/types/inventory";
import { parseCountCommand } from "@/lib/inventory/parser";
import { matchProduct } from "@/lib/inventory/matcher";
import {
  buildInventorySummary,
  getDiscrepancyRows,
} from "@/lib/inventory/session";

import {
  buildSubmissionPreview,
  formatHistoricalEntryDate,
  formatHistoryDate,
  formatSubmittedSessionDate,
  getAdjustmentActionText,
  getDifferenceLabel,
  getHistoryItemTitle,
  getProductNameForHistoryItem,
} from "./helpers";

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

type HistoricalInventoryEntry = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  rawText: string;
  source: "typed" | "voice";
  createdAt: string;
  submittedAt: string | null;
  submissionId: string | null;
};

type HistoricalInventoryEntriesResponse = {
  success?: boolean;
  entries?: HistoricalInventoryEntry[];
  error?: string;
  details?: string;
};

type SpeechRecognitionResultLike = {
  transcript: string;
};

type SpeechRecognitionEventLike = Event & {
  results: {
    [index: number]: {
      [index: number]: SpeechRecognitionResultLike;
    };
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SquareInventoryHistoryItem = {
  id?: string;
  type: "ADJUSTMENT" | "UNKNOWN";
  catalogObjectId?: string;
  locationId?: string;
  quantity?: string;
  fromState?: string;
  toState?: string;
  occurredAt?: string;
  calculatedAt?: string;
  referenceId?: string;
  source?: string;
  label: "Lost" | "Inventory Received" | "Other";
};

type SquareInventoryHistoryResponse = {
  success?: boolean;
  count?: number;
  changes?: SquareInventoryHistoryItem[];
  error?: string;
  details?: string;
};

type SubmittedSessionSummary = {
  submittedAt: string;
  submittedCount: number;
  items: InventorySubmissionPreview[];
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const INVENTORY_ENTRIES_STORAGE_KEY = "speakstock_inventory_entries";

function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          )}
        </div>

        <span className="rounded-md border border-zinc-700 px-2 py-1 text-sm text-zinc-300">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      {isOpen && <div className="mt-4">{children}</div>}
    </section>
  );
}

export default function InventoryPage() {
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isReviewConfirmed, setIsReviewConfirmed] = useState(false);
  const [submissionPreview, setSubmissionPreview] = useState<
    InventorySubmissionPreview[] | null
  >(null);
  const [isSubmittingToSquare, setIsSubmittingToSquare] = useState(false);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [entries, setEntries] = useState<CountEntry[]>([]);
  const [hasLoadedEntries, setHasLoadedEntries] = useState(false);
  const [historyItems, setHistoryItems] = useState<
    SquareInventoryHistoryItem[]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [submittedSessionSummary, setSubmittedSessionSummary] =
    useState<SubmittedSessionSummary | null>(null);
  const summaryRows = useMemo(() => {
    return buildInventorySummary(products, entries);
  }, [products, entries]);
  const discrepancyRows = useMemo(() => {
    return getDiscrepancyRows(summaryRows);
  }, [summaryRows]);
  const [historicalEntries, setHistoricalEntries] = useState<
    HistoricalInventoryEntry[]
  >([]);
  const [isLoadingHistoricalEntries, setIsLoadingHistoricalEntries] =
    useState(false);
  const [historicalEntriesError, setHistoricalEntriesError] = useState<
    string | null
  >(null);

  async function loadAdminStatus() {
    try {
      const response = await fetch("/api/auth/status");
      const data = (await response.json()) as { isAdmin?: boolean };

      setIsAdmin(data.isAdmin === true);
    } catch {
      setIsAdmin(false);
    }
  }

  async function loadHistoricalEntries() {
    try {
      setHistoricalEntriesError(null);
      setIsLoadingHistoricalEntries(true);

      const response = await fetch("/api/inventory/entries");

      const data =
        (await response.json()) as HistoricalInventoryEntriesResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.details ?? data.error ?? "Failed to load historical entries.",
        );
      }

      setHistoricalEntries(data.entries ?? []);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setHistoricalEntriesError(caughtError.message);
      } else {
        setHistoricalEntriesError(
          "Something went wrong while loading historical entries.",
        );
      }
    } finally {
      setIsLoadingHistoricalEntries(false);
    }
  }

  async function loadInventoryHistory() {
    try {
      setHistoryError(null);
      setIsLoadingHistory(true);

      const response = await fetch(
        "/api/square/inventory/history?days=1&limit=25",
      );

      const data = (await response.json()) as SquareInventoryHistoryResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.details ?? data.error ?? "Failed to load inventory history.",
        );
      }

      setHistoryItems(data.changes ?? []);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setHistoryError(caughtError.message);
      } else {
        setHistoryError(
          "Something went wrong while loading inventory history.",
        );
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function loadProducts() {
    try {
      setIsLoadingProducts(true);
      setProductsError(null);

      const response = await fetch("/api/square/products");

      if (!response.ok) {
        throw new Error("Failed to load products from Square.");
      }

      const data = (await response.json()) as {
        products?: InventoryProduct[];
      };

      setProducts(data.products ?? []);
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setProductsError(caughtError.message);
      } else {
        setProductsError("Something went wrong while loading products.");
      }
    } finally {
      setIsLoadingProducts(false);
    }
  }

  useEffect(() => {
    if (!hasLoadedEntries) {
      return;
    }

    window.localStorage.setItem(
      INVENTORY_ENTRIES_STORAGE_KEY,
      JSON.stringify(entries),
    );
  }, [entries, hasLoadedEntries]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAdminStatus();
    void loadHistoricalEntries();
    void loadInventoryHistory();
    void loadProducts();
  }, []);

  useEffect(() => {
    const savedEntries = window.localStorage.getItem(
      INVENTORY_ENTRIES_STORAGE_KEY,
    );

    if (savedEntries) {
      try {
        const parsedEntries = JSON.parse(savedEntries) as CountEntry[];

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEntries(parsedEntries);
      } catch {
        window.localStorage.removeItem(INVENTORY_ENTRIES_STORAGE_KEY);
      }
    }

    setHasLoadedEntries(true);
  }, []);

  function handleAddEntry() {
    try {
      setError(null);
      setVoiceError(null);
      setSuccessMessage(null);
      setSubmissionPreview(null);
      setIsReviewConfirmed(false);
      setSubmittedSessionSummary(null);

      if (products.length === 0) {
        setError("No products are loaded yet. Check your Square products.");
        return;
      }

      const parsedCommand = parseCountCommand(command);
      const matchedProduct = matchProduct(parsedCommand.productText, products);

      const newEntry: CountEntry = {
        id: crypto.randomUUID(),
        productId: matchedProduct.product.id,
        productName: matchedProduct.product.name,
        quantity: parsedCommand.quantity,
        rawText: parsedCommand.rawText,
        source: "typed",
        createdAt: new Date().toISOString(),
      };

      setEntries((currentEntries) => [...currentEntries, newEntry]);

      void saveInventoryEntry(newEntry).then(() => {
        void loadHistoricalEntries();
      });

      setSuccessMessage(
        `Added ${parsedCommand.quantity} to ${matchedProduct.product.name}. Matched from "${matchedProduct.matchedAlias}".`,
      );

      setCommand("");
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Something went wrong.");
      }
    }
  }

  function handleUndoLastEntry() {
    setEntries((currentEntries) => currentEntries.slice(0, -1));
    setSubmissionPreview(null);
    setIsReviewConfirmed(false);
  }

  function handleClearSession() {
    setEntries([]);
    setError(null);
    setVoiceError(null);
    setSuccessMessage(null);
    setSubmissionPreview(null);
    setIsReviewConfirmed(false);
    window.localStorage.removeItem(INVENTORY_ENTRIES_STORAGE_KEY);
  }

  function handleDeleteEntry(entryId: string) {
    setEntries((currentEntries) =>
      currentEntries.filter((entry) => entry.id !== entryId),
    );
    setSubmissionPreview(null);
    setIsReviewConfirmed(false);
  }

  function handleResetProduct(productId: string) {
    setEntries((currentEntries) =>
      currentEntries.filter((entry) => entry.productId !== productId),
    );
    setSubmissionPreview(null);
    setIsReviewConfirmed(false);
  }

  function handlePreviewSubmission() {
    setError(null);
    setVoiceError(null);
    setSuccessMessage(null);

    if (discrepancyRows.length === 0) {
      setError("There are no inventory differences to submit.");
      return;
    }

    if (!isReviewConfirmed) {
      setError(
        "Please confirm that you reviewed the corrections before continuing.",
      );
      return;
    }

    setSubmissionPreview(buildSubmissionPreview(discrepancyRows));
    setSuccessMessage(
      `Prepared ${discrepancyRows.length} correction${
        discrepancyRows.length === 1 ? "" : "s"
      } for future Square sync.`,
    );
  }

  async function handleSubmitToSquare() {
    setError(null);
    setVoiceError(null);
    setSuccessMessage(null);

    if (discrepancyRows.length === 0) {
      setError("There are no inventory differences to submit.");
      return;
    }

    if (!isReviewConfirmed) {
      setError(
        "Please confirm that you reviewed the corrections before submitting.",
      );
      return;
    }

    if (!isAdmin) {
      window.location.href = "/login?next=/inventory";
      return;
    }

    const preview = buildSubmissionPreview(discrepancyRows);

    try {
      setIsSubmittingToSquare(true);

      const response = await fetch("/api/square/inventory/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: preview.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            squareCount: item.squareCount,
            physicalCount: item.physicalCount,
            difference: item.difference,
          })),
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        submittedCount?: number;
        error?: string;
        details?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.details ?? data.error ?? "Square submission failed.",
        );
      }

      const submittedCount = data.submittedCount ?? preview.length;

      setSubmissionPreview(preview);

      setSubmittedSessionSummary({
        submittedAt: new Date().toISOString(),
        submittedCount,
        items: preview,
      });

      setSuccessMessage(
        `Submitted ${submittedCount} adjustment${
          submittedCount === 1 ? "" : "s"
        } to Square.`,
      );

      setEntries([]);
      setIsReviewConfirmed(false);
      window.localStorage.removeItem(INVENTORY_ENTRIES_STORAGE_KEY);

      await loadProducts();
      await loadInventoryHistory();
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Something went wrong while submitting to Square.");
      }
    } finally {
      setIsSubmittingToSquare(false);
    }
  }

  function handleStartVoiceInput() {
    setError(null);
    setVoiceError(null);

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError(
        "Voice input is not supported in this browser. Try Chrome or Edge, or use typed input.",
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setVoiceError(`Voice input error: ${event.error}`);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;

      if (!transcript) {
        setVoiceError(
          "Could not understand the voice input. Please try again.",
        );
        return;
      }

      setCommand(transcript.trim());
    };

    recognition.start();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    setIsAdmin(false);
  }

  async function saveInventoryEntry(entry: CountEntry) {
    try {
      const response = await fetch("/api/inventory/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: entry.id,
          productId: entry.productId,
          productName: entry.productName,
          quantity: entry.quantity,
          rawText: entry.rawText,
          source: entry.source,
          createdAt: entry.createdAt,
        }),
      });

      if (!response.ok) {
        console.error("Failed to save inventory entry:", await response.text());
      }
    } catch (error) {
      console.error("Failed to save inventory entry:", error);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-3 py-4 text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
                SpeakStock MVP
              </p>
              <h1 className="mt-2 text-3xl font-bold">
                Inventory Count Session
              </h1>
            </div>

            {isAdmin ? (
              <button
                onClick={handleLogout}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Log out
              </button>
            ) : (
              <a
                href="/login?next=/inventory"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Log in
              </a>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Type a count like{" "}
            <span className="font-semibold text-zinc-200">Miller Lite 48</span>.
            Each entry adds to the local physical count. At the end, review the
            difference between the local count and Square count.
          </p>

          {isLoadingProducts && (
            <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              Loading products from Square...
            </p>
          )}

          {productsError && (
            <p className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {productsError}
            </p>
          )}

          {!isLoadingProducts && !productsError && (
            <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              Loaded {products.length} product{products.length === 1 ? "" : "s"}{" "}
              from Square.
            </p>
          )}
        </section>

        <section className="sticky top-0 z-10 rounded-xl border border-zinc-800 bg-zinc-900/95 p-4 backdrop-blur sm:p-5">
          <label
            htmlFor="inventory-command"
            className="block text-sm font-medium text-zinc-300"
          >
            Count entry
          </label>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="inventory-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleAddEntry();
                }
              }}
              placeholder="Miller Lite 48"
              className="min-h-12 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-zinc-100 outline-none focus:border-emerald-500"
            />

            <button
              onClick={handleStartVoiceInput}
              disabled={isListening}
              className="min-h-12 rounded-lg border border-emerald-700 px-5 py-3 text-base font-semibold text-emerald-300 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isListening ? "Listening..." : "Use Voice"}
            </button>

            <button
              onClick={handleAddEntry}
              disabled={isLoadingProducts || products.length === 0}
              className="min-h-12 rounded-lg bg-emerald-500 px-5 py-3 text-base font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Add Count
            </button>

            <button
              onClick={handleUndoLastEntry}
              disabled={entries.length === 0}
              className="min-h-12 rounded-lg border border-zinc-700 px-5 py-3 text-base font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Undo Last
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          {voiceError && (
            <p className="mt-3 rounded-lg border border-yellow-900 bg-yellow-950 px-4 py-3 text-sm text-yellow-200">
              {voiceError}
            </p>
          )}

          {successMessage && (
            <p className="mt-3 rounded-lg border border-emerald-900 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
              {successMessage}
            </p>
          )}
        </section>

        <CollapsibleSection
          title="Running Count Summary"
          description="Current local count compared with Square inventory."
          defaultOpen
        >
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={handleClearSession}
              disabled={entries.length === 0}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear Session
            </button>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {summaryRows.map((row) => (
              <article
                key={row.productId}
                className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-100">
                      {row.productName}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      Square: {row.squareCount} · Counted: {row.localCount}
                    </p>
                  </div>

                  <p
                    className={`text-lg font-bold ${
                      row.difference === 0
                        ? "text-zinc-400"
                        : row.difference > 0
                          ? "text-emerald-400"
                          : "text-red-400"
                    }`}
                  >
                    {row.difference > 0 ? `+${row.difference}` : row.difference}
                  </p>
                </div>

                <button
                  onClick={() => handleResetProduct(row.productId)}
                  disabled={row.localCount === 0}
                  className="mt-3 w-full rounded-md border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset Count
                </button>
              </article>
            ))}
          </div>

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="py-3 pr-4">Product</th>
                  <th className="py-3 pr-4 text-right">Square</th>
                  <th className="py-3 pr-4 text-right">Counted</th>
                  <th className="py-3 pr-4 text-right">Difference</th>
                  <th className="py-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => (
                  <tr key={row.productId} className="border-b border-zinc-800">
                    <td className="py-3 pr-4 font-medium">{row.productName}</td>
                    <td className="py-3 pr-4 text-right">{row.squareCount}</td>
                    <td className="py-3 pr-4 text-right">{row.localCount}</td>
                    <td
                      className={`py-3 pr-4 text-right font-semibold ${
                        row.difference === 0
                          ? "text-zinc-400"
                          : row.difference > 0
                            ? "text-emerald-400"
                            : "text-red-400"
                      }`}
                    >
                      {row.difference > 0
                        ? `+${row.difference}`
                        : row.difference}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button
                        onClick={() => handleResetProduct(row.productId)}
                        disabled={row.localCount === 0}
                        className="rounded-md border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Reset Count
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        {submittedSessionSummary && (
          <section className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
                  Session Submitted
                </p>
                <h2 className="mt-1 text-xl font-semibold text-zinc-100">
                  {submittedSessionSummary.submittedCount} Square adjustment
                  {submittedSessionSummary.submittedCount === 1 ? "" : "s"}{" "}
                  submitted
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Submitted at{" "}
                  {formatSubmittedSessionDate(
                    submittedSessionSummary.submittedAt,
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSubmittedSessionSummary(null)}
                className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-900"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {submittedSessionSummary.items.map((item) => (
                <article
                  key={item.productId}
                  className="rounded-lg border border-emerald-900/70 bg-zinc-950 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-zinc-100">
                        {item.productName}
                      </h3>

                      <p
                        className={`mt-1 text-sm font-semibold ${
                          item.difference > 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {item.label}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        Square before: {item.squareCount} · Counted:{" "}
                        {item.physicalCount}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-lg font-bold text-zinc-100">
                        {item.difference > 0
                          ? `+${item.difference}`
                          : item.difference}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        Adjustment quantity: {Math.abs(item.difference)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-xl font-semibold">Differences to Review</h2>

          {discrepancyRows.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">
              No differences yet. Items with a difference of 0 will not need a
              Square correction.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-3 pr-4">Product</th>
                    <th className="py-3 pr-4 text-right">Square</th>
                    <th className="py-3 pr-4 text-right">Physical Count</th>
                    <th className="py-3 pr-4 text-right">Difference</th>
                    <th className="py-3 pr-4 text-right">Label</th>
                    <th className="py-3 pr-4 text-right">Square Adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancyRows.map((row) => (
                    <tr
                      key={row.productId}
                      className="border-b border-zinc-800"
                    >
                      <td className="py-3 pr-4 font-medium">
                        {row.productName}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {row.squareCount}
                      </td>
                      <td className="py-3 pr-4 text-right">{row.localCount}</td>
                      <td
                        className={`py-3 pr-4 text-right font-semibold ${
                          row.difference > 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {row.difference > 0
                          ? `+${row.difference}`
                          : row.difference}
                      </td>

                      <td className="py-3 pr-4 text-right text-zinc-300">
                        {getDifferenceLabel(row.difference)}
                      </td>

                      <td className="py-3 pr-4 text-right text-zinc-300">
                        {getAdjustmentActionText(row.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={isReviewConfirmed}
                onChange={(event) => setIsReviewConfirmed(event.target.checked)}
                disabled={discrepancyRows.length === 0}
                className="mt-1 h-4 w-4"
              />
              <span>
                I reviewed these inventory differences and confirm that the
                physical counts are accurate.
              </span>
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handlePreviewSubmission}
                disabled={discrepancyRows.length === 0 || !isReviewConfirmed}
                className="w-full rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 sm:w-auto"
              >
                Preview Future Square Sync
              </button>

              <button
                onClick={handleSubmitToSquare}
                disabled={
                  discrepancyRows.length === 0 ||
                  !isReviewConfirmed ||
                  isSubmittingToSquare
                }
                className="w-full rounded-lg bg-red-500 px-5 py-3 font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 sm:w-auto"
              >
                {isSubmittingToSquare ? "Submitting..." : "Submit to Square"}
              </button>
            </div>
          </div>
        </section>

        {submissionPreview && (
          <CollapsibleSection
            title="Square Adjustment Preview"
            description="Preview of the adjustments prepared for Square."
          >
            <p className="mt-2 text-sm text-emerald-100/80">
              These are the inventory differences prepared for Square. Positive
              differences will be submitted as Inventory Received, and negative
              differences will be submitted as Loss.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-emerald-900 text-emerald-100/70">
                    <th className="py-3 pr-4">Product</th>
                    <th className="py-3 pr-4 text-right">Square Count</th>
                    <th className="py-3 pr-4 text-right">Physical Count</th>
                    <th className="py-3 pr-4 text-right">Difference</th>
                    <th className="py-3 pr-4 text-right">Adjustment Type</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionPreview.map((item) => (
                    <tr
                      key={item.productId}
                      className="border-b border-emerald-900/60"
                    >
                      <td className="py-3 pr-4 font-medium">
                        {item.productName}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {item.squareCount}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {item.physicalCount}
                      </td>
                      <td
                        className={`py-3 pr-4 text-right font-semibold ${
                          item.difference > 0
                            ? "text-emerald-300"
                            : "text-red-300"
                        }`}
                      >
                        {item.difference > 0
                          ? `+${item.difference}`
                          : item.difference}
                      </td>
                      <td className="py-3 pr-4 text-right">{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <pre className="mt-4 overflow-x-auto rounded-lg border border-emerald-900 bg-zinc-950 p-4 text-xs text-emerald-100">
              {JSON.stringify(submissionPreview, null, 2)}
            </pre>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Recent Square Inventory Changes"
          description="SpeakStock-submitted inventory received and lost adjustments from Square."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-zinc-400">
                Refresh this list after submitting inventory adjustments.
              </p>
            </div>

            <button
              onClick={loadInventoryHistory}
              disabled={isLoadingHistory}
              className="min-h-11 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingHistory ? "Refreshing..." : "Refresh History"}
            </button>
          </div>

          {historyError && (
            <p className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {historyError}
            </p>
          )}

          {!historyError && historyItems.length === 0 && (
            <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
              {isLoadingHistory
                ? "Loading recent inventory changes..."
                : "No recent Square inventory changes found."}
            </p>
          )}

          {historyItems.length > 0 && (
            <div className="mt-4 space-y-3">
              {historyItems.map((item, index) => (
                <article
                  key={
                    item.id ??
                    item.referenceId ??
                    `${item.catalogObjectId}-${index}`
                  }
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          item.label === "Inventory Received"
                            ? "text-emerald-400"
                            : item.label === "Lost"
                              ? "text-red-400"
                              : "text-zinc-300"
                        }`}
                      >
                        {getHistoryItemTitle(item)}
                      </p>

                      <h3 className="mt-1 font-semibold text-zinc-100">
                        {getProductNameForHistoryItem(item, products)}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-400">
                        {item.type === "ADJUSTMENT"
                          ? `${item.fromState ?? "Unknown"} → ${
                              item.toState ?? "Unknown"
                            }`
                          : item.type}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-lg font-bold text-zinc-100">
                        Qty {item.quantity ?? "?"}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {formatHistoryDate(
                          item.calculatedAt ?? item.occurredAt,
                        )}
                      </p>
                    </div>
                  </div>

                  {item.referenceId && (
                    <p className="mt-3 break-all text-xs text-zinc-500">
                      Reference: {item.referenceId}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Entry Log"
          description="Every typed or voice count added during this session."
        >
          {entries.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">
              No count entries added yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-3 pr-4">Product</th>
                    <th className="py-3 pr-4 text-right">Quantity</th>
                    <th className="py-3 pr-4">Raw Input</th>
                    <th className="py-3 pr-4">Source</th>
                    <th className="py-3 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map((entry) => (
                    <tr key={entry.id} className="border-b border-zinc-800">
                      <td className="py-3 pr-4 font-medium">
                        {entry.productName}
                      </td>
                      <td className="py-3 pr-4 text-right">{entry.quantity}</td>
                      <td className="py-3 pr-4 text-zinc-400">
                        {entry.rawText}
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">
                        {entry.source}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="rounded-md border border-red-900 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-950"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Historical Entry Log"
          description="Saved typed and voice entries from the SpeakStock database."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-400">
              Shows the most recent 100 entries saved by SpeakStock.
            </p>

            <button
              type="button"
              onClick={loadHistoricalEntries}
              disabled={isLoadingHistoricalEntries}
              className="min-h-11 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingHistoricalEntries ? "Refreshing..." : "Refresh Entries"}
            </button>
          </div>

          {historicalEntriesError && (
            <p className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {historicalEntriesError}
            </p>
          )}

          {!historicalEntriesError && historicalEntries.length === 0 && (
            <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
              {isLoadingHistoricalEntries
                ? "Loading saved entries..."
                : "No saved entries found."}
            </p>
          )}

          {historicalEntries.length > 0 && (
            <div className="mt-4 space-y-3">
              {historicalEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-zinc-100">
                        {entry.productName}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-400">
                        Raw input:{" "}
                        <span className="text-zinc-300">{entry.rawText}</span>
                      </p>

                      <p className="mt-1 text-sm text-zinc-500">
                        Source: {entry.source} ·{" "}
                        {formatHistoricalEntryDate(entry.createdAt)}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-lg font-bold text-zinc-100">
                        Qty {entry.quantity}
                      </p>

                      <p
                        className={`mt-1 text-sm ${
                          entry.submittedAt
                            ? "text-emerald-400"
                            : "text-zinc-500"
                        }`}
                      >
                        {entry.submittedAt ? "Submitted" : "Not submitted"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Loaded Square Products"
          description="Debug view of products loaded from Square."
        >
          <p className="mt-2 text-sm text-zinc-400">
            Temporary debug view showing product names and aliases used for
            matching.
          </p>

          {products.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">
              No Square products loaded.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-3 pr-4">Product</th>
                    <th className="py-3 pr-4">Aliases</th>
                    <th className="py-3 pr-4 text-right">Square Count</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-zinc-800">
                      <td className="py-3 pr-4 font-medium">{product.name}</td>
                      <td className="py-3 pr-4 text-zinc-400">
                        {product.aliases.join(", ")}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {product.squareCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </main>
  );
}
