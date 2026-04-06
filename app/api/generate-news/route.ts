import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export const maxDuration = 30;

const NEWS_SYSTEM_PROMPT = `Você é um editor de notícias especializado em criar manchetes e temas editoriais para o "the arke news" — um informativo visual de branding, design e negócios criativos.

Seu trabalho é transformar um assunto bruto em conteúdo editorial pronto para um card de notícia visual no Instagram.

ESTRUTURA DO OUTPUT:
- tema: categoria/editoria em itálico (ex: "Branding", "Design", "Negócios", "Tecnologia", "Cultura") — máx 25 caracteres
- titulo: manchete direta, impactante, sem verbo no infinitivo — máx 80 caracteres
- descricao: parágrafo curto com contexto e detalhes — 2 a 3 frases
- legenda: legenda para o post no Instagram — engajante, 2-3 linhas + hashtags relevantes

PRINCÍPIOS EDITORIAIS:
- Tom: sério, informativo, premium — não sensacionalista
- Manchetes diretas e declarativas (fatos, não perguntas)
- Use números e dados quando disponíveis
- Evite adjetivos vazios ("incrível", "revolucionário")
- O tema deve posicionar a notícia editorialmente

Retorne APENAS JSON válido sem markdown:
{
  "tema": "string",
  "titulo": "string",
  "descricao": "string",
  "legenda": "string"
}`;

export async function POST(req: NextRequest) {
  try {
    const { assunto } = await req.json();

    if (!assunto?.trim()) {
      return NextResponse.json({ error: 'Informe o assunto da notícia' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: NEWS_SYSTEM_PROMPT },
        { role: 'user', content: `Assunto: ${assunto}` },
      ],
      temperature: 0.7,
      max_tokens: 600,
    });

    const text = response.choices[0]?.message?.content || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Resposta inválida da IA');
      parsed = JSON.parse(match[0]);
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar notícia';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
