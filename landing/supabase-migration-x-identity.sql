-- X identity cache — avatar/display name, captured once at connect/refresh
-- time so Settings never has to make a live X API call just to render.
ALTER TABLE public.x_connections
  ADD COLUMN IF NOT EXISTS x_display_name text,
  ADD COLUMN IF NOT EXISTS x_avatar_url   text;
