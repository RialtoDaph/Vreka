-- Vreka is a personal, single-user app with no plan to onboard anyone else.
-- app/login/page.tsx's signup form has no server-side gate of its own (it's
-- a direct client call into Supabase Auth), so a database-level trigger is
-- the only enforcement point that can't be bypassed by calling the Supabase
-- REST API directly instead of going through the app's UI.
create or replace function public.enforce_single_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from 'altodaphino@gmail.com' then
    raise exception 'Signup nggak diizinin -- Vreka cuma buat satu akun.';
  end if;
  return new;
end;
$$;

create trigger enforce_single_user_signup_trigger
before insert on auth.users
for each row execute function public.enforce_single_user_signup();

-- SECURITY DEFINER functions in the public schema are exposed as RPC
-- endpoints by default (/rest/v1/rpc/enforce_single_user_signup) -- this
-- one is only meant to run as the trigger above, not be callable directly.
revoke execute on function public.enforce_single_user_signup() from public, anon, authenticated;
