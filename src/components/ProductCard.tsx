import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import OrderDialog from "./OrderDialog";

interface ProductCardProps {
  title: string;
  price: string;
  image: string;
  size: string;
}

const ProductCard = ({ title, price, image, size }: ProductCardProps) => {
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);

  return (
    <>
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-xl animate-fade-in bg-card">
        <CardContent className="p-6">
          <div className="relative w-full aspect-square mb-4 mx-auto max-w-[220px]">
            <div className="absolute inset-0 rounded-full overflow-hidden bg-muted">
              <img
                src={image}
                alt={title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
            </div>
            <div className="absolute bottom-0 right-2 bg-background text-foreground px-3 py-1 rounded-2xl text-base font-bold shadow-lg border-2 border-border">
              {size}
            </div>
          </div>
          
          <div className="text-center space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">{title}</h3>
            <p className="text-2xl font-bold text-secondary">{price}</p>
            
            <Button 
              onClick={() => setOrderDialogOpen(true)}
              className="w-full gap-2 transition-all duration-300 hover:gap-3 font-semibold text-sm"
            >
              <ShoppingCart className="w-4 h-4" />
              Adicionar ao Carrinho
            </Button>
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
