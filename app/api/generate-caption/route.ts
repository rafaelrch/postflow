import { NextRequest, NextResponse } from 'next/server';
import { openai, CAPTION_SYSTEM_PROMPT } from '@/lib/openai';
import { requireActiveSubscription } from '@/lib/subscription';
import { Slide } from '@/types';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const guard = await requireActiveSubscription();
    if (!guard.ok) return guard.response;

    const { slides, style } = await req.json() as { slides: Slide[]; style: string };

    const slideSummary = slides
      .map((s, i) => `Slide ${i + 1}: ${s.title}${s.description ? ' — ' + s.description : ''}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_completion_tokens: 1024,
      messages: [
        { role: 'system', content: CAPTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Estilo do carrossel: ${style}\n\nConteúdo dos slides:\n${slideSummary}\n\nGere uma legenda completa com emojis e hashtags relevantes.`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content ?? '';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { caption: text, hashtags: [] };
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[generate-caption]', err);
    return NextResponse.json({ error: 'Erro ao gerar legenda' }, { status: 500 });
  }
}
