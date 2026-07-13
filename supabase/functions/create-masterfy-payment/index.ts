import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  amount?: number;
  customer?: {
    name: string;
    cpf: string;
    email?: string;
    phone?: string;
  };
  description?: string;
  checkStatus?: boolean;
  identifier?: string;
}

const MASTERFY_BASE = "https://api.masterfypagamentos.com/v1";
const FIXED_CPF_FOR_CNPJ = "05091065520";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mapStatus = (raw?: string): string => {
  const s = (raw || "").toUpperCase();
  if (s === "PAID" || s === "APPROVED" || s === "COMPLETED") return "Paid";
  if (s === "PENDING" || s === "WAITING" || s === "WAITING_PAYMENT") return "Waiting Payment";
  if (s === "FAILED" || s === "REFUSED" || s === "CANCELLED" || s === "CANCELED") return "Failed";
  if (s === "EXPIRED") return "Expired";
  return raw || "unknown";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let apiKey = Deno.env.get("MASTERFY_API_KEY") || "";

    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && serviceKey) {
        const r = await fetch(
          `${supaUrl}/rest/v1/payment_secrets?key=eq.masterfy_api_key&select=value`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.value) apiKey = rows[0].value;
      }
    } catch (e) {
      console.warn("Falha ao ler payment_secrets, usando env:", e);
    }

    if (!apiKey) {
      return json({ success: false, message: "Chave MasterFy não configurada" }, 500);
    }

    const authHeader = `Bearer ${apiKey}`;
    const body: PaymentRequest = await req.json();

    // ====== Status check ======
    if (body.checkStatus && body.identifier) {
      console.log("MasterFy status check:", body.identifier);
      const resp = await fetch(
        `${MASTERFY_BASE}/payment/${encodeURIComponent(body.identifier)}`,
        { method: "GET", headers: { Accept: "application/json", Authorization: authHeader } }
      );
      const data = await resp.json().catch(() => null);
      console.log("MasterFy status response:", JSON.stringify(data));

      if (!resp.ok || !data) {
        return json({
          success: false,
          message: data?.message || `Falha ao consultar status (HTTP ${resp.status})`,
          data: { identifier: body.identifier, status: "unknown" },
        });
      }

      const raw = data.status || data.data?.status || data.payment?.status;
      const id = data.id || data.data?.id || body.identifier;
      return json({
        success: true,
        data: { status: mapStatus(raw), identifier: id },
      });
    }

    // ====== Create PIX ======
    const { amount, customer, description } = body;
    if (!amount || !customer) {
      return json({ success: false, message: "Dados incompletos" }, 400);
    }

    const documentNumbers = (customer.cpf || "").replace(/\D/g, "");
    const isCPF = documentNumbers.length === 11;
    const isCNPJ = documentNumbers.length === 14;
    if (!isCPF && !isCNPJ) {
      return json({ success: false, message: "CPF ou CNPJ inválido." }, 400);
    }
    const cpfParaApi = isCPF ? documentNumbers : FIXED_CPF_FOR_CNPJ;

    // MasterFy espera valor em centavos
    const amountCents = Math.round(Number(amount) * 100);

    const payload = {
      amount: amountCents,
      currency: "BRL",
      method: "PIX",
      description: description || "Pedido caçamba",
      externalRef: `order_${Date.now()}`,
      payer: {
        name: customer.name,
        taxId: cpfParaApi,
        email: customer.email || "no-reply@compraSegura.com",
        phone: customer.phone || "11999999999",
      },
      items: [
        { quantity: 1, name: description || "Pedido caçamba", price: amountCents, type: "PHYSICAL" },
      ],
    };

    console.log("MasterFy payload:", JSON.stringify(payload));

    const resp = await fetch(`${MASTERFY_BASE}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => null);
    console.log("MasterFy create response:", JSON.stringify(data));

    if (!resp.ok || !data) {
      return json(
        { success: false, message: data?.message || data?.error || `Erro MasterFy (HTTP ${resp.status})` },
        400
      );
    }

    // Extração defensiva — MasterFy pode retornar em vários formatos
    const root = data.data || data;
    const identifier =
      root.id || root.transactionId || root.paymentId || root.reference || null;
    const qrCode =
      root.pix?.qrcode ||
      root.pix?.qrCode ||
      root.pix?.emv ||
      root.qrcode ||
      root.qrCode ||
      root.payment?.pix?.qrcode ||
      root.payment?.qrcode ||
      null;
    const qrCodeImage =
      root.pix?.qrcodeImage ||
      root.pix?.qrCodeImage ||
      root.qrcodeImage ||
      root.qrCodeImage ||
      null;

    if (!identifier || !qrCode) {
      return json(
        { success: false, message: data?.message || "Resposta MasterFy sem QR Code/ID" },
        400
      );
    }

    return json({
      success: true,
      data: {
        identifier,
        status: mapStatus(root.status),
        amount: (root.amount ?? amountCents) / 100,
        qrCode,
        qrCodeImage,
        checkoutUrl: root.checkoutUrl || root.payment_url || null,
      },
    });
  } catch (err) {
    console.error("Error in create-masterfy-payment:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
