import ProductCard from "@/components/ProductCard";
import cacamba3m from "@/assets/cacamba-3m.avif";
import cacamba4m from "@/assets/cacamba-4m-real.jpg";
import cacamba5m from "@/assets/cacamba-5m-real.webp";
import cacamba7m from "@/assets/cacamba-7m-real.jpg";
import cacamba10m from "@/assets/cacamba-10m-real.webp";
import cacamba26m from "@/assets/cacamba-26m.avif";

const Index = () => {
  const products = [
    {
      id: 1,
      title: "CAÇAMBA DE 3M³",
      size: "3m³",
      price: "R$ 260,00",
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
    <div className="min-h-screen bg-muted/30">
      <header className="py-8 px-4 sm:px-6 lg:px-8 text-center animate-fade-in bg-background">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mb-3 tracking-tight">
          CAÇAMBAS DE ENTULHOS
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground font-medium">
          Escolha o tamanho ideal para sua obra
        </p>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {products.map((product, index) => (
            <div
              key={product.id}
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              <ProductCard
                title={product.title}
                size={product.size}
                price={product.price}
                image={product.image}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Index;
