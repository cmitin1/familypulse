import { NextRequest, NextResponse } from "next/server";

const backendBase = process.env.BACKEND_INTERNAL_URL || process.env.BACKEND_URL;

function resolveTarget(req: NextRequest, params: { path: string[] }) {
  if (!backendBase) {
    throw new Error("BACKEND_INTERNAL_URL or BACKEND_URL is required for proxy");
  }
  const path = params.path.join("/");
  const url = new URL(`${backendBase.replace(/\/$/, "")}/${path}`);
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function proxy(req: NextRequest, params: { path: string[] }) {
  try {
    const targetUrl = resolveTarget(req, params);
    const contentType = req.headers.get("content-type") || "";
    const auth = req.headers.get("authorization");
    const init: RequestInit = {
      method: req.method,
      headers: {
        ...(auth ? { authorization: auth } : {}),
        ...(contentType ? { "content-type": contentType } : {})
      },
      cache: "no-store"
    };

    if (!["GET", "HEAD"].includes(req.method)) {
      init.body = await req.text();
    }

    const upstream = await fetch(targetUrl, init);
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Proxy request failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
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
