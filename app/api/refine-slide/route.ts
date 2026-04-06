import { NextRequest, NextResponse } from 'next/server';
import { openai, REFINE_SYSTEM_PROMPT } from '@/lib/openai';
import { Slide } from '@/types';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { slideId, currentContent, instruction, allSlides } = await req.json() as {
      slideId: number;
      currentContent: string;
      instruction: string;
      allSlides: Slide[];
    };

    const context = allSlides.map((s, i) => `Slide ${i + 1}: "${s.title}" — ${s.description}`).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_completion_tokens: 1024,
      messages: [
        { role: 'system', content: REFINE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Contexto do carrossel:\n${context}\n\nConteúdo atual do slide ${slideId}:\n${currentContent}\n\nInstrução: ${instruction}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content ?? '';
    let refined;
    try {
      refined = JSON.parse(text);
    } catch {
      refined = { title: currentContent, description: '' };
    }

    return NextResponse.json(refined);
  } catch (err) {
    console.error('[refine-slide]', err);
    return NextResponse.json({ error: 'Erro ao refinar slide' }, { status: 500 });
  }
}
