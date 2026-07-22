// Webhook público para receber notificações de pagamento das gateways.
// GET  -> devolve apenas "OLA ENTRE EM CONTATO COM ADMINISTRADOR" (não revela o site).
// POST -> registra pedido como pago quando o payload indica sucesso.
//
// URL: <FUNCTIONS_URL>/payment-webhook?provider=<podpay|risepay|masterfy|expfy|zuckpay>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_PROVIDERS = new Set([
  "podpay",
  "risepay",
  "masterfy",
  "expfy",
  "zuckpay",
  "veopag",
  "caospay",
]);

const BLANK_HTML = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>—</title>
<style>
  html,body{margin:0;height:100%;background:#fff;color:#111;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
  p{font-size:16px;letter-spacing:.02em}
</style></head>
<body><div class="wrap"><p>OLA ENTRE EN CONTATO COM ADMINISTRADOR</p></div></body></html>`;

const okHtml = () =>
  new Response(BLANK_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });

// Extrai (status, external_id, amount, document) de payloads heterogêneos.
// Cada gateway tem formato próprio; fazemos best-effort para todos.
const pickPaid = (raw: string): boolean => {
  const s = raw.toUpperCase();
  return (
    s === "PAID" ||
    s === "APPROVED" ||
    s === "COMPLETED" ||
    s === "CONFIRMED" ||
    s === "SUCCESS" ||
    s === "AUTHORIZED"
  );
};

interface Extracted {
  paid: boolean;
  external_id: string | null;
  amountCents: number | null;
  document: string | null;
}

const toCents = (v: unknown): number | null => {
  if (typeof v === "number" && isFinite(v)) {
    // Se vier em reais (com decimais) converte; se inteiro grande, assume centavos.
    if (!Number.isInteger(v)) return Math.round(v * 100);
    if (v < 1000) return Math.round(v * 100); // provável reais
    return v; // provável centavos
  }
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    if (!isFinite(n)) return null;
    return toCents(n);
  }
  return null;
};

const extract = (provider: string, payload: any): Extracted => {
  const p = payload ?? {};
  // Campos comuns tentados em ordem
  const statusRaw = String(
    p.status ??
      p.event ??
      p.type ??
      p.transaction?.status ??
      p.data?.status ??
      p.payment?.status ??
      "",
  );
  const paid = pickPaid(statusRaw);

  const external_id =
    p.transactionId ??
    p.transaction_id ??
    p.id ??
    p.identifier ??
    p.paymentId ??
    p.payment_id ??
    p.transaction?.id ??
    p.data?.id ??
    p.data?.transactionId ??
    p.payment?.id ??
    null;

  const amountRaw =
    p.amount ??
    p.value ??
    p.valor ??
    p.total ??
    p.transaction?.amount ??
    p.data?.amount ??
    p.payment?.amount ??
    null;
  const amountCents = toCents(amountRaw);

  const document =
    p.customer?.document ??
    p.customer?.cpf ??
    p.customer?.taxId ??
    p.cpf ??
    p.document ??
    p.data?.customer?.document ??
    null;

  return {
    paid,
    external_id: external_id ? String(external_id) : null,
    amountCents,
    document: document ? String(document).replace(/\D/g, "") : null,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Qualquer navegação humana / verificação -> página em branco.
  if (req.method === "GET" || req.method === "HEAD") return okHtml();

  if (req.method !== "POST") return okHtml();

  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") || "").toLowerCase();
  if (!ALLOWED_PROVIDERS.has(provider)) {
    // Não vazamos informação
    return okHtml();
  }

  // Validação de secret: se estiver configurado no banco, exige match.
  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const secretKeyName = `webhook_secret_${provider}`;
    const sr = await fetch(
      `${supaUrl}/rest/v1/payment_secrets?key=eq.${secretKeyName}&select=value`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const rows = await sr.json().catch(() => []);
    const configured = Array.isArray(rows) && rows[0]?.value ? String(rows[0].value) : "";
    if (configured) {
      const provided =
        url.searchParams.get("secret") ||
        req.headers.get("x-webhook-signature") ||
        req.headers.get("x-webhook-secret") ||
        "";
      const a = provided;
      const b = configured;
      let mismatch = a.length !== b.length ? 1 : 0;
      for (let i = 0; i < a.length && i < b.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
      if (mismatch !== 0) {
        console.warn("webhook rejected: invalid secret", provider);
        return okHtml();
      }
    }
  } catch (e) {
    console.error("webhook secret check failed", e);
    return okHtml();
  }

  let payload: any = null;
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  const info = extract(provider, payload);
  console.log("payment-webhook", provider, {
    paid: info.paid,
    id: info.external_id,
    cents: info.amountCents,
  });

  // Sempre respondemos 200 para as gateways não reprocessarem indefinidamente.
  if (!info.paid || !info.external_id || !info.amountCents) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resp = await fetch(`${supaUrl}/rest/v1/orders?on_conflict=provider,external_id`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({
        provider,
        external_id: info.external_id,
        amount_cents: info.amountCents,
        status: "approved",
        customer_document: info.document,
      }),
    });
    if (!resp.ok && resp.status !== 409) {
      const t = await resp.text();
      console.error("webhook insert failed", resp.status, t);
    }
  } catch (e) {
    console.error("webhook error", e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
