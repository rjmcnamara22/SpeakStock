import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
          SpeakStock
        </p>
        <h1 className="mt-3 text-4xl font-bold">
          Voice-assisted inventory reconciliation for Square.
        </h1>
        <p className="mt-4 text-zinc-400">
          Start a local inventory session, count items across multiple storage
          locations, and review differences before syncing with Square.
        </p>
        <Link
          href="/inventory"
          className="mt-6 inline-block rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          Start Inventory Session
        </Link>
      </section>
    </main>
  );
}