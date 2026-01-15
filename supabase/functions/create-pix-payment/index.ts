import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const risePayToken = Deno.env.get('RISEPAY_PRIVATE_TOKEN');
    
    if (!risePayToken) {
      console.error('RISEPAY_PRIVATE_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, message: 'Token de pagamento não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: PaymentRequest = await req.json();

    // Check payment status
    if (body.checkStatus && body.identifier) {
      console.log('Checking payment status for:', body.identifier);

      const response = await fetch(`https://api.risepay.com.br/api/External/Transactions/${body.identifier}`, {
        method: 'GET',
        headers: {
          'Authorization': risePayToken,
          'Content-Type': 'application/json',
        },
      });

      const responseData = await response.json().catch(() => null);
      console.log('RisePay status response:', JSON.stringify(responseData));

      // IMPORTANT: always return 200 so the client polling doesn't throw
      if (!response.ok || !responseData?.success) {
        const message =
          responseData?.message ||
          `Falha ao verificar status (HTTP ${response.status})`;

        return new Response(
          JSON.stringify({
            success: false,
            message,
            data: {
              identifier: body.identifier,
              status: 'unknown',
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const transactionData = responseData.object;

      // Map RisePay status to UI-friendly values
      // RisePay uses: "Waiting Payment", "Paid", etc.
      const risePayStatus: string = transactionData?.status;
      const status = risePayStatus === 'Paid'
        ? 'Paid'
        : risePayStatus === 'Waiting Payment'
          ? 'Waiting Payment'
          : risePayStatus;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status,
            identifier: transactionData?.id ?? body.identifier,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create PIX payment
    const { amount, customer } = body;

    if (!amount || !customer) {
      return new Response(
        JSON.stringify({ success: false, message: 'Dados incompletos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating PIX payment with RisePay:', { amount, customerName: customer.name });

    // Limpar CPF/CNPJ - remover caracteres não numéricos
    const documentNumbers = customer.cpf.replace(/\D/g, '');
    
    console.log('Document number:', documentNumbers);

    // Determinar se é CPF (11 dígitos) ou CNPJ (14 dígitos)
    const isCPF = documentNumbers.length === 11;
    const isCNPJ = documentNumbers.length === 14;

    if (!isCPF && !isCNPJ) {
      return new Response(
        JSON.stringify({ success: false, message: 'CPF ou CNPJ inválido. CPF deve ter 11 dígitos e CNPJ deve ter 14 dígitos.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CPF fixo interno para usar quando cliente informa CNPJ
    // (RisePay não aceita CNPJ, então usamos este CPF para processar)
    const FIXED_CPF_FOR_CNPJ = '19257915727';

    const customerData: Record<string, string> = {
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
    };

    // Se for CNPJ, enviamos o CPF fixo para a RisePay
    // O CNPJ original será mantido no frontend para o comprovante
    if (isCPF) {
      customerData.cpf = documentNumbers;
    } else {
      // CNPJ detectado - usar CPF fixo interno
      console.log('CNPJ detected, using fixed CPF for RisePay:', FIXED_CPF_FOR_CNPJ);
      customerData.cpf = FIXED_CPF_FOR_CNPJ;
    }

    const requestBody = {
      amount: amount,
      payment: {
        method: 'pix',
        expiresAt: 48, // 48 hours expiration
      },
      customer: customerData,
    };

    console.log('RisePay request body:', JSON.stringify(requestBody));

    const response = await fetch('https://api.risepay.com.br/api/External/Transactions', {
      method: 'POST',
      headers: {
        'Authorization': risePayToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json();

    console.log('RisePay response:', JSON.stringify(responseData));

    if (!response.ok || !responseData.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: responseData.message || 'Erro ao criar pagamento PIX' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // RisePay wraps the transaction data inside responseData.object
    const transactionData = responseData.object;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          identifier: transactionData.identifier,
          status: transactionData.status,
          amount: transactionData.amount,
          qrCode: transactionData.pix?.qrCode,
          // RisePay doesn't provide qrCodeImage, we'll generate it client-side
          qrCodeImage: null,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-pix-payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
