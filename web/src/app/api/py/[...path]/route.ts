import { NextRequest, NextResponse } from "next/server";

/** Allow long ASR + scoring upstream (raise Vercel plan limits if you hit timeouts). */
export const maxDuration = 120;

export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

function targetUrl(pathSegments: string[], search: string): string {
  const path = pathSegments.length ? pathSegments.join("/") : "";
  const base = BACKEND.replace(/\/$/, "");
  return `${base}/${path}${search}`;
}

function looksLikeVercelCheckpoint(contentType: string | null, bodyText: string): boolean {
  if (!contentType?.toLowerCase().includes("text/html")) return false;
  return bodyText.includes("Vercel Security Checkpoint") || bodyText.includes("vercel.link/security-checkpoint");
}

async function proxy(request: NextRequest, pathSegments: string[]) {
  const host = request.nextUrl.host;
  const backend = BACKEND.replace(/\/$/, "");
  // Prevent accidental recursion (BACKEND_URL pointing back at this same Vercel deployment).
  if (backend.includes(host)) {
    return NextResponse.json(
      {
        detail:
          "Proxy misconfigured: BACKEND_URL points to this same site, which would create a loop. Set BACKEND_URL to your external FastAPI host (Render/Railway/Fly/VM).",
        hint: { BACKEND_URL: backend, request_host: host },
      },
      { status: 500 },
    );
  }

  const url = targetUrl(pathSegments, request.nextUrl.search);
  const method = request.method;

  const headers = new Headers();
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers.set("x-request-id", requestId);
  headers.set("user-agent", "FinalRoundProxy/1.0");

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: body && (body as ArrayBuffer).byteLength ? body : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream unreachable";
    return NextResponse.json(
      { detail: `Backend unreachable (${BACKEND}). Start the API or set BACKEND_URL. ${msg}` },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  const upstreamCt = upstream.headers.get("content-type");
  if (upstreamCt) outHeaders.set("content-type", upstreamCt);
  const upstreamRid = upstream.headers.get("x-request-id");
  if (upstreamRid) outHeaders.set("x-request-id", upstreamRid);

  const payload = await upstream.arrayBuffer();
  // If upstream returned the Vercel Security Checkpoint HTML, translate to actionable JSON.
  if (looksLikeVercelCheckpoint(upstreamCt, new TextDecoder().decode(payload))) {
    return NextResponse.json(
      {
        detail:
          "Upstream returned Vercel Security Checkpoint HTML instead of JSON. This usually means your BACKEND_URL points at a Vercel deployment with bot protection (or a blocked origin). Point BACKEND_URL at your external FastAPI container host.",
        hint: { BACKEND_URL: BACKEND },
      },
      { status: 502 },
    );
  }
  return new NextResponse(payload, {
    status: upstream.status,
    headers: outHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}
