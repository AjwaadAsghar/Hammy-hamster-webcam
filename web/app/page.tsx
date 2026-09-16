import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-orange-100 px-6 text-center dark:from-zinc-950 dark:to-zinc-900">
      <div className="text-6xl">🐹</div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Happy Birthday Stinky
      </h1>
      <p className="mt-3 max-w-sm text-zinc-600 dark:text-zinc-400">
        Point your webcam at yourself and pull faces — a hamster reacts live.
      </p>
      <Link
        href="/camera"
        className="mt-8 rounded-full bg-zinc-900 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 dark:bg-white dark:text-zinc-900"
      >
        Open for your stinky fart
      </Link>
      <p className="mt-6 max-w-sm text-xs text-zinc-500 dark:text-zinc-500">
        Needs camera access. Nothing leaves your browser.
      </p>
    </div>
  );
}
