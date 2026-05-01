import {
  CORS_HEADERS,
  getCloudProviderSummaries,
  getSpeechRecognitionProviderSummaries,
  getVoiceProviderSummaries,
} from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET() {
  const textProviders = getCloudProviderSummaries();
  const voiceProviders = getVoiceProviderSummaries();
  const speechRecognitionProviders = getSpeechRecognitionProviderSummaries();
  return Response.json(
    {
      providers: textProviders,
      textProviders,
      voiceProviders,
      speechRecognitionProviders,
    },
    { headers: CORS_HEADERS },
  );
}
