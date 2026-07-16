import { createClient } from '@/lib/supabase';

/**
 * Sobe uma imagem de upload do usuário pro Storage e retorna a URL pública.
 *
 * Nunca gravar a imagem como data-URL (base64) no banco: cada foto embutida
 * numa linha vira megabytes baixados em toda listagem — foi isso que deixou
 * o dashboard carregando 21 MB por visita.
 */
export async function uploadImageFile(file: File, folder: string): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Sessão expirada. Faça login novamente.');

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from('postflow-assets')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
  if (error) throw new Error(`Upload falhou: ${error.message}`);

  const { data } = supabase.storage.from('postflow-assets').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Não foi possível obter a URL pública da imagem.');
  return data.publicUrl;
}
