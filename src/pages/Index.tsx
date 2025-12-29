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
      <header className="py-12 px-4 sm:px-6 lg:px-8 text-center animate-fade-in bg-background">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground mb-4 tracking-tight">
          CAÇAMBAS DE ENTULHOS
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground font-medium">
          Escolha o tamanho ideal para sua caçamba
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
          <div className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Ambiente Seguro
          </div>
          <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Pagamento Protegido
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
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
