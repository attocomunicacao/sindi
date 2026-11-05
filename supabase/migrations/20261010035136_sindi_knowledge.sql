create table public.sindi_documents (
  url text primary key, title text not null, content text not null, hash text not null,
  fetched_at timestamptz not null, checked_at timestamptz not null, published_at timestamptz,
  kind text not null check (kind in ('html','pdf')), status text not null check (status in ('active','removed')),
  etag text, last_modified text
);
create table public.sindi_chunks (
  document_url text not null references public.sindi_documents(url) on delete cascade,
  position integer not null, content text not null,
  search_vector tsvector generated always as (to_tsvector('portuguese', translate(content,
    'áàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC'))) stored,
  primary key(document_url,position)
);
create index sindi_chunks_search_idx on public.sindi_chunks using gin(search_vector);
create index sindi_documents_published_idx on public.sindi_documents(published_at desc) where status='active';
create table public.sindi_document_versions (
  document_url text not null references public.sindi_documents(url) on delete cascade,
  hash text not null, content text not null, captured_at timestamptz not null,
  primary key(document_url,hash)
);
create table public.sindi_sync_runs (
  id bigint generated always as identity primary key, recorded_at timestamptz not null default now(), summary jsonb not null
);
alter table public.sindi_documents enable row level security;
alter table public.sindi_chunks enable row level security;
alter table public.sindi_document_versions enable row level security;
alter table public.sindi_sync_runs enable row level security;
revoke all on public.sindi_documents,public.sindi_chunks,public.sindi_document_versions,public.sindi_sync_runs from anon,authenticated;
grant select on public.sindi_documents,public.sindi_chunks to anon,authenticated;
grant all on public.sindi_documents,public.sindi_chunks,public.sindi_document_versions,public.sindi_sync_runs to service_role;
grant usage,select on sequence public.sindi_sync_runs_id_seq to service_role;
create policy public_official_documents on public.sindi_documents for select to anon,authenticated using (status='active');
create policy public_official_chunks on public.sindi_chunks for select to anon,authenticated using (
  exists(select 1 from public.sindi_documents d where d.url=document_url and d.status='active')
);

create function public.upsert_sindi_document(document jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare old_hash text; doc_url text := document->>'url';
begin
  if doc_url !~ '^https://(www\.sindeprestem\.com\.br|docs\.wixstatic\.com|www\.sindeprestem\.org\.br)(/|$)' then
    raise exception 'Source not allowed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(doc_url,0));
  select hash into old_hash from public.sindi_documents where url=doc_url;
  if old_hash is distinct from document->>'hash' then
    insert into public.sindi_document_versions(document_url,hash,content,captured_at)
      select url,hash,content,fetched_at from public.sindi_documents where url=doc_url
      on conflict do nothing;
  end if;
  insert into public.sindi_documents(url,title,content,hash,fetched_at,checked_at,published_at,kind,status,etag,last_modified)
  values(doc_url,document->>'title',document->>'content',document->>'hash',(document->>'fetchedAt')::timestamptz,
    (document->>'checkedAt')::timestamptz,(document->>'publishedAt')::timestamptz,document->>'kind',document->>'status',document->>'etag',document->>'lastModified')
  on conflict(url) do update set title=excluded.title,content=excluded.content,hash=excluded.hash,fetched_at=excluded.fetched_at,
    checked_at=excluded.checked_at,published_at=excluded.published_at,kind=excluded.kind,status=excluded.status,etag=excluded.etag,last_modified=excluded.last_modified;
  if old_hash is distinct from document->>'hash' then
    delete from public.sindi_chunks where document_url=doc_url;
    insert into public.sindi_chunks(document_url,position,content)
      select doc_url,(ordinality-1)::integer,value from jsonb_array_elements_text(document->'chunks') with ordinality;
  end if;
  -- Keep only the two preceding versions; current content remains in sindi_documents.
  delete from public.sindi_document_versions where document_url=doc_url and hash not in
    (select hash from public.sindi_document_versions where document_url=doc_url order by captured_at desc limit 2);
end $$;
revoke all on function public.upsert_sindi_document(jsonb) from public,anon,authenticated;
grant execute on function public.upsert_sindi_document(jsonb) to service_role;

create function public.search_sindi_knowledge(terms text[], result_limit integer default 4, question text default '')
returns table(url text,title text,content text,fetched_at timestamptz,checked_at timestamptz)
language sql stable security invoker set search_path='' as $$
  with query as (
    select to_tsquery('portuguese',coalesce(nullif(string_agg(t,' | '),''),'zzznomatchzzz')) as q,
      lower(question) ~ '(address|location|endereco|localiza|sede|fica|telefone|phone|horario|hours|contato)' as contact,
      lower(question) ~ '(news|latest|recent|noticia|novidade)' as news
    from (select t from unnest(terms) t where t ~ '^[a-z0-9]{3,40}$' limit 20) valid
  ), ranked as (
    select d.url,d.title,c.content,d.fetched_at,d.checked_at,d.published_at,
      ts_rank_cd(c.search_vector,q.q) + case when q.contact and d.url='https://www.sindeprestem.com.br/contato' then 10 else 0 end as rank,
      q.news,c.position
    from public.sindi_chunks c join public.sindi_documents d on d.url=c.document_url cross join query q
    where d.status='active' and (c.search_vector @@ q.q or (q.contact and d.url='https://www.sindeprestem.com.br/contato') or (q.news and d.published_at is not null))
  ), distinct_sources as (
    select *,row_number() over(partition by url order by rank desc,position) as within_document from ranked
  )
  select url,title,content,fetched_at,checked_at from distinct_sources where within_document <= 2
    order by case when news then published_at end desc nulls last,rank desc,position
    limit least(greatest(result_limit,1),6);
$$;
revoke all on function public.search_sindi_knowledge(text[],integer,text) from public;
grant execute on function public.search_sindi_knowledge(text[],integer,text) to anon,authenticated,service_role;
