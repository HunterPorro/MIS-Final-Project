import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

function targetUrl(pathSegments: string[], search: string): string {
  const path = pathSegments.length ? pathSegments.join("/") : "";
  const base = BACKEND.replace(/\/$/, "");
  return `${base}/${path}${search}`;
}

async function proxy(request: NextRequest, pathSegments: string[]) {
  const url = targetUrl(pathSegments, request.nextUrl.search);
  const method = request.method;

  const headers = new Headers();
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);

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

  const payload = await upstream.arrayBuffer();
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
