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

const CAOSPAY_BASE = "https://caospayment.shop/api/pay";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mapStatus = (raw?: string): string => {
  const s = (raw || "").toLowerCase();
  if (s === "paid" || s === "completed" || s === "approved" || s === "confirmed" || s === "success") return "Paid";
  if (s === "pending" || s === "processing" || s === "waiting" || s === "waiting_payment") return "Waiting Payment";
  if (s === "failed" || s === "cancelled" || s === "canceled" || s === "refused" || s === "expired") return "Failed";
  return raw || "unknown";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let apiKey = Deno.env.get("CAOSPAY_API_KEY") || "";

    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && serviceKey) {
        const r = await fetch(
          `${supaUrl}/rest/v1/payment_secrets?key=eq.caospay_api_key&select=key,value`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.value) apiKey = rows[0].value;
      }
    } catch (e) {
      console.warn("Falha ao ler payment_secrets:", e);
    }

    // Sanitize: remove whitespace, quotes, and accidental "Bearer " prefix
    apiKey = apiKey.trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();

    if (!apiKey) {
      return json({ success: false, message: "CAOSPAY_API_KEY não configurada" }, 500);
    }

    if (!/^cpk_/.test(apiKey)) {
      return json({
        success: false,
        message: "Token CaosPay inválido. Deve começar com 'cpk_' (produção) ou 'cpk_test_' (sandbox). Cole apenas o token, sem 'Bearer'.",
      }, 400);
    }

    console.log("CaosPay token prefix:", apiKey.slice(0, 12) + "...", "len:", apiKey.length);

    const authHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const body: PaymentRequest = await req.json();

    // ===== Status =====
    if (body.checkStatus && body.identifier) {
      console.log("CaosPay status check:", body.identifier);
      const resp = await fetch(`${CAOSPAY_BASE}/status`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ id: body.identifier, payment_id: body.identifier }),
      });
      const data = await resp.json().catch(() => null);
      console.log("CaosPay status response:", JSON.stringify(data));

      if (!resp.ok || !data) {
        return json({
          success: false,
          message: data?.message || `Falha ao consultar status (HTTP ${resp.status})`,
          data: { identifier: body.identifier, status: "unknown" },
        });
      }
      const p = data.payment ?? data.data ?? data;
      const statusRaw = p.status ?? p.state ?? data.status ?? "";
      return json({
        success: true,
        data: { status: mapStatus(String(statusRaw)), identifier: body.identifier },
      });
    }

    // ===== Create =====
    const { amount, description } = body;
    if (!amount) return json({ success: false, message: "Dados incompletos" }, 400);
    if (Number(amount) < 1) {
      return json({ success: false, message: "Valor mínimo: R$ 1,00" }, 400);
    }

    const payload = {
      value: Number(amount),
      description: (description || "Pedido").slice(0, 100),
    };

    console.log("CaosPay payload:", JSON.stringify(payload));

    const resp = await fetch(`${CAOSPAY_BASE}/generate`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);
    console.log("CaosPay create response:", JSON.stringify(data));

    if (!resp.ok || !data) {
      return json(
        {
          success: false,
          message: data?.message || data?.error || `Erro CaosPay (HTTP ${resp.status})`,
        },
        400,
      );
    }

    const p = data.payment ?? data.data ?? data;
    const qrCode =
      p.qr_copy_paste ??
      p.qrCopyPaste ??
      p.copy_paste ??
      p.copyPaste ??
      p.brcode ??
      p.emv ??
      p.pix_code ??
      p.qrcode ??
      p.qr_code ??
      null;
    const qrCodeImage = p.qr_code_image ?? p.qrCodeImage ?? p.image ?? null;
    const identifier = p.id ?? p.payment_id ?? p.transaction_id ?? null;

    if (!qrCode) {
      return json(
        { success: false, message: data?.message || "Resposta CaosPay sem QR Code" },
        400,
      );
    }

    return json({
      success: true,
      data: {
        identifier: identifier ? String(identifier) : `caospay_${Date.now()}`,
        status: mapStatus(String(p.status ?? "pending")),
        amount: Number(amount),
        qrCode,
        qrCodeImage,
      },
    });
  } catch (err) {
    console.error("Error in create-caospay-payment:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
