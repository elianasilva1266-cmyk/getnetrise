import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, CheckCircle2, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    title: string;
    price: string;
    size: string;
  };
}

const orderSchema = z.object({
  name: z.string().trim().min(3, { message: "Nome deve ter pelo menos 3 caracteres" }).max(100),
  document: z.string().trim().min(11, { message: "CPF/CNPJ inválido" }),
});

// Dados fixos para todas as transações
const FIXED_EMAIL = "elianasilva1266@gmail.com";
const FIXED_PHONE = "11945878754";

// Gera ID aleatório para recibo
const generateReceiptId = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// Gera número do produto interno (1-20)
const generateProductNumber = () => {
  const num = Math.floor(Math.random() * 20) + 1;
  return num.toString().padStart(5, '0');
};

interface PixPayment {
  identifier: string;
  status: string;
  amount: number;
  qrCode: string;
}

const OrderDialog = ({ open, onOpenChange, product }: OrderDialogProps) => {
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"waiting" | "approved">("waiting");
  const [receiptId, setReceiptId] = useState("");
  const [productNumber, setProductNumber] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const priceValue = parseFloat(product.price.replace("R$", "").replace(".", "").replace(",", ".").trim());
  const total = priceValue * quantity;

  // Polling para verificar status do pagamento
  useEffect(() => {
    if (pixPayment && paymentStatus === "waiting") {
      pollingRef.current = setInterval(async () => {
        try {
          const { data, error } = await supabase.functions.invoke('create-pix-payment', {
            body: {
              checkStatus: true,
              identifier: pixPayment.identifier
            }
          });

          if (data?.status === "Paid" || data?.status === "Approved") {
            setPaymentStatus("approved");
            setReceiptId(generateReceiptId());
            setProductNumber(generateProductNumber());
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
            }
            toast({
              title: "Pagamento confirmado!",
              description: "Seu pagamento foi aprovado com sucesso.",
            });
          }
        } catch (error) {
          console.error("Erro ao verificar status:", error);
        }
      }, 5000); // Verifica a cada 5 segundos
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [pixPayment, paymentStatus, toast]);

  const formatDocument = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      return numbers
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDocument(e.target.value);
    setDocument(formatted);
  };

  const handleCopyPix = async () => {
    if (pixPayment?.qrCode) {
      await navigator.clipboard.writeText(pixPayment.qrCode);
      setCopied(true);
      toast({
        title: "Código copiado!",
        description: "Cole no seu aplicativo de banco para pagar.",
      });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleSubmit = async () => {
    try {
      orderSchema.parse({ name, document });
      
      setIsLoading(true);

      const { data, error } = await supabase.functions.invoke('create-pix-payment', {
        body: {
          amount: total,
          customer: {
            name: name,
            email: FIXED_EMAIL,
            phone: FIXED_PHONE,
            cpf: document,
          }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.message || error?.message || 'Erro ao criar pagamento');
      }

      setPixPayment(data.data);
      toast({
        title: "PIX gerado com sucesso!",
        description: "Escaneie o QR Code ou copie o código para pagar.",
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erro no formulário",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao gerar PIX",
          description: error instanceof Error ? error.message : "Tente novamente",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setQuantity(1);
      setName("");
      setDocument("");
      setPixPayment(null);
      setCopied(false);
      setPaymentStatus("waiting");
      setReceiptId("");
      setProductNumber("");
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    }
    onOpenChange(open);
  };

  const handleDownloadReceipt = () => {
    const receiptContent = `
═══════════════════════════════════════
           RECIBO DE COMPRA
═══════════════════════════════════════

Nome: ${name}
Produto: ${product.title}
Tamanho: ${product.size}
Quantidade: ${quantity}

───────────────────────────────────────
VALOR PAGO: R$ ${pixPayment?.amount.toFixed(2).replace(".", ",")}
───────────────────────────────────────

Código: ${receiptId}
Produto ${productNumber}

Data: ${new Date().toLocaleDateString('pt-BR')}
Hora: ${new Date().toLocaleTimeString('pt-BR')}

═══════════════════════════════════════
        Obrigado pela preferência!
═══════════════════════════════════════
    `;

    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `recibo-${receiptId}.txt`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Recibo baixado!",
      description: "O recibo foi salvo no seu dispositivo.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {pixPayment ? "Pague com PIX" : "Finalizar Pedido"}
          </DialogTitle>
        </DialogHeader>

        {pixPayment ? (
          <div className="space-y-6 py-4">
            {paymentStatus === "approved" ? (
              <div className="space-y-6">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-green-600">Pagamento Efetuado com Sucesso!</h3>
                </div>

                <div className="bg-muted/50 rounded-xl p-5 space-y-4">
                  <h4 className="font-bold text-center text-lg border-b pb-2">Recibo de Compra</h4>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome:</span>
                      <span className="font-medium text-right">{name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Produto:</span>
                      <span className="font-medium">{product.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tamanho:</span>
                      <span className="font-medium">{product.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantidade:</span>
                      <span className="font-medium">{quantity}</span>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-lg">Valor Pago:</span>
                      <span className="font-bold text-green-600 text-2xl">
                        R$ {pixPayment.amount.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </div>

                  <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Código:</span>
                      <span className="font-mono">{receiptId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Referência:</span>
                      <span className="font-mono">Produto {productNumber}</span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleDownloadReceipt}
                  className="w-full h-12"
                  size="lg"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Baixar Recibo
                </Button>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="bg-muted p-6 rounded-xl inline-block mx-auto">
                  <QRCodeSVG 
                    value={pixPayment.qrCode} 
                    size={200}
                    level="H"
                    includeMargin
                  />
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Escaneie o QR Code acima ou copie o código PIX
                  </p>
                  <div className="flex items-center gap-2">
                    <Input 
                      value={pixPayment.qrCode} 
                      readOnly 
                      className="text-xs h-10"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor:</span>
                    <span className="font-bold text-secondary text-xl">
                      R$ {pixPayment.amount.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ID da transação:</span>
                    <span className="font-mono">{pixPayment.identifier}</span>
                  </div>
                </div>

                <Button
                  onClick={handleCopyPix}
                  className="w-full h-12"
                  size="lg"
                >
                  {copied ? (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      Código Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5 mr-2" />
                      Copiar Código PIX
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">Aguardando pagamento...</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="text-sm text-muted-foreground">
              {product.title} - <span className="text-foreground font-semibold">{product.price}</span>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Quantidade</Label>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((qty) => (
                  <button
                    key={qty}
                    onClick={() => setQuantity(qty)}
                    className={`
                      p-6 rounded-lg border-2 transition-all duration-200
                      ${quantity === qty 
                        ? "border-secondary bg-secondary/10 text-secondary" 
                        : "border-border hover:border-secondary/50"
                      }
                    `}
                  >
                    <div className="text-3xl font-bold">{qty}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {qty === 1 ? "unidade" : "unidades"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-base font-semibold">
                Nome Completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Digite seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="document" className="text-base font-semibold">
                CPF ou CNPJ <span className="text-destructive">*</span>
              </Label>
              <Input
                id="document"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={document}
                onChange={handleDocumentChange}
                maxLength={18}
                className="h-12"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-lg font-semibold">Total:</span>
              <span className="text-3xl font-bold text-secondary">
                R$ {total.toFixed(2).replace(".", ",")}
              </span>
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full h-14 text-lg font-semibold"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Gerando PIX...
                </>
              ) : (
                "Pagar com PIX"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderDialog;
