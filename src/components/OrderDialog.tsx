import { useState } from "react";
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

const OrderDialog = ({ open, onOpenChange, product }: OrderDialogProps) => {
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const { toast } = useToast();

  const priceValue = parseFloat(product.price.replace("R$", "").replace(".", "").replace(",", ".").trim());
  const total = priceValue * quantity;

  const formatDocument = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    
    if (numbers.length <= 11) {
      // CPF format: 000.000.000-00
      return numbers
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      // CNPJ format: 00.000.000/0000-00
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

  const handleSubmit = () => {
    try {
      orderSchema.parse({ name, document });
      
      // Success - here you would normally process the order
      toast({
        title: "Pedido realizado!",
        description: `${quantity} x ${product.title} - Total: R$ ${total.toFixed(2).replace(".", ",")}`,
      });
      
      // Reset and close
      setQuantity(1);
      setName("");
      setDocument("");
      onOpenChange(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erro no formulário",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Finalizar Pedido</DialogTitle>
        </DialogHeader>

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
          >
            Pagar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDialog;
