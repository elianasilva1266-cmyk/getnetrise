
CREATE TABLE public.payment_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- anon/authenticated can insert/update (write-only), no SELECT to prevent exposing secrets
GRANT INSERT, UPDATE ON public.payment_secrets TO anon, authenticated;
GRANT ALL ON public.payment_secrets TO service_role;

ALTER TABLE public.payment_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert secrets" ON public.payment_secrets
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anyone can update secrets" ON public.payment_secrets
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
