-- ============================================================
-- ETAPA 3 — Reels
-- Bucket dedicado de VÍDEO + tabela de metadados, ambos com RLS por usuário.
-- Isolado do schema.sql principal (nada de tabela protegida é tocado).
-- Safe to run more than once.
-- ============================================================

-- Tabela de metadados do Reel (um por linha, por usuário).
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '',
  handle text not null default '',
  caption text not null default '',
  avatar_url text not null default '',
  verified boolean not null default true,
  -- Formato do card. O template de Reels é FIXO em 9:16 (Stories); a coluna
  -- fica default '9:16'. O check ainda aceita os três por compatibilidade.
  format text not null default '9:16',
  muted boolean not null default false,
  -- Deslocamento vertical do bloco [header+vídeo] no card 9:16 (px no espaço
  -- 1080; + desce / − sobe). 0 = centrado. O app clampa ao espaço preto livre.
  content_offset_y integer not null default 0,
  -- Vídeo no Storage: guardamos o CAMINHO (não a URL assinada, que expira).
  video_path text not null default '',
  video_mime text not null default '',
  video_width integer,
  video_height integer,
  video_duration_sec real,
  video_size_bytes bigint,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reels_format_check check (format in ('4:5', '1:1', '9:16')),
  constraint reels_status_check check (status in ('draft', 'ready', 'published', 'archived')),
  constraint reels_video_path_owner_check
    check (video_path = '' or split_part(video_path, '/', 1) = user_id::text)
);

-- Idempotente: a tabela pode já existir (o create-if-not-exists acima não a
-- altera), então garantimos a coluna nova para instalações anteriores.
alter table public.reels add column if not exists content_offset_y integer not null default 0;

-- IDOR (achado #2 da Security): video_path é escrito pelo cliente. Sem amarra, uma
-- linha podia guardar o caminho do vídeo de OUTRO usuário. A primeira pasta do
-- caminho tem de ser o dono da linha — o mesmo invariante que as policies de
-- storage.objects lá embaixo já exigem para ler/gravar no bucket, e o formato que
-- app/api/reels/upload-url monta no servidor (`<user.id>/reels/<uuid>.<ext>`).
-- Comparamos com a coluna user_id, não com auth.uid(): CHECK constraint não pode
-- chamar função de sessão. É equivalente porque a policy reels_owner já força
-- user_id = auth.uid() no with check.
-- Idempotente via DO block: CHECK não aceita `add constraint if not exists`.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reels'::regclass
      and conname = 'reels_video_path_owner_check'
  ) then
    alter table public.reels
      add constraint reels_video_path_owner_check
      check (video_path = '' or split_part(video_path, '/', 1) = user_id::text);
  end if;
end $$;

create index if not exists idx_reels_user_updated on public.reels (user_id, updated_at desc);

drop trigger if exists set_reels_updated on public.reels;
create trigger set_reels_updated before update on public.reels
  for each row execute function public.set_updated_at();

alter table public.reels enable row level security;

drop policy if exists reels_owner on public.reels;
create policy reels_owner on public.reels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Storage: bucket dedicado de vídeo ─────────────────────────────────────────
-- Privado (public = false): o vídeo do usuário só é lido via signed URL. Aceita
-- apenas MP4 e WebM; teto de 100MB (bate com MAX_VIDEO_BYTES em lib/reels-media).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'postflow-reels',
  'postflow-reels',
  false,
  104857600,
  array['video/mp4', 'video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- RLS por usuário: a PRIMEIRA pasta do caminho tem de ser o uid de quem acessa
-- (o caminho é derivado do user.id no servidor — ver app/api/reels/upload-url).
drop policy if exists postflow_reels_read on storage.objects;
create policy postflow_reels_read on storage.objects
  for select using (
    bucket_id = 'postflow-reels'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists postflow_reels_insert on storage.objects;
create policy postflow_reels_insert on storage.objects
  for insert with check (
    bucket_id = 'postflow-reels'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists postflow_reels_update on storage.objects;
create policy postflow_reels_update on storage.objects
  for update using (
    bucket_id = 'postflow-reels'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'postflow-reels'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists postflow_reels_delete on storage.objects;
create policy postflow_reels_delete on storage.objects
  for delete using (
    bucket_id = 'postflow-reels'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
