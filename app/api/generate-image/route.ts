import { NextRequest, NextResponse } from 'next/server';
import { openai, buildImagePrompt } from '@/lib/openai';
import { generateGeminiImage } from '@/lib/nanobanana';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireActiveSubscription } from '@/lib/subscription';

export const maxDuration = 120;

export type ImageProvider = 'openai' | 'gemini';

interface GenerateImageBody {
  slideId: string;
  imagePrompt?: string;
  title: string;
  description?: string;
  isCover?: boolean;
  isFinal?: boolean;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  provider?: ImageProvider;
}

export async function POST(req: NextRequest) {
  let body: GenerateImageBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const {
    slideId, imagePrompt, title, description,
    isCover, isFinal, quality = 'medium', provider = 'openai',
  } = body;
  if (!slideId || !title) {
    return NextResponse.json({ error: 'slideId e title são obrigatórios' }, { status: 400 });
  }

  const guard = await requireActiveSubscription();
  if (!guard.ok) return guard.response;

  const supabase = await createServerSupabaseClient();

  const prompt = buildImagePrompt({ imagePrompt, title, description, isCover, isFinal });

  let b64: string | undefined;
  let mimeType = 'image/png';

  try {
    if (provider === 'gemini') {
      const result = await generateGeminiImage(prompt);
      b64 = result.b64;
      mimeType = result.mimeType;
    } else {
      const response = await openai.images.generate({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1536',
        quality,
        n: 1,
      });
      b64 = response.data?.[0]?.b64_json;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha desconhecida';
    const lower = message.toLowerCase();

    if (provider === 'openai') {
      if (lower.includes('verify') || lower.includes('verification') || lower.includes('must be verified')) {
        return NextResponse.json({
          error: 'Sua organização OpenAI ainda não foi verificada para usar gpt-image-1. Verifique em platform.openai.com/settings/organization/general',
        }, { status: 403 });
      }
      if (lower.includes('billing') || lower.includes('quota') || lower.includes('insufficient')) {
        return NextResponse.json({ error: 'Sem créditos / billing na conta OpenAI' }, { status: 402 });
      }
    } else {
      if (lower.includes('gemini_api_key') || lower.includes('gemini_api_key não')) {
        return NextResponse.json({ error: 'GEMINI_API_KEY não configurada. Adicione no .env.local.' }, { status: 500 });
      }
      if (lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
        return NextResponse.json({ error: 'GEMINI_API_KEY inválida.' }, { status: 401 });
      }
      if (lower.includes('quota')) {
        return NextResponse.json({ error: 'Cota Gemini esgotada.' }, { status: 429 });
      }
    }

    console.error(`[generate-image] ${provider} error`, err);
    return NextResponse.json({ error: `${provider}: ${message}` }, { status: 500 });
  }

  if (!b64) {
    return NextResponse.json({ error: `${provider} não retornou imagem` }, { status: 502 });
  }

  const buffer = Buffer.from(b64, 'base64');
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `${guard.userId}/carousel-images/${slideId}-${provider}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('postflow-assets')
    .upload(path, buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType,
    });

  if (uploadError) {
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
    return NextResponse.json({ error: 'Não foi possível obter URL pública' }, { status: 500 });
  }

  return NextResponse.json({ url, prompt, provider });
}
