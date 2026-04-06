export async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.NANOBANANA_API_KEY;
  if (!apiKey) throw new Error('NANOBANANA_API_KEY not configured');

  const response = await fetch('https://api.nanobanana.pro/v1/generate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      width: 1080,
      height: 1350,
      steps: 4,
      guidance_scale: 3.5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Nano Banana API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const imageUrl = data.url ?? data.image_url ?? data.output?.[0];

  if (!imageUrl) {
    throw new Error('No image URL returned from Nano Banana API');
  }

  return imageUrl;
}

export function getPlaceholderImage(text: string): string {
  // Returns a dark SVG placeholder with initials
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
