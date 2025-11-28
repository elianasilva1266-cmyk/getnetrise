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
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-xl animate-fade-in border-border/50 bg-card">
      <CardContent className="p-0">
        <div className="relative overflow-hidden aspect-[4/3] bg-muted">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute top-3 right-3 bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
            {size}
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
            <p className="text-3xl font-black text-primary">{price}</p>
          </div>
          
          <Button 
            className="w-full gap-2 transition-all duration-300 hover:gap-3 font-semibold shadow-md"
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
