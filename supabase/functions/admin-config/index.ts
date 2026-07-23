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

// ---------- Rate limit / brute-force lockout (in-memory) ----------
type Attempt = { count: number; until: number };
const attempts = new Map<string, Attempt>();
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60_000; // 10 min
const WINDOW_MS = 10 * 60_000;

const clientKey = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("cf-connecting-ip") ||
  "unknown";

const isLocked = (k: string) => {
  const a = attempts.get(k);
  if (!a) return false;
  if (Date.now() > a.until) {
    attempts.delete(k);
    return false;
  }
  return a.count >= MAX_FAILS;
};

const registerFail = (k: string) => {
  const a = attempts.get(k);
  const now = Date.now();
  if (!a || now > a.until) {
    attempts.set(k, { count: 1, until: now + WINDOW_MS });
  } else {
    a.count += 1;
    a.until = now + LOCK_MS;
  }
};

const clearFails = (k: string) => attempts.delete(k);

// ---------- Allowed keys ----------
const ALLOWED_SETTING_KEYS = new Set(["payment_enabled", "payment_provider"]);
const ALLOWED_PROVIDERS = [
  "risepay",
  "zuckpay",
  "pix_static",
  "masterfy",
  "expfy",
  "podpay",
  "veopag",
  "caospay",
] as const;
const WEBHOOK_PROVIDERS = ["podpay", "risepay", "masterfy", "expfy", "zuckpay", "veopag", "caospay"] as const;
const ALLOWED_PROVIDERS_SET = new Set<string>(ALLOWED_PROVIDERS);
const ALLOWED_SECRET_KEYS = new Set<string>([
  "pix_static_key",
  "risepay_token",
  "zuckpay_client_id",
  "zuckpay_client_secret",
  "masterfy_api_key",
  "expfy_public_key",
  "expfy_secret_key",
  "podpay_api_key",
  "veopag_client_id",
  "veopag_client_secret",
  "caospay_api_key",
  ...WEBHOOK_PROVIDERS.map((p) => `webhook_secret_${p}`),
]);

const BodySchema = z.object({
  action: z.enum([
    "verify",
    "get_dashboard",
    "set_setting",
    "set_secret",
    "rotate_webhook_secret",
    "test_gateway",
    "withdraw",
  ]),
  key: z.string().max(64).optional(),
  value: z.string().max(4096).optional(),
  provider: z.string().max(32).optional(),
  pix_key: z.string().max(140).optional(),
  pix_key_type: z.enum(["cpf", "cnpj", "email", "phone", "random"]).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
});

const randomHex = (bytes = 32) => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminPassword = Deno.env.get("ADMIN_PANEL_PASSWORD") || "";
  if (!adminPassword) {
    return json({ success: false, message: "Painel admin não configurado no servidor." }, 500);
  }
  if (adminPassword.length < 8) {
    return json({ success: false, message: "Senha admin muito curta no servidor (mín. 8)." }, 500);
  }

  const ip = clientKey(req);
  if (isLocked(ip)) {
    return json(
      { success: false, message: "Muitas tentativas. Tente novamente em alguns minutos." },
      429,
    );
  }

  const provided = req.headers.get("x-admin-password") || "";
  if (!provided || !safeEqual(provided, adminPassword)) {
    registerFail(ip);
    return json({ success: false, message: "Senha admin inválida." }, 401);
  }
  clearFails(ip);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ success: false, message: "Payload inválido." }, 400);

  const { action, key, value, provider, pix_key, pix_key_type, amount } = parsed.data;
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const readHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const writeHeaders = {
    ...readHeaders,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  };

  try {
    if (action === "verify") return json({ success: true });

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

      const secrets: Record<string, { configured: boolean; updated_at: string | null; value?: string }> = {};
      for (const k of ALLOWED_SECRET_KEYS) secrets[k] = { configured: false, updated_at: null };
      for (const r of Array.isArray(secretsRows) ? secretsRows : []) {
        if (!ALLOWED_SECRET_KEYS.has(r.key)) continue;
        secrets[r.key] = {
          configured: !!r.value,
          updated_at: r.updated_at,
          // Only reveal pix_static_key value (it's public by design)
          ...(r.key === "pix_static_key" ? { value: r.value } : {}),
        };
      }

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
          recent_orders: ordersRows.slice(0, 25),
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

    if (action === "rotate_webhook_secret") {
      const p = (provider || "").toLowerCase();
      if (!WEBHOOK_PROVIDERS.includes(p as any)) {
        return json({ success: false, message: "Gateway inválida" }, 400);
      }
      const secret = randomHex(32);
      const k = `webhook_secret_${p}`;
      const resp = await fetch(`${supaUrl}/rest/v1/payment_secrets?on_conflict=key`, {
        method: "POST",
        headers: writeHeaders,
        body: JSON.stringify({ key: k, value: secret, updated_at: new Date().toISOString() }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return json({ success: false, message: `Falha ao gerar (${resp.status}): ${t}` }, 500);
      }
      const base = `${supaUrl}/functions/v1/payment-webhook`;
      return json({
        success: true,
        secret,
        webhook_url: `${base}?provider=${p}&secret=${secret}`,
      });
    }

    if (action === "test_gateway") {
      const p = (provider || "").toLowerCase();
      if (!ALLOWED_PROVIDERS_SET.has(p)) {
        return json({ success: false, message: "Gateway inválida" }, 400);
      }
      if (p === "pix_static") {
        const r = await fetch(
          `${supaUrl}/rest/v1/payment_secrets?key=eq.pix_static_key&select=value`,
          { headers: readHeaders },
        );
        const rows = await r.json().catch(() => []);
        const v = Array.isArray(rows) && rows[0]?.value ? rows[0].value : null;
        if (!v) return json({ success: false, message: "Chave PIX estática não configurada" });
        return json({ success: true, message: "Chave PIX estática configurada.", detail: v });
      }

      const fnMap: Record<string, string> = {
        podpay: "create-podpay-payment",
        risepay: "create-pix-payment",
        masterfy: "create-masterfy-payment",
        expfy: "create-expfy-payment",
        zuckpay: "create-zuckpay-payment",
        veopag: "create-veopag-payment",
        caospay: "create-caospay-payment",
      };
      const fn = fnMap[p];
      const testId = `TEST-${Date.now()}`;
      const payload = {
        amount: 5,
        description: "TESTE DE SINCRONIZAÇÃO",
        identifier: testId,
        customer: { name: "TESTE ADMIN", cpf: "19257915727", email: "teste@teste.com", phone: "11999999999" },
      };
      const start = Date.now();
      const r = await fetch(`${supaUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const took = Date.now() - start;
      const bodyText = await r.text();
      let body: any = null;
      try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText.slice(0, 500) }; }
      const ok = r.ok && body?.success !== false;
      return json({
        success: ok,
        message: ok ? `Gateway respondeu em ${took}ms` : (body?.message || `Falha (${r.status})`),
        detail: body?.pixCode || body?.pixKey || body?.identifier || body?.transactionId || null,
        took_ms: took,
      });
    }

    if (action === "withdraw") {
      const p = (provider || "").toLowerCase();
      if (!ALLOWED_PROVIDERS_SET.has(p)) {
        return json({ success: false, message: "Gateway inválida" }, 400);
      }
      if (!pix_key || !pix_key_type || !amount) {
        return json({ success: false, message: "Chave PIX, tipo e valor são obrigatórios" }, 400);
      }
      if (amount < 1) return json({ success: false, message: "Valor mínimo: R$ 1,00" }, 400);

      // Fetch provider api key from payment_secrets
      const secretKeyMap: Record<string, string> = {
        caospay: "caospay_api_key",
        risepay: "risepay_token",
        masterfy: "masterfy_api_key",
        podpay: "podpay_api_key",
      };
      const skey = secretKeyMap[p];
      let apiKey = "";
      if (skey) {
        const r = await fetch(
          `${supaUrl}/rest/v1/payment_secrets?key=eq.${skey}&select=value`,
          { headers: readHeaders },
        );
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.value) apiKey = String(rows[0].value).trim();
      }

      if (p === "caospay") {
        if (!apiKey) return json({ success: false, message: "Token CaosPay não configurado" }, 400);
        const token = apiKey.replace(/^Bearer\s+/i, "").trim();
        const typeMap: Record<string, string> = {
          cpf: "CPF",
          cnpj: "CNPJ",
          email: "EMAIL",
          phone: "PHONE",
          random: "RANDOM",
        };
        const resp = await fetch("https://caospayment.shop/api/pay/withdraw", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            value: Number(amount),
            pixKey: pix_key,
            pixKeyType: typeMap[pix_key_type],
          }),
        });
        const dataRaw = await resp.text();
        let dataParsed: any = null;
        try { dataParsed = JSON.parse(dataRaw); } catch { dataParsed = { raw: dataRaw.slice(0, 300) }; }
        if (!resp.ok || dataParsed?.success === false) {
          return json({
            success: false,
            message: dataParsed?.message || dataParsed?.error || `Falha CaosPay (${resp.status})`,
          });
        }
        return json({
          success: true,
          message: "Saque solicitado com sucesso. Aguarde processamento.",
          detail: dataParsed?.transactionId || dataParsed?.id || null,
        });
      }

      // Other gateways: no public payout API
      return json({
        success: false,
        message:
          `A gateway ${p.toUpperCase()} não expõe API pública de saque. Faça o saque diretamente no painel oficial da gateway.`,
      });
    }

    return json({ success: false, message: "Ação desconhecida" }, 400);
  } catch (err) {
    console.error("admin-config error", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
