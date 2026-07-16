import { NextRequest, NextResponse } from 'next/server';
import { openai, buildImagePrompt } from '@/lib/openai';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireCredits, refundCredits } from '@/lib/subscription';
import { CREDIT_COSTS } from '@/lib/credits';

export const maxDuration = 120;

interface GenerateImageBody {
  slideId: string;
  title: string;
  description?: string;
  isCover?: boolean;
  isFinal?: boolean;
  quality?: 'low' | 'medium' | 'high' | 'auto';
}

export async function POST(req: NextRequest) {
  let body: GenerateImageBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { slideId, title, description, isCover, isFinal, quality = 'medium' } = body;
  if (!slideId || !title) {
    return NextResponse.json({ error: 'slideId e title são obrigatórios' }, { status: 400 });
  }

  const charged = CREDIT_COSTS.image;
  const guard = await requireCredits(charged);
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  const supabase = await createServerSupabaseClient();

  const prompt = buildImagePrompt({ title, description, isCover, isFinal });

  let b64: string | undefined;

  try {
    const response = await openai.images.generate({
      model: 'gpt-image-2',
      prompt,
      size: '1024x1536',
      quality,
      n: 1,
    });
    b64 = response.data?.[0]?.b64_json;
  } catch (err) {
    await refundCredits(userId, charged);
    const message = err instanceof Error ? err.message : 'Falha desconhecida';
    const lower = message.toLowerCase();

    if (lower.includes('verify') || lower.includes('verification') || lower.includes('must be verified')) {
      return NextResponse.json({
        error: 'Sua organização OpenAI ainda não foi verificada para usar gpt-image-2. Verifique em platform.openai.com/settings/organization/general',
      }, { status: 403 });
    }
    if (lower.includes('billing') || lower.includes('insufficient')) {
      return NextResponse.json({ error: 'Sem créditos / billing na conta OpenAI' }, { status: 402 });
    }
    // Limite de imagens/min da OpenAI — a mensagem já vem como "429 Rate
    // limit reached... Please try again in Ns.", propagamos o status 429
    // pra o cliente poder re-tentar automaticamente após esse tempo.
    if (lower.includes('rate limit') || lower.includes('429')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    if (lower.includes('quota')) {
      return NextResponse.json({ error: 'Sem créditos / billing na conta OpenAI' }, { status: 402 });
    }

    console.error('[generate-image] error', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!b64) {
    await refundCredits(userId, charged);
    return NextResponse.json({ error: 'OpenAI não retornou imagem' }, { status: 502 });
  }

  const buffer = Buffer.from(b64, 'base64');
  const path = `${userId}/carousel-images/${slideId}-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('postflow-assets')
    .upload(path, buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'image/png',
    });

  if (uploadError) {
    await refundCredits(userId, charged);
    const raw = uploadError.message || '';
    if (/bucket.*not.*found/i.test(raw)) {
      return NextResponse.json({
        error: 'Bucket "postflow-assets" não encontrado. Crie no Supabase ou rode o SQL do schema.',
      }, { status: 500 });
    }
    console.error('[generate-image] Supabase upload error', uploadError);
    return NextResponse.json({ error: `Falha no upload: ${raw}` }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from('postflow-assets').getPublicUrl(path);
  const url = publicData?.publicUrl;
  if (!url) {
    await refundCredits(userId, charged);
    return NextResponse.json({ error: 'Não foi possível obter URL pública' }, { status: 500 });
  }

  return NextResponse.json({ url, prompt });
}
