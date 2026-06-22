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
  checkStatus?: boolean;
  identifier?: string;
}

const ZUCKPAY_BASE = "https://www.zuckpay.com.br/conta/v3";

// CPF fixo interno para quando o cliente informar CNPJ
const FIXED_CPF_FOR_CNPJ = "05091065520";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mapStatus = (raw?: string): string => {
  const s = (raw || "").toUpperCase();
  if (s === "PAID" || s === "APPROVED") return "Paid";
  if (s === "PENDING" || s === "PENDING_3DS") return "Waiting Payment";
  if (s === "FAILED" || s === "REFUSED") return "Failed";
  if (s === "EXPIRADO" || s === "EXPIRED") return "Expired";
  return raw || "unknown";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("ZUCKPAY_CLIENT_ID");
    const clientSecret = Deno.env.get("ZUCKPAY_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      console.error("ZUCKPAY credentials not configured");
      return json({ success: false, message: "Credenciais ZuckPay não configuradas" }, 500);
    }

    const authHeader = "Basic " + btoa(`${clientId}:${clientSecret}`);
    const body: PaymentRequest = await req.json();

    // ====== Consulta de status ======
    if (body.checkStatus && body.identifier) {
      console.log("ZuckPay status check:", body.identifier);

      const resp = await fetch(
        `${ZUCKPAY_BASE}/pix/status?transactionId=${encodeURIComponent(body.identifier)}`,
        {
          method: "GET",
          headers: { Accept: "application/json", Authorization: authHeader },
        }
      );
      const data = await resp.json().catch(() => null);
      console.log("ZuckPay status response:", JSON.stringify(data));

      if (!resp.ok || !data) {
        return json({
          success: false,
          message: data?.message || `Falha ao consultar status (HTTP ${resp.status})`,
          data: { identifier: body.identifier, status: "unknown" },
        });
      }

      return json({
        success: true,
        data: {
          status: mapStatus(data.status),
          identifier: data.transactionId || body.identifier,
        },
      });
    }

    // ====== Criação de PIX ======
    const { amount, customer } = body;
    if (!amount || !customer) {
      return json({ success: false, message: "Dados incompletos" }, 400);
    }

    const documentNumbers = (customer.cpf || "").replace(/\D/g, "");
    const isCPF = documentNumbers.length === 11;
    const isCNPJ = documentNumbers.length === 14;

    if (!isCPF && !isCNPJ) {
      return json(
        { success: false, message: "CPF ou CNPJ inválido." },
        400
      );
    }

    const cpfParaApi = isCPF ? documentNumbers : FIXED_CPF_FOR_CNPJ;

    const payload = {
      nome: customer.name,
      cpf: cpfParaApi,
      valor: Number(amount.toFixed(2)),
      email: customer.email || "no-reply@compraSegura.com",
      telefone: customer.phone || "11999999999",
      descricao: "Pedido caçamba",
    };

    console.log("ZuckPay payload:", JSON.stringify(payload));

    const resp = await fetch(`${ZUCKPAY_BASE}/pix/qrcode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => null);
    console.log("ZuckPay create response:", JSON.stringify(data));

    if (!resp.ok || !data?.transactionId || !(data.qrcode || data.pix_code)) {
      return json(
        {
          success: false,
          message: data?.message || data?.error || `Erro ZuckPay (HTTP ${resp.status})`,
        },
        400
      );
    }

    return json({
      success: true,
      data: {
        identifier: data.transactionId,
        status: mapStatus(data.status),
        amount: data.amount ?? amount,
        qrCode: data.qrcode || data.pix_code,
        qrCodeImage: data.qrcode_image || null,
        checkoutUrl: data.checkout_url || null,
      },
    });
  } catch (err) {
    console.error("Error in create-zuckpay-payment:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ success: false, message: msg }, 500);
  }
});
