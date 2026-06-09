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
import { productAliasOverrides } from "@/lib/inventory/productAliasOverrides";

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

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const INVENTORY_ENTRIES_STORAGE_KEY = "speakstock_inventory_entries";

export default function InventoryPage() {
  const [command, setCommand] = useState("");
  const [entries, setEntries] = useState<CountEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isReviewConfirmed, setIsReviewConfirmed] = useState(false);
  const [submissionPreview, setSubmissionPreview] = useState<
    InventorySubmissionPreview[] | null
  >(null);
  const [hasLoadedEntries, setHasLoadedEntries] = useState(false);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const summaryRows = useMemo(() => {
    return buildInventorySummary(products, entries);
  }, [products, entries]);

  const discrepancyRows = useMemo(() => {
    return getDiscrepancyRows(summaryRows);
  }, [summaryRows]);

  useEffect(() => {
    const savedEntries = window.localStorage.getItem(
      INVENTORY_ENTRIES_STORAGE_KEY,
    );

    if (savedEntries) {
      try {
        const parsedEntries = JSON.parse(savedEntries) as CountEntry[];
        setEntries(parsedEntries);
      } catch {
        window.localStorage.removeItem(INVENTORY_ENTRIES_STORAGE_KEY);
      }
    }

    setHasLoadedEntries(true);
  }, []);

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

    loadProducts();
  }, []);

  function handleAddEntry() {
    try {
      setError(null);
      setVoiceError(null);
      setSuccessMessage(null);
      setSubmissionPreview(null);
      setIsReviewConfirmed(false);

      if (products.length === 0) {
        setError(
          "No products are loaded yet. Check your Square Sandbox products.",
        );
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

  function getDifferenceLabel(difference: number): string {
    if (difference < 0) return "Lost";
    if (difference > 0) return "Received";
    return "No correction";
  }

  function getSubmissionLabel(difference: number): "Lost" | "Received" {
    return difference < 0 ? "Lost" : "Received";
  }

  function buildSubmissionPreview(): InventorySubmissionPreview[] {
    return discrepancyRows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      squareCount: row.squareCount,
      physicalCount: row.localCount,
      difference: row.difference,
      label: getSubmissionLabel(row.difference),
    }));
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

    setSubmissionPreview(buildSubmissionPreview());
    setSuccessMessage(
      `Prepared ${discrepancyRows.length} correction${
        discrepancyRows.length === 1 ? "" : "s"
      } for future Square sync.`,
    );
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

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
            SpeakStock MVP
          </p>
          <h1 className="mt-2 text-3xl font-bold">Inventory Count Session</h1>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Type a count like{" "}
            <span className="font-semibold text-zinc-200">Miller Lite 48</span>.
            Each entry adds to the local physical count. At the end, review the
            difference between the local count and Square count.
          </p>

          {isLoadingProducts && (
            <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              Loading products from Square Sandbox...
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
              from Square Sandbox.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
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
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none focus:border-emerald-500"
            />

            <button
              onClick={handleStartVoiceInput}
              disabled={isListening}
              className="rounded-lg border border-emerald-700 px-5 py-3 font-semibold text-emerald-300 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isListening ? "Listening..." : "Use Voice"}
            </button>

            <button
              onClick={handleAddEntry}
              disabled={isLoadingProducts || products.length === 0}
              className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Add Count
            </button>

            <button
              onClick={handleUndoLastEntry}
              disabled={entries.length === 0}
              className="rounded-lg border border-zinc-700 px-5 py-3 font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
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

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Running Count Summary</h2>
            <button
              onClick={handleClearSession}
              disabled={entries.length === 0}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear Session
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
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
        </section>

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
                    <th className="py-3 pr-4 text-right">Future Action</th>
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
                        Set Square to {row.localCount}
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

            <button
              onClick={handlePreviewSubmission}
              disabled={discrepancyRows.length === 0 || !isReviewConfirmed}
              className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Preview Future Square Sync
            </button>
          </div>
        </section>

        {submissionPreview && (
          <section className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-5">
            <h2 className="text-xl font-semibold text-emerald-200">
              Future Square Sync Preview
            </h2>

            <p className="mt-2 text-sm text-emerald-100/80">
              These are the physical counts that would be submitted to Square
              after final confirmation. Square integration is not connected yet.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-emerald-900 text-emerald-100/70">
                    <th className="py-3 pr-4">Product</th>
                    <th className="py-3 pr-4 text-right">Square Count</th>
                    <th className="py-3 pr-4 text-right">Physical Count</th>
                    <th className="py-3 pr-4 text-right">Difference</th>
                    <th className="py-3 pr-4 text-right">Label</th>
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
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-xl font-semibold">Entry Log</h2>

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
        </section>
      </div>
    </main>
  );
}
