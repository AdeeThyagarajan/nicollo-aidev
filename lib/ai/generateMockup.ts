type GenerateMockupResult = { ok: true; imageDataUrl: string } | { ok: false; reason: string };

export async function generateMockup(args: {
  apiKey: string;
  userMessage: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<GenerateMockupResult> {
  const { apiKey, userMessage, history } = args;

  const memory =
    Array.isArray(history) && history.length
      ? history
          .slice(-10)
          .map((t) => `${t.role}: ${String(t.content).slice(0, 220)}`)
          .join("\n")
      : "";

  const prompt =
    "Create a polished UI mockup image for a web app. " +
    "The mockup must look like a modern SaaS product screenshot (clean, premium, legible). " +
    "No device frames. No watermarks. No text outside the UI. " +
    "Use a clear layout with a top bar, main content area, and a primary action. " +
    "If the app is location-based, include a search/location input and results list. " +
    "If the app is weather-based, include current conditions, temperature, and hourly chips. " +
    "Keep it realistic and shippable.\n\n" +
    (memory ? `Conversation context:\n${memory}\n\n` : "") +
    `User request:\n${userMessage}`;

  const primaryModel = process.env.OPENAI_IMAGE_MODEL || "chatgpt-image-latest";
  const fallbackModel = process.env.OPENAI_IMAGE_MODEL_FALLBACK || "gpt-image-1";

  const doReq = async (model: string) => {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Image request failed (${r.status}): ${text.slice(0, 200)}`);
    }

    const data = (await r.json()) as any;
    const b64: string | undefined = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image API returned no image data.");

    return `data:image/png;base64,${b64}`;
  };

  try {
    const imageDataUrl = await doReq(primaryModel);
    return { ok: true, imageDataUrl };
  } catch (e) {
    try {
      if (primaryModel !== fallbackModel) {
        const imageDataUrl = await doReq(fallbackModel);
        return { ok: true, imageDataUrl };
      }
    } catch {
      // fall through
    }
    return { ok: false, reason: "Image generation failed." };
  }
}
