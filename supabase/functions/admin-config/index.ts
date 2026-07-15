import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};

const ALLOWED_SETTING_KEYS = new Set(["payment_enabled", "payment_provider"]);
const ALLOWED_PROVIDERS = [
  "risepay",
  "zuckpay",
  "pix_static",
  "masterfy",
  "expfy",
  "podpay",
] as const;
const ALLOWED_PROVIDERS_SET = new Set<string>(ALLOWED_PROVIDERS);
const ALLOWED_SECRET_KEYS = new Set([
  "pix_static_key",
  "risepay_token",
  "zuckpay_client_id",
  "zuckpay_client_secret",
  "masterfy_api_key",
  "expfy_public_key",
  "expfy_secret_key",
  "podpay_api_key",
]);

const BodySchema = z.object({
  action: z.enum(["verify", "get_dashboard", "set_setting", "set_secret"]),
  key: z.string().max(64).optional(),
  value: z.string().max(4096).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminPassword = Deno.env.get("ADMIN_PANEL_PASSWORD") || "";
  if (!adminPassword) {
    return json({ success: false, message: "Painel admin não configurado no servidor." }, 500);
  }

  const provided = req.headers.get("x-admin-password") || "";
  if (!provided || !safeEqual(provided, adminPassword)) {
    return json({ success: false, message: "Senha admin inválida." }, 401);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ success: false, message: "Payload inválido." }, 400);

  const { action, key, value } = parsed.data;
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const readHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const writeHeaders = {
    ...readHeaders,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  };

  try {
    if (action === "verify") {
      return json({ success: true });
    }

    if (action === "get_dashboard") {
      const [settingsResp, secretsResp, ordersResp] = await Promise.all([
        fetch(`${supaUrl}/rest/v1/app_settings?select=key,value,updated_at`, { headers: readHeaders }),
        fetch(`${supaUrl}/rest/v1/payment_secrets?select=key,value,updated_at`, { headers: readHeaders }),
        fetch(
          `${supaUrl}/rest/v1/orders?select=provider,amount_cents,external_id,customer_document,created_at&status=eq.approved&order=created_at.desc`,
          { headers: readHeaders },
        ),
      ]);

      const settingsRows = (await settingsResp.json().catch(() => [])) as Array<{ key: string; value: string; updated_at: string }>;
      const secretsRows = (await secretsResp.json().catch(() => [])) as Array<{ key: string; value: string; updated_at: string }>;
      const ordersRows = (await ordersResp.json().catch(() => [])) as Array<{
        provider: string;
        amount_cents: number;
        external_id: string;
        customer_document: string | null;
        created_at: string;
      }>;

      const settings: Record<string, { value: string; updated_at: string }> = {};
      for (const r of Array.isArray(settingsRows) ? settingsRows : []) {
        settings[r.key] = { value: r.value, updated_at: r.updated_at };
      }

      // Secrets: return booleans for configured status; only return pix_static_key value
      const secrets: Record<string, { configured: boolean; updated_at: string | null; value?: string }> = {};
      for (const k of ALLOWED_SECRET_KEYS) secrets[k] = { configured: false, updated_at: null };
      for (const r of Array.isArray(secretsRows) ? secretsRows : []) {
        if (!ALLOWED_SECRET_KEYS.has(r.key)) continue;
        secrets[r.key] = {
          configured: !!r.value,
          updated_at: r.updated_at,
          ...(r.key === "pix_static_key" ? { value: r.value } : {}),
        };
      }

      // Revenue aggregation
      const revenueByProvider: Record<string, { total_cents: number; count: number }> = {};
      for (const p of ALLOWED_PROVIDERS) revenueByProvider[p] = { total_cents: 0, count: 0 };
      let grandTotal = 0;
      for (const o of Array.isArray(ordersRows) ? ordersRows : []) {
        const p = ALLOWED_PROVIDERS_SET.has(o.provider) ? o.provider : "other";
        if (!revenueByProvider[p]) revenueByProvider[p] = { total_cents: 0, count: 0 };
        revenueByProvider[p].total_cents += Number(o.amount_cents) || 0;
        revenueByProvider[p].count += 1;
        grandTotal += Number(o.amount_cents) || 0;
      }

      const recentOrders = ordersRows.slice(0, 25);

      return json({
        success: true,
        data: {
          settings,
          secrets,
          revenue: {
            by_provider: revenueByProvider,
            total_cents: grandTotal,
            count: ordersRows.length,
          },
          recent_orders: recentOrders,
        },
      });
    }

    if (action === "set_setting") {
      if (!key || value === undefined) return json({ success: false, message: "key/value obrigatórios" }, 400);
      if (!ALLOWED_SETTING_KEYS.has(key)) return json({ success: false, message: "Chave não permitida" }, 400);
      if (key === "payment_enabled" && value !== "0" && value !== "1") {
        return json({ success: false, message: "payment_enabled deve ser '0' ou '1'" }, 400);
      }
      if (key === "payment_provider" && !ALLOWED_PROVIDERS_SET.has(value)) {
        return json({ success: false, message: "Provedor inválido" }, 400);
      }
      const resp = await fetch(`${supaUrl}/rest/v1/app_settings?on_conflict=key`, {
        method: "POST",
        headers: writeHeaders,
        body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return json({ success: false, message: `Falha ao salvar (${resp.status}): ${t}` }, 500);
      }
      return json({ success: true });
    }

    if (action === "set_secret") {
      if (!key || !value) return json({ success: false, message: "key/value obrigatórios" }, 400);
      if (!ALLOWED_SECRET_KEYS.has(key)) return json({ success: false, message: "Chave não permitida" }, 400);
      const trimmed = value.trim();
      if (!trimmed) return json({ success: false, message: "Valor vazio" }, 400);
      const resp = await fetch(`${supaUrl}/rest/v1/payment_secrets?on_conflict=key`, {
        method: "POST",
        headers: writeHeaders,
        body: JSON.stringify({ key, value: trimmed, updated_at: new Date().toISOString() }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return json({ success: false, message: `Falha ao salvar (${resp.status}): ${t}` }, 500);
      }
      return json({ success: true });
    }

    return json({ success: false, message: "Ação desconhecida" }, 400);
  } catch (err) {
    console.error("admin-config error", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
