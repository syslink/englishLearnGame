import { NextRequest, NextResponse } from "next/server";

const GH_RAW = "https://raw.githubusercontent.com";

/**
 * Catch-all proxy for raw.githubusercontent.com (model_lib wasm files).
 * /api/gh-proxy/mlc-ai/binary-mlc-llm-libs/main/file.wasm
 * -> https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/file.wasm
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
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; gh-proxy)",
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    };
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error("GH proxy error:", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
