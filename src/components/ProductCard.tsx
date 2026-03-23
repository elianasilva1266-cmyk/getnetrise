import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Shield } from "lucide-react";
import OrderDialog from "./OrderDialog";

interface ProductCardProps {
  title: string;
  price: string;
  image: string;
  size: string;
  originalPrice?: string;
}

const ProductCard = ({ title, price, image, size, originalPrice }: ProductCardProps) => {
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);

  return (
    <>
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 bg-card border border-border/60 relative rounded-xl">
        {originalPrice && (
          <div className="absolute top-3 left-3 z-10 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full shadow-lg">
            PROMOÇÃO
          </div>
        )}
        <CardContent className="p-6">
          <div className="relative w-full aspect-square mb-5 mx-auto max-w-[220px]">
            <div className="absolute inset-0 rounded-2xl overflow-hidden bg-muted shadow-inner">
              <img
                src={image}
                alt={title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          </div>
          
          <div className="text-center space-y-3">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">{title}</h3>
            <div>
              {originalPrice && (
                <p className="text-sm text-muted-foreground line-through">{originalPrice}</p>
              )}
              <p className="text-3xl font-extrabold text-primary">{price}</p>
            </div>
            
            <Button
              type="button"
              onClick={() => setOrderDialogOpen(true)}
              className="w-full gap-2 transition-all duration-300 font-semibold text-base rounded-lg shadow-md hover:shadow-lg"
              size="lg"
            >
              <ShoppingCart className="w-5 h-5" />
              Pedir Agora
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Shield className="w-3.5 h-3.5 text-secondary" />
              <span>Pagamento seguro via PIX</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <OrderDialog
        open={orderDialogOpen}
        onOpenChange={setOrderDialogOpen}
        product={{ title, price, size }}
      />
    </>
  );
};

export default ProductCard;
