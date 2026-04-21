/**
 * Resolve API base for browser calls.
 * - When NEXT_PUBLIC_USE_PROXY=1, use same-origin `/api/py` (see app/api/py/[...path]/route.ts).
 * - Otherwise use NEXT_PUBLIC_API_URL (direct to FastAPI; CORS must allow the web origin).
 */
export function getApiBase(): string {
  const useProxy =
    process.env.NEXT_PUBLIC_USE_PROXY === "1" ||
    process.env.NEXT_PUBLIC_USE_PROXY === "true";
  if (useProxy) {
    return "/api/py";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
}

export function apiUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
