CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "anyone write settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone update settings" ON public.app_settings FOR UPDATE USING (true) WITH CHECK (true);
INSERT INTO public.app_settings (key, value) VALUES ('payment_provider','risepay'), ('payment_enabled','1') ON CONFLICT DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;