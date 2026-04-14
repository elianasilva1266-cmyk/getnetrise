import ProductCard from "@/components/ProductCard";
import cacamba3m from "@/assets/cacamba-3m.avif";
import cacamba4m from "@/assets/cacamba-4m-real.jpg";
import cacamba5m from "@/assets/cacamba-5m-real.webp";
import cacamba7m from "@/assets/cacamba-7m-real.jpg";
import cacamba10m from "@/assets/cacamba-10m-real.webp";
import cacamba26m from "@/assets/cacamba-26m.avif";
import { Shield, Lock, Truck, Clock } from "lucide-react";

const Index = () => {
  const products = [
    {
      id: 1,
      title: "CAÇAMBA DE 3M³",
      size: "3m³",
      price: "R$ 240,00",
      originalPrice: "R$ 290,00",
      image: cacamba3m,
    },
    {
      id: 2,
      title: "CAÇAMBA DE 4M³",
      size: "4m³",
      price: "R$ 290,00",
      image: cacamba4m,
    },
    {
      id: 3,
      title: "CAÇAMBA DE 5M³",
      size: "5m³",
      price: "R$ 340,00",
      image: cacamba5m,
    },
    {
      id: 4,
      title: "CAÇAMBA DE 7M³",
      size: "7m³",
      price: "R$ 380,00",
      image: cacamba7m,
    },
    {
      id: 5,
      title: "CAÇAMBA DE 10M³",
      size: "10m³",
      price: "R$ 460,00",
      image: cacamba10m,
    },
    {
      id: 6,
      title: "CAÇAMBA DE 26M³",
      size: "26m³",
      price: "R$ 900,00",
      image: cacamba26m,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top security bar */}
      <div className="bg-primary text-primary-foreground py-2 px-4">
        <div className="container mx-auto flex items-center justify-center gap-6 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>SSL Seguro</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>Pagamento Protegido</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" />
            <span>Entrega Rápida</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Suporte 24h</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="py-16 px-4 sm:px-6 lg:px-8 text-center bg-gradient-to-b from-muted/80 to-background">
        <div className="container mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-secondary/10 text-secondary px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
            <Shield className="w-4 h-4" />
            Compra 100% Segura
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground mb-4 tracking-tight leading-tight">
            CAÇAMBAS DE ENTULHOS
          </h1>
          <p className="text-lg text-muted-foreground font-medium max-w-xl mx-auto">
            Escolha o tamanho ideal para sua caçamba. Pagamento via PIX com confirmação instantânea.
          </p>
        </div>
      </header>

      {/* Products */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {products.map((product, index) => (
            <div
              key={product.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <ProductCard
                title={product.title}
                size={product.size}
                price={product.price}
                originalPrice={(product as any).originalPrice}
                image={product.image}
              />
            </div>
          ))}
        </div>
      </main>

      {/* Footer trust */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-secondary" />
            <span>Ambiente Seguro</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-secondary" />
            <span>Dados Criptografados</span>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-secondary" />
            <span>Entrega Garantida</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
