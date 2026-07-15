import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_PROVIDERS = new Set([
  "risepay",
  "zuckpay",
  "pix_static",
  "masterfy",
  "expfy",
  "podpay",
]);

const BodySchema = z.object({
  provider: z.string(),
  external_id: z.string().min(1).max(128),
  amount: z.number().positive().max(1_000_000),
  document: z.string().max(20).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !ALLOWED_PROVIDERS.has(parsed.data.provider)) {
    return new Response(JSON.stringify({ success: false, message: "Payload inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { provider, external_id, amount, document } = parsed.data;
  const amountCents = Math.round(amount * 100);

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
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
        external_id,
        amount_cents: amountCents,
        status: "approved",
        customer_document: document ?? null,
      }),
    });

    if (!resp.ok && resp.status !== 409) {
      const t = await resp.text();
      console.error("record-order failed", resp.status, t);
      return new Response(JSON.stringify({ success: false, message: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("record-order error", err);
    return new Response(JSON.stringify({ success: false, message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
