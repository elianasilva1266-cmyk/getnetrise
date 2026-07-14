import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  amount?: number;
  customer?: { name: string; cpf: string; email?: string; phone?: string };
  description?: string;
  checkStatus?: boolean;
  identifier?: string;
}

const EXPFY_BASE = "https://pro.expfypay.com/api/v1";
const FIXED_CPF_FOR_CNPJ = "05091065520";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mapStatus = (raw?: string): string => {
  const s = (raw || "").toLowerCase();
  if (s === "paid" || s === "completed" || s === "confirmed" || s === "approved") return "Paid";
  if (s === "pending" || s === "waiting" || s === "waiting_payment" || s === "received") return "Waiting Payment";
  if (s === "failed" || s === "refused" || s === "cancelled" || s === "canceled") return "Failed";
  if (s === "expired") return "Expired";
  return raw || "unknown";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let publicKey = Deno.env.get("EXPFY_PUBLIC_KEY") || "";
    let secretKey = Deno.env.get("EXPFY_SECRET_KEY") || "";

    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && serviceKey) {
        const r = await fetch(
          `${supaUrl}/rest/v1/payment_secrets?key=in.(expfy_public_key,expfy_secret_key)&select=key,value`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (row.key === "expfy_public_key" && row.value) publicKey = row.value;
            if (row.key === "expfy_secret_key" && row.value) secretKey = row.value;
          }
        }
      }
    } catch (e) {
      console.warn("Falha ao ler payment_secrets:", e);
    }

    if (!publicKey || !secretKey) {
      return json({ success: false, message: "Credenciais EXPFY não configuradas" }, 500);
    }

    const authHeaders = {
      "X-Public-Key": publicKey,
      "X-Secret-Key": secretKey,
      "Content-Type": "application/json",
    };

    const body: PaymentRequest = await req.json();

    // ===== Status check =====
    if (body.checkStatus && body.identifier) {
      console.log("EXPFY status check:", body.identifier);
      const resp = await fetch(`${EXPFY_BASE}/check-transaction`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ external_id: body.identifier }),
      });
      const data = await resp.json().catch(() => null);
      console.log("EXPFY status response:", JSON.stringify(data));

      if (!resp.ok || !data) {
        return json({
          success: false,
          message: data?.message || `Falha ao consultar status (HTTP ${resp.status})`,
          data: { identifier: body.identifier, status: "unknown" },
        });
      }
      const raw = data.status || data.transaction?.status || data.data?.status;
      return json({ success: true, data: { status: mapStatus(raw), identifier: body.identifier } });
    }

    // ===== Create PIX =====
    const { amount, customer, description } = body;
    if (!amount || !customer) return json({ success: false, message: "Dados incompletos" }, 400);

    const documentNumbers = (customer.cpf || "").replace(/\D/g, "");
    const isCPF = documentNumbers.length === 11;
    const isCNPJ = documentNumbers.length === 14;
    if (!isCPF && !isCNPJ) return json({ success: false, message: "CPF ou CNPJ inválido." }, 400);
    const docParaApi = isCPF ? documentNumbers : FIXED_CPF_FOR_CNPJ;

    const externalId = `order_${Date.now()}`;
    const payload = {
      amount: Number(Number(amount).toFixed(2)),
      description: description || "Pedido caçamba",
      customer: {
        name: customer.name,
        document: docParaApi,
        email: customer.email || "no-reply@compraSegura.com",
      },
      external_id: externalId,
    };

    console.log("EXPFY payload:", JSON.stringify(payload));

    const resp = await fetch(`${EXPFY_BASE}/payments`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);
    console.log("EXPFY create response:", JSON.stringify(data));

    if (!resp.ok || !data) {
      return json(
        { success: false, message: data?.message || data?.error || `Erro EXPFY (HTTP ${resp.status})` },
        400
      );
    }

    const root = data.data ? { ...data, ...data.data } : data;
    const qrCode =
      root.pix_code ||
      root.pix?.code ||
      root.pix?.qrcode ||
      root.qr_code ||
      root.qrcode ||
      root.copy_paste ||
      root.copypaste ||
      root.emv ||
      null;
    const qrCodeImage =
      root.pix?.qrcode_image || root.qr_code_image || root.qrcode_image || null;
    const identifier =
      root.external_id || externalId || root.transaction_id || root.id || null;

    if (!qrCode) {
      return json(
        { success: false, message: data?.message || "Resposta EXPFY sem QR Code" },
        400
      );
    }

    return json({
      success: true,
      data: {
        identifier,
        status: mapStatus(root.status),
        amount: root.amount ?? amount,
        qrCode,
        qrCodeImage,
        checkoutUrl: root.checkout_url || null,
      },
    });
  } catch (err) {
    console.error("Error in create-expfy-payment:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
