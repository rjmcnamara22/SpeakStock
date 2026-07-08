"use client";

import { useState } from "react";

function getSafeNextPath(): string {
  if (typeof window === "undefined") {
    return "/inventory";
  }

  const searchParams = new URLSearchParams(window.location.search);
  const nextPath = searchParams.get("next");

  if (!nextPath || !nextPath.startsWith("/")) {
    return "/inventory";
  }

  return nextPath;
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setError(null);
      setIsSubmitting(true);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Login failed.");
      }

      window.location.href = getSafeNextPath();
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
          SpeakStock
        </p>

        <h1 className="mt-2 text-2xl font-bold">Admin Login</h1>

        <p className="mt-2 text-sm text-zinc-400">
          Sign in to access protected inventory actions, including Square
          inventory adjustments.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-300"
            >
              Shared password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none focus:border-emerald-500"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
