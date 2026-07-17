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

const VEOPAG_BASE = "https://api.veopag.com";
const FIXED_CPF_FOR_CNPJ = "05091065520";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mapStatus = (raw?: string): string => {
  const s = (raw || "").toUpperCase();
  if (s === "COMPLETED" || s === "PAID" || s === "APPROVED" || s === "CONFIRMED") return "Paid";
  if (s === "PENDING" || s === "PROCESSING" || s === "WAITING" || s === "WAITING_PAYMENT") return "Waiting Payment";
  if (s === "FAILED" || s === "CANCELLED" || s === "CANCELED" || s === "EXPIRED" || s === "REFUSED") return "Failed";
  if (s === "REFUNDED" || s === "CHARGEBACK") return "Refunded";
  return raw || "unknown";
};

// Token cache em memória por instância da função
let cachedToken: string | null = null;
let cachedUntil = 0;

const readSecret = async (name: string): Promise<string> => {
  try {
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !serviceKey) return "";
    const r = await fetch(
      `${supaUrl}/rest/v1/payment_secrets?key=eq.${name}&select=value`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows[0]?.value ? String(rows[0].value) : "";
  } catch {
    return "";
  }
};

const getToken = async (force = false): Promise<string> => {
  const now = Date.now();
  if (!force && cachedToken && now < cachedUntil) return cachedToken;

  const clientId = (await readSecret("veopag_client_id")) || Deno.env.get("VEOPAG_CLIENT_ID") || "";
  const clientSecret = (await readSecret("veopag_client_secret")) || Deno.env.get("VEOPAG_CLIENT_SECRET") || "";
  if (!clientId || !clientSecret) throw new Error("VeoPag credentials não configuradas");

  const resp = await fetch(`${VEOPAG_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.token) {
    throw new Error(data?.message || `Falha no login VeoPag (HTTP ${resp.status})`);
  }
  cachedToken = data.token as string;
  cachedUntil = now + 55 * 60_000;
  return cachedToken;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: PaymentRequest = await req.json();
    let token = await getToken();

    const doAuthed = async (init: RequestInit & { url: string }) => {
      const { url, ...rest } = init;
      let r = await fetch(url, {
        ...rest,
        headers: { ...(rest.headers || {}), Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        token = await getToken(true);
        r = await fetch(url, {
          ...rest,
          headers: { ...(rest.headers || {}), Authorization: `Bearer ${token}` },
        });
      }
      return r;
    };

    // ===== Status check =====
    if (body.checkStatus && body.identifier) {
      const id = body.identifier;
      const qs = id.includes("-") && id.length >= 32
        ? `transaction_id=${encodeURIComponent(id)}`
        : `external_id=${encodeURIComponent(id)}`;
      const r = await doAuthed({
        url: `${VEOPAG_BASE}/api/transactions/deposit?${qs}`,
        method: "GET",
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) {
        return json({
          success: false,
          message: data?.message || `Falha ao consultar status (HTTP ${r.status})`,
          data: { identifier: id, status: "unknown" },
        });
      }
      const dep = data.deposit;
      return json({
        success: true,
        data: { status: mapStatus(dep?.status), identifier: id },
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

    const amountNum = Number(amount);
    if (!isFinite(amountNum) || amountNum < 1) {
      return json({ success: false, message: "Valor mínimo: R$ 1,00" }, 400);
    }

    const externalId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const phoneDigits = (customer.phone || "11999999999").replace(/\D/g, "");
    const supaUrl = Deno.env.get("SUPABASE_URL") || "";

    const payload = {
      amount: Number(amountNum.toFixed(2)),
      external_id: externalId,
      clientCallbackUrl: `${supaUrl}/functions/v1/payment-webhook?provider=veopag`,
      payer: {
        name: customer.name,
        email: customer.email || "no-reply@comprasegura.com",
        document: docParaApi,
        phone: phoneDigits,
      },
    };

    console.log("VeoPag payload:", JSON.stringify(payload));

    const r = await doAuthed({
      url: `${VEOPAG_BASE}/api/payments/deposit`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => null);
    console.log("VeoPag create response:", JSON.stringify(data));

    if (!r.ok || !data) {
      return json(
        {
          success: false,
          message: data?.message || `Erro VeoPag (HTTP ${r.status})`,
        },
        400,
      );
    }

    const root = data.data ? { ...data, ...data.data } : data;
    const qrCode =
      root.qrcode ||
      root.qrCode ||
      root.qr_code ||
      root.pix_copy_paste ||
      root.copyPaste ||
      root.copy_paste ||
      root.emv ||
      root.brcode ||
      null;
    const qrCodeImage =
      root.qrcode_image ||
      root.qrCodeImage ||
      root.qr_code_image ||
      root.image ||
      null;
    const identifier = root.transactionId || root.transaction_id || root.id || externalId;

    if (!qrCode) {
      return json(
        { success: false, message: data?.message || "Resposta VeoPag sem QR Code" },
        400,
      );
    }

    return json({
      success: true,
      data: {
        identifier: String(identifier),
        status: mapStatus(root.status),
        amount: amountNum,
        qrCode,
        qrCodeImage,
      },
    });
  } catch (err) {
    console.error("Error in create-veopag-payment:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
