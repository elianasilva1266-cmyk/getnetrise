
-- Garantir grants e políticas amplas para upsert via PostgREST (painel sem auth)
GRANT SELECT, INSERT, UPDATE ON public.payment_secrets TO anon, authenticated;
GRANT ALL ON public.payment_secrets TO service_role;

-- Remover policies antigas que podem estar bloqueando
DROP POLICY IF EXISTS "anyone can insert secrets" ON public.payment_secrets;
DROP POLICY IF EXISTS "anyone can update secrets" ON public.payment_secrets;
DROP POLICY IF EXISTS "anyone can upsert secrets" ON public.payment_secrets;
DROP POLICY IF EXISTS "anyone can read secrets keys" ON public.payment_secrets;

-- Recriar abertas (painel oculto, sem auth)
CREATE POLICY "anyone can insert secrets" ON public.payment_secrets
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anyone can update secrets" ON public.payment_secrets
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Necessário para upsert com onConflict (PostgREST faz RETURNING)
CREATE POLICY "anyone can read secrets keys" ON public.payment_secrets
  FOR SELECT TO anon, authenticated USING (true);
