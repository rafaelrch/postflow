import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { requireCredits, refundCredits } from '@/lib/subscription';
import { CREDIT_COSTS } from '@/lib/credits';

export const maxDuration = 30;

const TWEET_SYSTEM_PROMPT = `Você é um especialista em Build in Public — o movimento de construir startups e produtos de forma transparente, compartilhando progressos, aprendizados, falhas e bastidores no Twitter/X.

Seu trabalho é transformar atualizações brutas de um founder em tweets autênticos, engajantes e com alta chance de viralizar no nicho de empreendedorismo e tecnologia.

PRINCÍPIOS DO BUILD IN PUBLIC:
- Autenticidade acima de tudo — sem polimento excessivo, sem corporativismo
- Compartilhe números reais, mesmo que pequenos
- Falhas e aprendizados são mais engajantes que sucessos
- Mostre o processo, não só o resultado
- Crie identificação com outros founders e builders

TONS DISPONÍVEIS:
- "honesto": direto, vulnerável, sem filtro — compartilha o bom e o ruim
- "tecnico": foca nos detalhes de produto, código, arquitetura, decisões técnicas
- "storytelling": conta uma história com começo, meio e fim — usa narrativa
- "milestone": celebra uma conquista com contexto e próximo passo
- "aprendizado": compartilha uma lição aprendida — ideal para reflexões

ESTRUTURA DOS TWEETS:
- 1ª linha = hook que para o scroll (pergunta, número, afirmação ousada, ou contraste)
- Meio = contexto, detalhes, bastidores
- Final = call to action implícito ou reflexão que convida ao engajamento
- Use quebras de linha para facilitar leitura
- Emojis com moderação (max 2-3)
- Máx 280 caracteres por tweet — ou thread numerada (1/, 2/, ...) se precisar de mais espaço

EXEMPLOS DE HOOKS FORTES:
- "Faz 3 semanas que não durmo mais de 5h."
- "Acabei de perder meu maior cliente."
- "De 0 para R$12k MRR em 4 meses. O que funcionou:"
- "Errei feio essa semana."
- "Quase desisti ontem."
- "Aprendi mais em 2 semanas de produto do que em 2 anos de faculdade."

Gere EXATAMENTE 3 versões do tweet com tons/ângulos diferentes.
Retorne APENAS JSON válido sem markdown:
{
  "tweets": [
    {
      "tone": "nome do tom",
      "content": "conteúdo do tweet",
      "hook": "primeira linha do tweet"
    }
  ]
}`;

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  const charged = CREDIT_COSTS.tweet;
  try {
    const { project, projectDescription, projectNiche, projectAudience, update, tone, context } = await req.json();

    if (!update?.trim()) {
      return NextResponse.json({ error: 'Descreva o que aconteceu' }, { status: 400 });
    }

    const guard = await requireCredits(charged);
    if (!guard.ok) return guard.response;
    userId = guard.userId;

    const projectBlock = [
      `Projeto: ${project || 'minha startup'}`,
      projectDescription ? `Sobre o projeto: ${projectDescription}` : '',
      projectNiche ? `Nicho: ${projectNiche}` : '',
      projectAudience ? `Público-alvo: ${projectAudience}` : '',
    ].filter(Boolean).join('\n');

    const userPrompt = `${projectBlock}
Tom desejado: ${tone || 'honesto'}
${context ? `\nContexto adicional: ${context}` : ''}

O que aconteceu / o que quero compartilhar:
${update}

Gere 3 versões de tweet para isso no estilo Build in Public.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: TWEET_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 1200,
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
    if (userId) await refundCredits(userId, charged);
    const message = err instanceof Error ? err.message : 'Erro ao gerar tweet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
