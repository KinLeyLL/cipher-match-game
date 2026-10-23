create table if not exists public.game_settings (
  id integer primary key check (id = 1),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'complete')),
  updated_at timestamptz not null default now()
);

insert into public.game_settings (id, status)
values (1, 'waiting')
on conflict (id) do nothing;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null unique,
  master_image_url text not null,
  team_pin text not null unique,
  member_count integer not null default 0,
  is_completed boolean not null default false,
  is_flex_completed boolean not null default false,
  phase2_question integer not null default 0,
  phase2_score integer not null default 0,
  phase2_complete boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.groups drop column if exists team_code;
alter table public.groups drop column if exists pin_code;
alter table public.groups add column if not exists team_pin text;
alter table public.groups add column if not exists member_count integer;
alter table public.groups add column if not exists is_completed boolean;
alter table public.groups add column if not exists is_flex_completed boolean not null default false;
alter table public.groups add column if not exists phase2_question integer;
alter table public.groups add column if not exists phase2_score integer;
alter table public.groups add column if not exists phase2_complete boolean;
alter table public.groups add column if not exists created_at timestamptz;

do $$
declare
  target_group_id uuid;
  candidate_pin text;
begin
  for target_group_id in select id from public.groups where team_pin is null loop
    loop
      candidate_pin := lpad(floor(random() * 10000)::integer::text, 4, '0');
      exit when not exists (select 1 from public.groups where team_pin = candidate_pin);
    end loop;
    update public.groups set team_pin = candidate_pin where id = target_group_id;
  end loop;
end;
$$;

update public.groups set member_count = 0 where member_count is null;
update public.groups set is_completed = false where is_completed is null;
update public.groups set phase2_question = 0 where phase2_question is null;
update public.groups set phase2_score = 0 where phase2_score is null;
update public.groups set phase2_complete = false where phase2_complete is null;
update public.groups set created_at = now() where created_at is null;
alter table public.groups alter column member_count set default 0;
alter table public.groups alter column member_count set not null;
alter table public.groups alter column is_completed set default false;
alter table public.groups alter column is_completed set not null;
alter table public.groups alter column is_flex_completed set default false;
alter table public.groups alter column is_flex_completed set not null;
alter table public.groups alter column phase2_question set default 0;
alter table public.groups alter column phase2_question set not null;
alter table public.groups alter column phase2_score set default 0;
alter table public.groups alter column phase2_score set not null;
alter table public.groups alter column phase2_complete set default false;
alter table public.groups alter column phase2_complete set not null;
alter table public.groups alter column created_at set default now();
alter table public.groups alter column created_at set not null;

alter table public.groups alter column team_pin set not null;
create unique index if not exists groups_team_pin_key on public.groups (team_pin);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 60),
  access_token_hash text not null,
  group_id uuid references public.groups (id) on delete set null,
  tile_index integer not null default 0 check (tile_index between 0 and 3),
  is_matched boolean not null default false,
  is_captain boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.players add column if not exists access_token_hash text;
update public.players
set access_token_hash = md5(gen_random_uuid()::text)
where access_token_hash is null;
alter table public.players alter column access_token_hash set not null;

alter table public.players add column if not exists tile_index integer;
alter table public.players add column if not exists is_matched boolean;
alter table public.players add column if not exists created_at timestamptz;
update public.players set tile_index = 0 where tile_index is null;
update public.players set is_matched = false where is_matched is null;
update public.players set created_at = now() where created_at is null;
alter table public.players alter column tile_index set default 0;
alter table public.players alter column tile_index set not null;
alter table public.players alter column is_matched set default false;
alter table public.players alter column is_matched set not null;
alter table public.players alter column created_at set default now();
alter table public.players alter column created_at set not null;

alter table public.players add column if not exists is_captain boolean not null default false;
update public.players set is_captain = false where is_captain is null;
alter table public.players alter column is_captain set default false;
alter table public.players alter column is_captain set not null;

create index if not exists players_group_id_idx on public.players (group_id);

create table if not exists public.player_updates (
  player_id uuid primary key references public.players (id) on delete cascade,
  revision bigint not null default 1
);

create table if not exists public.group_updates (
  group_id uuid primary key references public.groups (id) on delete cascade,
  revision bigint not null default 1
);

create table if not exists public.event_hosts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('puzzle-images', 'puzzle-images', true, 307200, array['image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "puzzle photos are public" on storage.objects;
create policy "puzzle photos are public" on storage.objects
  for select to public using (bucket_id = 'puzzle-images');

drop policy if exists "event hosts upload puzzle photos" on storage.objects;
create policy "event hosts upload puzzle photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'puzzle-images'
    and exists (select 1 from public.event_hosts where user_id = auth.uid())
  );

drop policy if exists "event hosts delete puzzle photos" on storage.objects;
create policy "event hosts delete puzzle photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'puzzle-images'
    and exists (select 1 from public.event_hosts where user_id = auth.uid())
  );

create or replace function public.publish_player_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_updates (player_id, revision) values (new.id, 1)
  on conflict (player_id) do update set revision = public.player_updates.revision + 1;
  return new;
end;
$$;

create or replace function public.publish_group_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_updates (group_id, revision) values (new.id, 1)
  on conflict (group_id) do update set revision = public.group_updates.revision + 1;
  return new;
end;
$$;

drop trigger if exists players_publish_update on public.players;
create trigger players_publish_update after insert or update on public.players
  for each row execute function public.publish_player_update();

drop trigger if exists groups_publish_update on public.groups;
create trigger groups_publish_update after insert or update on public.groups
  for each row execute function public.publish_group_update();

alter table public.game_settings enable row level security;
alter table public.groups enable row level security;
alter table public.players enable row level security;
alter table public.event_hosts enable row level security;
alter table public.player_updates enable row level security;
alter table public.group_updates enable row level security;

drop policy if exists "game status is readable" on public.game_settings;
create policy "game status is readable" on public.game_settings
  for select to anon, authenticated using (true);

drop policy if exists "hosts can read groups" on public.groups;
create policy "hosts can read groups" on public.groups
  for select to authenticated using (
    exists (select 1 from public.event_hosts where user_id = auth.uid())
  );

drop policy if exists "hosts can read players" on public.players;
create policy "hosts can read players" on public.players
  for select to authenticated using (
    exists (select 1 from public.event_hosts where user_id = auth.uid())
  );

drop policy if exists "player update signals are readable" on public.player_updates;
create policy "player update signals are readable" on public.player_updates
  for select to anon, authenticated using (true);

drop policy if exists "group update signals are readable" on public.group_updates;
create policy "group update signals are readable" on public.group_updates
  for select to anon, authenticated using (true);

drop policy if exists "hosts can read their own access" on public.event_hosts;
create policy "hosts can read their own access" on public.event_hosts
  for select to authenticated using (user_id = auth.uid());

revoke all on public.game_settings, public.groups, public.players, public.event_hosts,
  public.player_updates, public.group_updates from anon, authenticated;
grant select on public.game_settings, public.player_updates, public.group_updates to anon, authenticated;
grant select on public.groups, public.players to authenticated;
grant select on public.event_hosts to authenticated;

create or replace function public.register_player(p_player_name text, p_access_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_player_id uuid;
begin
  if length(trim(p_player_name)) not between 1 and 60 then
    raise exception 'Enter a name between 1 and 60 characters.';
  end if;
  if length(p_access_token) < 20 then
    raise exception 'A valid player session is required.';
  end if;
  perform 1 from public.game_settings where id = 1 for update;
  if (select status from public.game_settings where id = 1) <> 'waiting' then
    raise exception 'The game has already started. Ask the host for help.';
  end if;
  if (select count(*) from public.players) >= 90 then
    raise exception 'The lobby is full. Ask the host for help.';
  end if;

  insert into public.players (player_name, access_token_hash)
  values (trim(p_player_name), md5(p_access_token))
  returning id into new_player_id;
  return new_player_id;
end;
$$;

create or replace function public.get_player_state(p_player_id uuid, p_access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player_state jsonb;
begin
  select jsonb_build_object(
    'player', jsonb_build_object(
      'id', p.id,
      'player_name', p.player_name,
      'group_id', p.group_id,
      'tile_index', p.tile_index,
      'is_matched', p.is_matched,
      'is_captain', p.is_captain
    ),
    'group', case when g.id is null then null else jsonb_build_object(
      'id', g.id,
      'group_name', g.group_name,
      'master_image_url', g.master_image_url,
      'team_pin', case when p.is_captain then g.team_pin else null end,
      'member_count', g.member_count,
      'is_completed', g.is_completed,
      'is_flex_completed', g.is_flex_completed,
      'phase2_question', g.phase2_question,
      'phase2_score', g.phase2_score,
      'phase2_complete', g.phase2_complete,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', member.id,
          'player_name', member.player_name,
          'tile_index', member.tile_index,
          'is_matched', member.is_matched,
          'is_captain', member.is_captain
        ) order by member.tile_index, member.player_name)
        from public.players member
        where member.group_id = g.id
      ), '[]'::jsonb)
    ) end
  ) into player_state
  from public.players p
  left join public.groups g on g.id = p.group_id
  where p.id = p_player_id and p.access_token_hash = md5(p_access_token);

  if player_state is null then
    raise exception 'Player session expired or invalid.';
  end if;
  return player_state;
end;
$$;

drop function if exists public.check_in_team(uuid, text, text);

create function public.check_in_team(
  p_player_id uuid,
  p_access_token text,
  p_team_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  player_group_id uuid;
begin
  select group_id into player_group_id
  from public.players
  where id = p_player_id and access_token_hash = md5(p_access_token);

  if player_group_id is null then
    raise exception 'Player session expired or team has not been assigned.';
  end if;
  perform 1 from public.groups where id = player_group_id for update;
  if not found then
    raise exception 'Your assigned team could not be found.';
  end if;
  if not exists (
    select 1 from public.groups
    where id = player_group_id and team_pin = trim(p_team_pin)
  ) then
    raise exception 'That PIN does not match your team. Check the four digits and try again.';
  end if;

  update public.players set is_matched = true where id = p_player_id;
  update public.groups g
  set is_completed = not exists (
    select 1 from public.players p where p.group_id = g.id and not p.is_matched
  )
  where g.id = player_group_id;

  return (select is_completed from public.groups where id = player_group_id);
end;
$$;

create or replace function public.flex_complete_team(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  captain_player_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.event_hosts where user_id = auth.uid()
  ) then
    raise exception 'Only a registered event host can flex-complete a team.';
  end if;

  perform 1 from public.groups where id = p_group_id and not is_completed for update;
  if not found then
    raise exception 'This team is already complete or does not exist.';
  end if;

  select id into captain_player_id
  from public.players
  where group_id = p_group_id and is_matched and is_captain;
  if captain_player_id is null then
    select id into captain_player_id
    from public.players
    where group_id = p_group_id and is_matched
    order by tile_index, player_name
    limit 1;
  end if;
  if captain_player_id is null then
    select id into captain_player_id
    from public.players
    where group_id = p_group_id
    order by tile_index, player_name
    limit 1;
  end if;

  update public.players
  set is_matched = true, is_captain = (id = captain_player_id)
  where group_id = p_group_id;
  update public.groups
  set is_completed = true, is_flex_completed = true
  where id = p_group_id;
  return true;
end;
$$;

create or replace function public.start_game(p_image_urls text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  player_ids uuid[];
  image_urls text[];
  player_total integer;
  group_total integer;
  group_size integer;
  player_cursor integer := 1;
  group_number integer;
  member_offset integer;
  current_group_id uuid;
  current_team_pin text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.event_hosts where user_id = auth.uid()
  ) then
    raise exception 'Only a registered event host can start the game.';
  end if;
  perform 1 from public.game_settings where id = 1 for update;
  if (select status from public.game_settings where id = 1) <> 'waiting' then
    raise exception 'The game has already started.';
  end if;

  select array_agg(id order by random()) into player_ids
  from public.players where group_id is null;
  player_total := coalesce(cardinality(player_ids), 0);
  if player_total < 3 then
    raise exception 'At least 3 players are needed to start.';
  end if;
  group_total := greatest(1, round(player_total::numeric / 4)::integer);

  select array_agg(distinct trim(image_url)) into image_urls
  from unnest(coalesce(p_image_urls, array[]::text[])) as urls(image_url)
  where trim(image_url) ~ '^https://';
  if coalesce(cardinality(image_urls), 0) = 0 then
    raise exception 'Add at least one HTTPS photo URL.';
  end if;
  if cardinality(image_urls) < group_total then
    raise exception 'Add at least % unique photo URLs, one for each team.', group_total;
  end if;
  for group_number in 1..group_total loop
    group_size := player_total / group_total
      + case when group_number <= player_total % group_total then 1 else 0 end;
    loop
      current_team_pin := lpad(floor(random() * 10000)::integer::text, 4, '0');
      exit when not exists (select 1 from public.groups where team_pin = current_team_pin);
    end loop;

    insert into public.groups (group_name, master_image_url, team_pin, member_count)
    values (
      'Team ' || lpad(group_number::text, 2, '0'),
      image_urls[group_number],
      current_team_pin,
      group_size
    ) returning id into current_group_id;

    for member_offset in 0..group_size - 1 loop
      update public.players
        set group_id = current_group_id,
          tile_index = member_offset % 4,
          is_captain = member_offset = 0
      where id = player_ids[player_cursor];
      player_cursor := player_cursor + 1;
    end loop;
  end loop;

  update public.game_settings set status = 'active', updated_at = now() where id = 1;
  return group_total;
end;
$$;

create or replace function public.submit_trivia_answer(
  p_player_id uuid,
  p_access_token text,
  p_answer_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player_group_id uuid;
  question_number integer;
  current_score integer;
  is_team_complete boolean;
  trivia_complete boolean;
  correct_answer integer;
  answer_is_correct boolean;
begin
  select group_id into player_group_id
  from public.players
  where id = p_player_id and access_token_hash = md5(p_access_token);
  if player_group_id is null then
    raise exception 'Player session expired or team has not been assigned.';
  end if;
  if not exists (
    select 1 from public.players
    where id = p_player_id and access_token_hash = md5(p_access_token) and is_captain
  ) then
    raise exception 'Only your team captain can submit the shared answer.';
  end if;
  if p_answer_index not between 0 and 2 then
    raise exception 'Choose one of the available answers.';
  end if;

  select phase2_question, phase2_score, is_completed, phase2_complete
  into question_number, current_score, is_team_complete, trivia_complete
  from public.groups where id = player_group_id for update;
  if not is_team_complete then
    raise exception 'Your whole team must check in before starting trivia.';
  end if;
  if trivia_complete or question_number >= 3 then
    raise exception 'Your team has already completed trivia.';
  end if;

  correct_answer := case question_number when 0 then 1 when 1 then 2 else 0 end;
  answer_is_correct := p_answer_index = correct_answer;
  current_score := current_score + case when answer_is_correct then 1 else 0 end;

  update public.groups
  set phase2_question = question_number + 1,
      phase2_score = current_score,
      phase2_complete = question_number + 1 >= 3
  where id = player_group_id;

  if not exists (select 1 from public.groups where not phase2_complete) then
    update public.game_settings set status = 'complete', updated_at = now() where id = 1;
  end if;

  return jsonb_build_object(
    'correct', answer_is_correct,
    'score', current_score,
    'question', question_number + 1,
    'complete', question_number + 1 >= 3
  );
end;
$$;

revoke all on function public.register_player(text, text) from public;
revoke all on function public.get_player_state(uuid, text) from public;
revoke all on function public.check_in_team(uuid, text, text) from public;
revoke all on function public.flex_complete_team(uuid) from public;
revoke all on function public.start_game(text[]) from public;
revoke all on function public.submit_trivia_answer(uuid, text, integer) from public;
grant execute on function public.register_player(text, text) to anon, authenticated;
grant execute on function public.get_player_state(uuid, text) to anon, authenticated;
grant execute on function public.check_in_team(uuid, text, text) to anon, authenticated;
grant execute on function public.flex_complete_team(uuid) to authenticated;
grant execute on function public.start_game(text[]) to authenticated;
grant execute on function public.submit_trivia_answer(uuid, text, integer) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_settings'
  ) then
    alter publication supabase_realtime add table public.game_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_updates'
  ) then
    alter publication supabase_realtime add table public.player_updates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_updates'
  ) then
    alter publication supabase_realtime add table public.group_updates;
  end if;
end;
$$;