import { NextRequest, NextResponse } from "next/server";

const backendCandidates = [process.env.BACKEND_INTERNAL_URL, process.env.BACKEND_URL].filter(
  (value): value is string => Boolean(value && value.trim())
);

function resolveTarget(base: string, req: NextRequest, params: { path: string[] }) {
  if (!base) {
    throw new Error("BACKEND_INTERNAL_URL or BACKEND_URL is required for proxy");
  }
  const path = params.path.join("/");
  const url = new URL(`${base.replace(/\/$/, "")}/${path}`);
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function proxy(req: NextRequest, params: { path: string[] }) {
  if (backendCandidates.length === 0) {
    return NextResponse.json(
      {
        error: "Proxy request failed",
        details: "BACKEND_INTERNAL_URL or BACKEND_URL is required for proxy"
      },
      { status: 502 }
    );
  }

  const contentType = req.headers.get("content-type") || "";
  const auth = req.headers.get("authorization");
  const bodyText = !["GET", "HEAD"].includes(req.method) ? await req.text() : undefined;
  const attempts: string[] = [];

  for (const base of backendCandidates) {
    const targetUrl = resolveTarget(base, req, params);
    try {
      const init: RequestInit = {
        method: req.method,
        headers: {
          ...(auth ? { authorization: auth } : {}),
          ...(contentType ? { "content-type": contentType } : {})
        },
        cache: "no-store",
        body: bodyText
      };
      const upstream = await fetch(targetUrl, init);
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") || "application/json"
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      attempts.push(`${targetUrl} -> ${message}`);
    }
  }

  return NextResponse.json(
    {
      error: "Proxy request failed",
      details: attempts.join(" | ") || "Upstream unavailable"
    },
    { status: 502 }
  );
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
