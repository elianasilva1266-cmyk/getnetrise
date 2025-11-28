import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";

interface ProductCardProps {
  title: string;
  price: string;
  image: string;
  size: string;
}

const ProductCard = ({ title, price, image, size }: ProductCardProps) => {
  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-xl animate-fade-in bg-card">
      <CardContent className="p-8">
        <div className="relative w-full aspect-square mb-6 mx-auto max-w-[280px]">
          <div className="absolute inset-0 rounded-full overflow-hidden bg-muted">
            <img
              src={image}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          </div>
          <div className="absolute bottom-0 right-4 bg-background text-foreground px-4 py-2 rounded-2xl text-lg font-bold shadow-lg border-2 border-border">
            {size}
          </div>
        </div>
        
        <div className="text-center space-y-4">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h3>
          <p className="text-3xl font-bold text-secondary">{price}</p>
          
          <Button 
            className="w-full gap-2 transition-all duration-300 hover:gap-3 font-semibold text-base"
            size="lg"
          >
            <ShoppingCart className="w-5 h-5" />
            Adicionar ao Carrinho
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductCard;
