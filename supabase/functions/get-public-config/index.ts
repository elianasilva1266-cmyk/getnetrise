import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PIX_STATIC_KEY = "6b81c3ec-916f-4974-9ea4-3c2d12edc555";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    const [settingsResp, secretResp] = await Promise.all([
      fetch(
        `${supaUrl}/rest/v1/app_settings?key=in.(payment_enabled,payment_provider)&select=key,value`,
        { headers },
      ),
      fetch(
        `${supaUrl}/rest/v1/payment_secrets?key=eq.pix_static_key&select=key,value`,
        { headers },
      ),
    ]);

    const settingsRows = (await settingsResp.json().catch(() => [])) as Array<{ key: string; value: string }>;
    const secretRows = (await secretResp.json().catch(() => [])) as Array<{ key: string; value: string }>;

    let paymentEnabled = true;
    let paymentProvider = "risepay";
    for (const row of Array.isArray(settingsRows) ? settingsRows : []) {
      if (row.key === "payment_enabled") paymentEnabled = row.value !== "0";
      if (row.key === "payment_provider") paymentProvider = row.value;
    }

    const pixStaticKey =
      Array.isArray(secretRows) && secretRows[0]?.value ? secretRows[0].value : DEFAULT_PIX_STATIC_KEY;

    return new Response(
      JSON.stringify({
        payment_enabled: paymentEnabled,
        payment_provider: paymentProvider,
        pix_static_key: pixStaticKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("get-public-config error", err);
    return new Response(
      JSON.stringify({ error: "Falha ao carregar configuração" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
