import React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Mantém o erro visível no console para debug.
    console.error("[ErrorBoundary] Uncaught error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background text-foreground">
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-2xl mx-auto rounded-xl border bg-card p-8">
            <h1 className="text-2xl font-black tracking-tight">Ocorreu um erro</h1>
            <p className="mt-2 text-muted-foreground">
              Algo falhou ao processar sua ação (ex: ao clicar em pagar). Você pode recarregar e tentar novamente.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button onClick={this.handleReload} size="lg">
                Recarregar página
              </Button>
            </div>

            {this.state.error?.message ? (
              <details className="mt-6 rounded-lg bg-muted/40 p-4">
                <summary className="cursor-pointer font-medium">Detalhes técnicos</summary>
                <pre className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {this.state.error.message}
                </pre>
              </details>
            ) : null}
          </div>
        </section>
      </main>
    );
  }
}
