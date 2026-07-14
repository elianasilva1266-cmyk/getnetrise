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

// PodPay: valores em CENTAVOS. Produção: https://api.podpay.app
const PODPAY_BASE = "https://api.podpay.app";
const FIXED_CPF_FOR_CNPJ = "05091065520";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mapStatus = (raw?: string): string => {
  const s = (raw || "").toLowerCase();
  if (s === "paid" || s === "completed" || s === "approved" || s === "confirmed") return "Paid";
  if (s === "pending" || s === "processing" || s === "waiting" || s === "waiting_payment") return "Waiting Payment";
  if (s === "failed" || s === "cancelled" || s === "canceled" || s === "refused" || s === "blocked") return "Failed";
  if (s === "refunded" || s === "chargeback" || s === "pre_chargeback") return "Refunded";
  return raw || "unknown";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let apiKey = Deno.env.get("PODPAY_API_KEY") || "";

    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && serviceKey) {
        const r = await fetch(
          `${supaUrl}/rest/v1/payment_secrets?key=eq.podpay_api_key&select=key,value`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.value) apiKey = rows[0].value;
      }
    } catch (e) {
      console.warn("Falha ao ler payment_secrets:", e);
    }

    if (!apiKey) {
      return json({ success: false, message: "PODPAY_API_KEY não configurada" }, 500);
    }

    const authHeaders = {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    };

    const body: PaymentRequest = await req.json();

    // ===== Status check =====
    if (body.checkStatus && body.identifier) {
      console.log("PodPay status check:", body.identifier);
      const resp = await fetch(`${PODPAY_BASE}/v1/transactions/${body.identifier}`, {
        headers: authHeaders,
      });
      const data = await resp.json().catch(() => null);
      console.log("PodPay status response:", JSON.stringify(data));

      if (!resp.ok || !data) {
        return json({
          success: false,
          message: data?.error?.message || `Falha ao consultar status (HTTP ${resp.status})`,
          data: { identifier: body.identifier, status: "unknown" },
        });
      }
      const root = data.data ?? data;
      return json({
        success: true,
        data: { status: mapStatus(root.status), identifier: body.identifier },
      });
    }

    // ===== Create PIX =====
    const { amount, customer, description } = body;
    if (!amount || !customer) return json({ success: false, message: "Dados incompletos" }, 400);

    const documentNumbers = (customer.cpf || "").replace(/\D/g, "");
    const isCPF = documentNumbers.length === 11;
    const isCNPJ = documentNumbers.length === 14;
    if (!isCPF && !isCNPJ) return json({ success: false, message: "CPF ou CNPJ inválido." }, 400);
    const docParaApi = isCPF ? documentNumbers : FIXED_CPF_FOR_CNPJ;

    // PodPay usa valores em CENTAVOS
    const amountInCents = Math.round(Number(amount) * 100);
    if (amountInCents < 100) {
      return json({ success: false, message: "Valor mínimo: R$ 1,00" }, 400);
    }

    const externalId = `order_${Date.now()}`;
    const idempotencyKey = crypto.randomUUID();

    const payload = {
      paymentMethod: "pix",
      amount: amountInCents,
      external_id: externalId,
      description: description || "Pedido caçamba",
      customer: {
        name: customer.name,
        document: docParaApi,
        email: customer.email || "no-reply@comprasegura.com",
        phone: customer.phone || "11999999999",
      },
    };

    console.log("PodPay payload:", JSON.stringify(payload));

    const resp = await fetch(`${PODPAY_BASE}/v1/transactions`, {
      method: "POST",
      headers: { ...authHeaders, "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);
    console.log("PodPay create response:", JSON.stringify(data));

    if (!resp.ok || !data) {
      return json(
        {
          success: false,
          message:
            data?.error?.message ||
            data?.message ||
            `Erro PodPay (HTTP ${resp.status})`,
        },
        400
      );
    }

    const root = data.data ? { ...data, ...data.data } : data;
    const pix = root.pix || root.pix_data || {};
    const qrCode =
      pix.qrcode ||
      pix.qr_code ||
      pix.code ||
      pix.copy_paste ||
      pix.copypaste ||
      pix.emv ||
      pix.brcode ||
      root.qr_code ||
      root.qrcode ||
      root.copy_paste ||
      root.copypaste ||
      root.emv ||
      root.brcode ||
      null;
    const qrCodeImage =
      pix.qrcode_image ||
      pix.qr_code_image ||
      pix.image ||
      root.qr_code_image ||
      root.qrcode_image ||
      null;
    const identifier = root.id || root.transaction_id || root.external_id || externalId;

    if (!qrCode) {
      return json(
        {
          success: false,
          message: data?.error?.message || data?.message || "Resposta PodPay sem QR Code",
        },
        400
      );
    }

    return json({
      success: true,
      data: {
        identifier,
        status: mapStatus(root.status),
        amount: amount,
        qrCode,
        qrCodeImage,
      },
    });
  } catch (err) {
    console.error("Error in create-podpay-payment:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
