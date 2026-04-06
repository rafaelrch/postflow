import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { openai, CAROUSEL_SYSTEM_PROMPT, TWITTER_CAROUSEL_SYSTEM_PROMPT } from '@/lib/openai';
import { GenerateCarouselInput, CarouselAIResponse } from '@/types';

export const maxDuration = 60;

function parseAIJson(text: string): CarouselAIResponse {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta da IA inválida — não foi possível parsear JSON');
    return JSON.parse(match[0]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateCarouselInput & { manual?: boolean } = await req.json();

    if (body.manual) {
      const slides = Array.from({ length: body.slideCount }, (_, i) => ({
        id: i + 1,
        title: i === 0 ? 'Título da Capa' : i === body.slideCount - 1 ? 'Me segue pra mais!' : `Slide ${i + 1}`,
        description: i === 0 ? 'Subtítulo aqui' : '',
        highlightWord: '',
        imagePrompt: '',
        backgroundColor: i === 0 || i === body.slideCount - 1 ? '#0A0A0A' : '#111111',
      }));
      return NextResponse.json({ slides, caption: '', hashtags: [] });
    }

    // Build messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (body.referenceImageBase64) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: body.referenceImageBase64.startsWith('data:')
                ? body.referenceImageBase64
                : `data:image/jpeg;base64,${body.referenceImageBase64}`,
            },
          },
          {
            type: 'text',
            text: buildUserPrompt(body),
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: buildUserPrompt(body) });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-nano',
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: body.style === 'profile' ? TWITTER_CAROUSEL_SYSTEM_PROMPT : CAROUSEL_SYSTEM_PROMPT },
        ...messages,
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    const aiData = parseAIJson(text);

    return NextResponse.json(aiData);
  } catch (err) {
    console.error('[generate-carousel]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

function buildUserPrompt(body: GenerateCarouselInput): string {
  if (body.style === 'profile') {
    const format = body.twitterFormat ?? 'B';

    if (format === 'A') {
      return `FORMATO A — Tweet Único (1 slide)

Tema: "${body.prompt}"
${body.profileData ? `Perfil: ${body.profileData.name} (${body.profileData.handle})` : ''}

Crie 1 slide em formato de mini-parágrafo humano, com texto fluido e natural sobre esse tema.
Use contraste. Sem clichês motivacionais.
Não escreva em frases picadas ou linhas soltas: quero um bloco curto, mas com cara de texto escrito por uma pessoa.
A ideia precisa tocar em branding, posicionamento, percepção de marca ou conexão com a audiência — nunca ser só uma observação genérica.`;
    }

    return `FORMATO B — Thread Completa

Tema: "${body.prompt}"
Número de slides: ${body.slideCount}
${body.imageDirection ? `Direcionamento visual: ${body.imageDirection}` : ''}
${body.profileData ? `Perfil: ${body.profileData.name} (${body.profileData.handle})` : ''}

Crie uma thread completa no estilo carrossel do Instagram com a estrutura: hook, contexto, tensão/fracassos, virada, revelação, síntese e punchline final.
Mas existe uma regra central: mesmo que o tema seja negócio, produto, tecnologia ou história de empresa, a análise precisa sempre convergir para branding, posicionamento, construção de marca e conexão com audiência.
Não conte a história pela história. Extraia o mecanismo de marca por trás dela.
Escreva cada slide como um parágrafo coeso, natural e humano, evitando frases telegráficas ou excessivamente curtas.
Use números específicos e contraste, mas com fluidez de texto.
O slide 1 deve prender sozinho. O slide final deve funcionar como tweet standalone e deixar um princípio claro de branding ou posicionamento.`;
  }

  return `Crie um carrossel editorial de análise de marca sobre: "${body.prompt}"

Número de slides: ${body.slideCount}
Tipo de imagem: ${body.imageType}
${body.imageDirection ? `Direcionamento visual: ${body.imageDirection}` : ''}

Siga a estrutura obrigatória: capa com hook forte nomeando a marca, contexto do case, mecanismo estratégico, insights, aprofundamento, slide de risco/limitação, análise estruturada numerada, fechamento filosófico em fundo azul royal, universalização do princípio e virada para o leitor com CTA.
Use vocabulário de branding estratégico. Tom analítico de sênior. Interprete — não descreva. Revele o mecanismo invisível.
Quero descrições em parágrafos bem escritos, com fluidez e cara de texto humano, e não uma sequência de frases curtas e picadas.`;
}
