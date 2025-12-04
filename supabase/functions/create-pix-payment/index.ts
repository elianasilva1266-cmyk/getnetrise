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

      const data = await response.json();
      console.log('RisePay status response:', JSON.stringify(data));

      if (!response.ok || !data.success) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: data.message || 'Erro ao verificar status' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: data.object?.status,
          identifier: body.identifier
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

    console.log('Creating PIX payment:', { amount, customerName: customer.name });

    // Detectar se é CPF (11 dígitos) ou CNPJ (14 dígitos)
    const documentNumbers = customer.cpf.replace(/\D/g, '');
    const isCnpj = documentNumbers.length === 14;

    // CPF fixo para usar quando cliente informar CNPJ (workaround da API RisePay)
    const FIXED_CPF_FOR_CNPJ = '19257915727';

    // Montar dados do cliente - para CNPJ, usar CPF fixo internamente
    const customerData = {
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      cpf: isCnpj ? FIXED_CPF_FOR_CNPJ : documentNumbers,
    };

    console.log('Customer data:', JSON.stringify(customerData));
    console.log('Is CNPJ:', isCnpj, '- Using fixed CPF:', isCnpj);

    // Gerar número do produto aleatório entre 1 e 20
    const productNumber = Math.floor(Math.random() * 20) + 1;
    const productDescription = `Produto ${productNumber}`;
    
    console.log('Product description:', productDescription);

    const response = await fetch('https://api.risepay.com.br/api/External/Transactions', {
      method: 'POST',
      headers: {
        'Authorization': risePayToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount,
        description: productDescription,
        payment: {
          method: 'pix'
        },
        customer: customerData
      }),
    });

    const data = await response.json();

    console.log('RisePay response:', JSON.stringify(data));

    if (!response.ok || !data.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: data.message || 'Erro ao criar pagamento PIX' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          identifier: data.object.identifier,
          status: data.object.status,
          amount: data.object.amount,
          qrCode: data.object.pix?.qrCode,
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
