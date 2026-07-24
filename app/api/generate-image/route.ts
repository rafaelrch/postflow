import { NextRequest, NextResponse } from 'next/server';
import { toFile } from 'openai';
import { openai, buildImagePrompt } from '@/lib/openai';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireCredits, refundCredits } from '@/lib/subscription';
import { CREDIT_COSTS } from '@/lib/credits';
import { downloadReferenceImage } from '@/lib/generate-image-reference';

export const maxDuration = 120;

interface GenerateImageBody {
  slideId: string;
  title: string;
  description?: string;
  isCover?: boolean;
  isFinal?: boolean;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  /** Direção livre digitada no painel de IA. */
  userPrompt?: string;
  /** URL de imagem de referência: dispara images.edit em vez de generate. */
  referenceImageUrl?: string;
}

export async function POST(req: NextRequest) {
  let body: GenerateImageBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { slideId, title, description, isCover, isFinal, quality = 'medium', userPrompt, referenceImageUrl } = body;
  if (!slideId || !title) {
    return NextResponse.json({ error: 'slideId e title são obrigatórios' }, { status: 400 });
  }

  const charged = CREDIT_COSTS.image;
  const guard = await requireCredits(charged);
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const supabase = await createServerSupabaseClient();
    const prompt = buildImagePrompt({ title, description, isCover, isFinal, userPrompt });
    let b64: string | undefined;

    if (referenceImageUrl) {
      // Com imagem de referência: usa o endpoint de edição (image-to-image).
      const reference = await downloadReferenceImage(referenceImageUrl, userId);
      const extension = reference.mime === 'image/jpeg' ? 'jpg' : reference.mime.split('/')[1];
      const refFile = await toFile(reference.buffer, `reference.${extension}`, {
        type: reference.mime,
      });
      const response = await openai.images.edit({
        model: 'gpt-image-2',
        image: refFile,
        prompt,
        size: '1024x1536',
        quality,
        n: 1,
      });
      b64 = response.data?.[0]?.b64_json;
    } else {
      const response = await openai.images.generate({
        model: 'gpt-image-2',
        prompt,
        size: '1024x1536',
        quality,
        n: 1,
      });
      b64 = response.data?.[0]?.b64_json;
    }

    if (!b64) throw new Error('OpenAI não retornou imagem');

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
      const raw = uploadError.message || '';
      if (/bucket.*not.*found/i.test(raw)) {
        throw new Error('Bucket "postflow-assets" não encontrado. Crie no Supabase ou rode o SQL do schema.');
      }
      throw new Error(`Falha no upload: ${raw}`);
    }

    const { data: publicData } = supabase.storage.from('postflow-assets').getPublicUrl(path);
    const url = publicData?.publicUrl;
    if (!url) throw new Error('Não foi possível obter URL pública');

    return NextResponse.json({ url, prompt });
  } catch (err) {
    await refundCredits(userId, charged);
    const message = err instanceof Error ? err.message : 'Falha desconhecida';
    const lower = message.toLowerCase();

    if (lower.includes('verify') || lower.includes('verification') || lower.includes('must be verified')) {
      return NextResponse.json({
        error: 'Sua organização OpenAI ainda não foi verificada para usar gpt-image-2. Verifique em platform.openai.com/settings/organization/general',
      }, { status: 403 });
    }
    if (lower.includes('billing') || lower.includes('insufficient') || lower.includes('quota')) {
      return NextResponse.json({ error: 'Sem créditos / billing na conta OpenAI' }, { status: 402 });
    }
    // Limite de imagens/min da OpenAI — a mensagem já vem como "429 Rate
    // limit reached... Please try again in Ns.", propagamos o status 429.
    if (lower.includes('rate limit') || lower.includes('429')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    console.error('[generate-image] error', err);
    return NextResponse.json(
      { error: message },
      { status: message === 'OpenAI não retornou imagem' ? 502 : 500 }
    );
  }
}
