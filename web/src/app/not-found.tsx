import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">404</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Page not found</h1>
      <p className="mt-4 max-w-md text-zinc-400">
        That route does not exist. Head back to the readiness assessment or use the navigation above.
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex rounded-full bg-white px-8 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/30 transition hover:bg-zinc-200"
      >
        Back to home
      </Link>
    </div>
  );
}
