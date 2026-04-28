/**
 * Google Gemini image generation client.
 *
 * Nano Banana 2 = gemini-3-pro-image-preview (Google's image-output model).
 * Override via GEMINI_IMAGE_MODEL if your project has access to a different
 * variant. Returns the raw base64 + mime type so the caller can upload to
 * its own storage.
 */
export async function generateGeminiImage(prompt: string): Promise<{ b64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada. Adicione no .env.local.');
  }

  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Gemini ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || message;
    } catch {
      message = `${message}: ${text.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data: string; mimeType?: string } }> };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini não retornou imagem (verifique se o modelo suporta image output)');
  }

  return {
    b64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  };
}

export function getPlaceholderImage(text: string): string {
  const initials = text
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="#111111"/>
    <text x="540" y="700" font-family="Inter, sans-serif" font-size="120" fill="rgba(255,255,255,0.2)" text-anchor="middle" dominant-baseline="middle">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
