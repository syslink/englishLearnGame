import { NextRequest, NextResponse } from "next/server";

const HF_MIRROR = "https://hf-mirror.com";

/**
 * Catch-all proxy: /api/hf-proxy/mlc-ai/Model/resolve/main/file.bin
 * -> https://hf-mirror.com/mlc-ai/Model/resolve/main/file.bin
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
  const mirrorUrl = `${HF_MIRROR}/${targetPath}`;

  try {
    const upstream = await fetch(mirrorUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; hf-proxy)",
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
    console.error("HF proxy error:", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
