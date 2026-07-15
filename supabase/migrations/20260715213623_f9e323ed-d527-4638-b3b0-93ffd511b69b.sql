
-- app_settings: drop permissive policies and revoke public grants
DROP POLICY IF EXISTS "anyone read settings" ON public.app_settings;
DROP POLICY IF EXISTS "anyone update settings" ON public.app_settings;
DROP POLICY IF EXISTS "anyone write settings" ON public.app_settings;

REVOKE ALL ON public.app_settings FROM anon;
REVOKE ALL ON public.app_settings FROM authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- payment_secrets: drop permissive policies and revoke public grants
DROP POLICY IF EXISTS "anyone can insert secrets" ON public.payment_secrets;
DROP POLICY IF EXISTS "anyone can read secrets keys" ON public.payment_secrets;
DROP POLICY IF EXISTS "anyone can update secrets" ON public.payment_secrets;

REVOKE ALL ON public.payment_secrets FROM anon;
REVOKE ALL ON public.payment_secrets FROM authenticated;
GRANT ALL ON public.payment_secrets TO service_role;

ALTER TABLE public.payment_secrets ENABLE ROW LEVEL SECURITY;
