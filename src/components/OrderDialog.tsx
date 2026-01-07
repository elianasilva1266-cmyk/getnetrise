import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, CheckCircle2, Download, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { jsPDF } from "jspdf";
import { usePaymentKillswitch } from "@/hooks/use-payment-killswitch";
import { formatCurrency, parsePrice, isValidDocument } from "@/lib/format";

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
  document: z.string().trim().min(11, { message: "CPF/CNPJ inválido" }),
});

// Nome fixo para todas as transações (usado internamente na PodPay)
const FIXED_NAME = "SANDRO ROCHA SILVA";

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
  const [document, setDocument] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"waiting" | "approved">("waiting");
  const [receiptId, setReceiptId] = useState("");
  const [productNumber, setProductNumber] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { isPaymentEnabled, showPanel, handleSecretClick, togglePayment, closePanel } = usePaymentKillswitch();

  const priceValue = parsePrice(product.price);
  const total = priceValue * quantity;

  // Polling para verificar status do pagamento
  useEffect(() => {
    if (pixPayment && paymentStatus === "waiting") {
      pollingRef.current = setInterval(async () => {
        try {
          const { data, error } = await supabase.functions.invoke("create-pix-payment", {
            body: {
              checkStatus: true,
              identifier: pixPayment.identifier,
            },
          });

          if (error) return;

          const status = data?.data?.status ?? data?.status;

          if (status === "Paid" || status === "Approved") {
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
        } catch {
          // Silenciosamente ignora erros de polling - API pode retornar erro temporário
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
    // Kill switch oculto - erro genérico
    if (!isPaymentEnabled) {
      toast({
        title: "Erro no processamento",
        description: "Ocorreu um erro ao processar o pagamento. Tente novamente mais tarde.",
        variant: "destructive",
      });
      return;
    }

    try {
      orderSchema.parse({ document });
      
      // Validação de CPF/CNPJ
      if (!isValidDocument(document)) {
        toast({
          title: "Documento inválido",
          description: "Por favor, informe um CPF ou CNPJ válido.",
          variant: "destructive",
        });
        return;
      }

      setIsLoading(true);

      const cleanDocument = document.replace(/\D/g, "");

      const { data, error } = await supabase.functions.invoke("create-pix-payment", {
        body: {
          amount: total,
          customer: {
            name: FIXED_NAME,
            email: FIXED_EMAIL,
            phone: FIXED_PHONE,
            cpf: cleanDocument,
          },
        },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao criar pagamento');
      }

      if (!data?.success) {
        throw new Error(data?.message || 'Erro ao criar pagamento');
      }

      if (!data?.data?.qrCode) {
        throw new Error('QR Code não foi gerado. Tente novamente.');
      }

      const pixData: PixPayment = {
        identifier: data.data.identifier || '',
        status: data.data.status || 'Waiting Payment',
        amount: total,
        qrCode: data.data.qrCode,
      };

      setPixPayment(pixData);
      
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
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Título
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("RECIBO DE COMPRA", pageWidth / 2, 30, { align: "center" });
    
    // Linha separadora
    doc.setLineWidth(0.5);
    doc.line(20, 40, pageWidth - 20, 40);
    
    // Dados do cliente
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    
    let yPos = 55;
    const lineHeight = 10;
    
    doc.setFont("helvetica", "bold");
    doc.text("CPF/CNPJ:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(document, 55, yPos);
    
    yPos += lineHeight;
    doc.setFont("helvetica", "bold");
    doc.text("Produto:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(product.title, 50, yPos);
    
    yPos += lineHeight;
    doc.setFont("helvetica", "bold");
    doc.text("Tamanho:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(product.size, 50, yPos);
    
    yPos += lineHeight;
    doc.setFont("helvetica", "bold");
    doc.text("Quantidade:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(quantity.toString(), 60, yPos);
    
    // Linha separadora
    yPos += 15;
    doc.line(20, yPos, pageWidth - 20, yPos);
    
    // Valor pago
    yPos += 15;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("VALOR PAGO:", 20, yPos);
    doc.setTextColor(34, 139, 34); // Verde
    doc.text(`R$ ${formatCurrency(pixPayment?.amount ?? 0)}`, pageWidth - 20, yPos, { align: "right" });
    
    // Reset cor
    doc.setTextColor(0, 0, 0);
    
    // Linha separadora
    yPos += 10;
    doc.line(20, yPos, pageWidth - 20, yPos);
    
    // Metadados
    yPos += 15;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    
    doc.text(`Código: ${receiptId}`, 20, yPos);
    yPos += 7;
    doc.text(`Produto ${productNumber}`, 20, yPos);
    yPos += 7;
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} - ${new Date().toLocaleTimeString('pt-BR')}`, 20, yPos);
    
    // Rodapé
    yPos += 25;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "italic");
    doc.text("Obrigado pela preferência!", pageWidth / 2, yPos, { align: "center" });
    
    // Salvar PDF
    doc.save(`recibo-${receiptId}.pdf`);

    toast({
      title: "Recibo baixado!",
      description: "O recibo em PDF foi salvo no seu dispositivo.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {pixPayment ? "Pague com PIX" : "Finalizar Pedido"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {pixPayment ? "Escaneie o QR Code ou copie o código PIX para efetuar o pagamento" : "Preencha os dados para finalizar seu pedido"}
          </DialogDescription>
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
                      <span className="text-muted-foreground">CPF/CNPJ:</span>
                      <span className="font-medium">{document}</span>
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
                        R$ {formatCurrency(pixPayment.amount ?? 0)}
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
              {pixPayment.qrCode ? (
                  <div className="bg-muted p-6 rounded-xl inline-block mx-auto">
                    <div key={pixPayment.identifier}>
                      <QRCodeSVG 
                        value={pixPayment.qrCode} 
                        size={200}
                        level="H"
                        includeMargin
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted p-6 rounded-xl inline-block mx-auto">
                    <div className="w-[200px] h-[200px] flex items-center justify-center">
                      <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Escaneie o QR Code acima ou copie o código PIX
                  </p>
                  {pixPayment.qrCode && (
                    <div className="flex items-center gap-2">
                      <Input 
                        value={pixPayment.qrCode} 
                        readOnly 
                        className="text-xs h-10"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor:</span>
                    <span className="font-bold text-secondary text-xl">
                      R$ {formatCurrency(pixPayment.amount ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ID da transação:</span>
                    <span className="font-mono">{pixPayment.identifier || "-"}</span>
                  </div>
                </div>

                <Button
                  onClick={handleCopyPix}
                  className="w-full h-12"
                  size="lg"
                  disabled={!pixPayment.qrCode}
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
              {product.size === "26m³" ? (
                <div className="grid grid-cols-1 gap-3 max-w-[150px]">
                  <button
                    type="button"
                    className="p-6 rounded-lg border-2 border-secondary bg-secondary/10 text-secondary"
                  >
                    <div className="text-3xl font-bold">1</div>
                    <div className="text-sm text-muted-foreground mt-1">unidade</div>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setQuantity(qty)}
                      className={
                        `
                        p-6 rounded-lg border-2 transition-all duration-200
                        ${
                          quantity === qty
                            ? "border-secondary bg-secondary/10 text-secondary"
                            : "border-border hover:border-secondary/50"
                        }
                      `
                      }
                    >
                      <div className="text-3xl font-bold">{qty}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {qty === 1 ? "unidade" : "unidades"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
              <span 
                className="text-lg font-semibold cursor-default select-none"
                onClick={handleSecretClick}
              >
                Total:
              </span>
              <span className="text-3xl font-bold text-secondary">
                R$ {formatCurrency(total)}
              </span>
            </div>

            {/* Painel de controle oculto */}
            {showPanel && (
              <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
                <div className="bg-card border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Controle</span>
                    <button onClick={closePanel} className="p-1 hover:bg-muted rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-3 border-y">
                    <span className="text-sm">Sistema de Pagamento</span>
                    <Switch
                      checked={isPaymentEnabled}
                      onCheckedChange={togglePayment}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isPaymentEnabled ? "Ativo" : "Desativado - erro genérico será exibido"}
                  </div>
                </div>
              </div>
            )}

            <Button
              type="button"
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
