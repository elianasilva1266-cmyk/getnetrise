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
    const podPayApiKey = Deno.env.get('PODPAY_API_KEY');
    
    if (!podPayApiKey) {
      console.error('PODPAY_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, message: 'Token de pagamento não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: PaymentRequest = await req.json();

    // Check payment status
    if (body.checkStatus && body.identifier) {
      console.log('Checking payment status for:', body.identifier);

      const response = await fetch(`https://api.podpay.app/v1/transactions/${body.identifier}`, {
        method: 'GET',
        headers: {
          'x-api-key': podPayApiKey,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('PodPay status response:', JSON.stringify(data));

      if (!response.ok) {
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
          status: data.status,
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
    const documentType = isCnpj ? 'cnpj' : 'cpf';

    // Gerar número do produto aleatório entre 1 e 20
    const productNumber = Math.floor(Math.random() * 20) + 1;
    const productTitle = `Produto ${productNumber}`;
    
    console.log('Product title:', productTitle);
    console.log('Document type:', documentType, '- Number:', documentNumbers);

    // Converter valor para centavos (PodPay usa centavos)
    const amountInCents = Math.round(amount * 100);

    const requestBody = {
      paymentMethod: 'pix',
      amount: amountInCents,
      customer: {
        document: {
          type: documentType,
          number: documentNumbers,
        },
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
      },
      items: [
        {
          title: productTitle,
          unitPrice: amountInCents,
          quantity: 1,
          tangible: true,
        }
      ]
    };

    console.log('PodPay request body:', JSON.stringify(requestBody));

    const response = await fetch('https://api.podpay.app/v1/transactions', {
      method: 'POST',
      headers: {
        'x-api-key': podPayApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json();

    console.log('PodPay response:', JSON.stringify(responseData));

    if (!response.ok || !responseData.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: responseData.message || 'Erro ao criar pagamento PIX' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PodPay wraps the transaction data inside responseData.data
    const transactionData = responseData.data;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          identifier: transactionData.id,
          status: transactionData.status,
          amount: transactionData.amount,
          qrCode: transactionData.pixQrCode,
          qrCodeImage: transactionData.pixQrCodeImage,
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
