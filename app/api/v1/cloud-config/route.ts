import { CORS_HEADERS, getCloudProviderSummaries } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET() {
  return Response.json(
    {
      providers: getCloudProviderSummaries(),
    },
    { headers: CORS_HEADERS },
  );
}

