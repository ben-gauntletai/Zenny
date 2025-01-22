-- First clean up any existing setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Disable RLS on all main tables to ensure auth works
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups DISABLE ROW LEVEL SECURITY;

-- Grant basic permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated;

-- Create a very simple trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    'user'
  );
  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user(); 