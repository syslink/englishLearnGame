import { NextRequest, NextResponse } from "next/server";

const GH_RAW = "https://raw.githubusercontent.com";

/**
 * Catch-all proxy for raw.githubusercontent.com (model_lib wasm files).
 * Supports Range requests for resume downloads.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const targetPath = path.map(encodeURIComponent).join("/");
  const targetUrl = `${GH_RAW}/${targetPath}`;

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (compatible; gh-proxy)",
    };
    const range = req.headers.get("range");
    if (range) {
      upstreamHeaders["Range"] = range;
    }

    const upstream = await fetch(targetUrl, { headers: upstreamHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    };

    for (const key of ["content-length", "content-range"]) {
      const val = upstream.headers.get(key);
      if (val) headers[key] = val;
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error("GH proxy error:", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
