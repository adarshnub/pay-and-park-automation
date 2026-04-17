import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ocr-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const secret = Deno.env.get("OCR_EDGE_SECRET");
  if (!secret || req.headers.get("x-ocr-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { imageBase64?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const imageBase64 = body.imageBase64?.trim();
  if (!imageBase64) {
    return new Response(JSON.stringify({ error: "imageBase64 required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(imageBase64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid base64" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const tesseractMod = await import("npm:tesseract.js@5.1.1");
    const recognize =
      (tesseractMod as { recognize?: unknown }).recognize ??
      (tesseractMod as { default?: { recognize?: unknown } }).default?.recognize;

    if (typeof recognize !== "function") {
      throw new Error("tesseract.js recognize() unavailable in edge runtime");
    }

    // Avoid worker blob URLs to improve compatibility in Supabase Edge runtime.
    const { data } = await recognize(bytes, "eng", {
      logger: () => {},
      workerBlobURL: false,
    }) as { data: { text?: string; confidence?: number } };

    return new Response(
      JSON.stringify({
        rawText: (data.text ?? "").trim(),
        confidence: typeof data.confidence === "number" ? data.confidence : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "OCR failed";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("ocr-tesseract:", message, stack ?? "");
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
