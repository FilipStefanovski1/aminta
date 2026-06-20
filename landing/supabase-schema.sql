-- Run this in the Supabase SQL Editor

create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  wallet_address text,
  plan text not null default 'free',
  paid_via text,
  subscription_status text,
  creem_customer_id text,
  creem_subscription_id text,
  created_at timestamptz default now()
);

create table public.aminta_state (
  user_id uuid references public.users(id) on delete cascade primary key,
  xp integer default 0,
  generations_total integer default 0,
  earned_hashes text[] default '{}',
  streak integer default 0,
  streak_date text default '',
  mission_date text default '',
  mission_generates integer default 0,
  mission_published integer default 0,
  voice_profile jsonb,
  tweet_dna text[] default '{}',
  display_name text default '',
  bio text default '',
  interests text default '',
  onboarding_done boolean default false,
  updated_at timestamptz default now()
);

-- Row Level Security
alter table public.users enable row level security;
alter table public.aminta_state enable row level security;

create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can read own state" on public.aminta_state
  for select using (auth.uid() = user_id);

create policy "Users can upsert own state" on public.aminta_state
  for all using (auth.uid() = user_id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
