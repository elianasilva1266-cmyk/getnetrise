import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getAdminPassword, clearAdminPassword } from "@/lib/admin-session";
import { Loader2, LogOut, RefreshCw, ShieldCheck, ArrowLeft, TrendingUp, CheckCircle2 } from "lucide-react";

type Provider = "podpay" | "risepay" | "masterfy" | "expfy" | "zuckpay" | "pix_static";

const PROVIDER_LABELS: Record<Provider, string> = {
  podpay: "PodPay",
  risepay: "RisePay",
  masterfy: "MasterFy",
  expfy: "EXPFY",
  zuckpay: "ZuckPay",
  pix_static: "PIX Estático",
};

// Ordem solicitada pelo cliente
const PROVIDER_ORDER: Provider[] = ["podpay", "risepay", "masterfy", "expfy", "zuckpay", "pix_static"];

// Campos de chave por gateway
type SecretField = { key: string; label: string; type?: "password" | "text" };
const PROVIDER_SECRETS: Record<Provider, SecretField[]> = {
  podpay: [{ key: "podpay_api_key", label: "API Key" }],
  risepay: [{ key: "risepay_token", label: "Token Privado" }],
  masterfy: [{ key: "masterfy_api_key", label: "API Key" }],
  expfy: [
    { key: "expfy_public_key", label: "Public Key" },
    { key: "expfy_secret_key", label: "Secret Key" },
  ],
  zuckpay: [
    { key: "zuckpay_client_id", label: "Client ID" },
    { key: "zuckpay_client_secret", label: "Client Secret" },
  ],
  pix_static: [{ key: "pix_static_key", label: "Chave PIX (aleatória/UUID)", type: "text" }],
};

interface DashboardData {
  settings: Record<string, { value: string; updated_at: string }>;
  secrets: Record<string, { configured: boolean; updated_at: string | null; value?: string }>;
  revenue: {
    by_provider: Record<string, { total_cents: number; count: number }>;
    total_cents: number;
    count: number;
  };
  recent_orders: Array<{
    provider: string;
    amount_cents: number;
    external_id: string;
    customer_document: string | null;
    created_at: string;
  }>;
}

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
};

const AdminPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password] = useState(() => getAdminPassword());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!password) navigate("/", { replace: true });
  }, [password, navigate]);

  const callAdmin = useCallback(
    async (body: Record<string, unknown>) => {
      if (!password) throw new Error("Sessão expirada");
      const { data: resp, error } = await supabase.functions.invoke("admin-config", {
        body,
        headers: { "x-admin-password": password },
      });
      if (error) {
        if ((error as any)?.context?.status === 401) {
          clearAdminPassword();
          navigate("/", { replace: true });
        }
        throw error;
      }
      if (!resp?.success) throw new Error(resp?.message || "Falha");
      return resp;
    },
    [password, navigate],
  );

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const resp = await callAdmin({ action: "get_dashboard" });
      setData(resp.data);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e?.message || "", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [callAdmin, toast]);

  useEffect(() => {
    if (password) loadDashboard();
  }, [password, loadDashboard]);

  const currentProvider = (data?.settings?.payment_provider?.value ?? "risepay") as Provider;
  const paymentEnabled = data?.settings?.payment_enabled?.value !== "0";

  const togglePayment = async (enabled: boolean) => {
    setSavingKey("payment_enabled");
    try {
      await callAdmin({ action: "set_setting", key: "payment_enabled", value: enabled ? "1" : "0" });
      toast({ title: enabled ? "Pagamentos ativados" : "Pagamentos desativados" });
      await loadDashboard();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const setProvider = async (p: Provider) => {
    setSavingKey("payment_provider");
    try {
      await callAdmin({ action: "set_setting", key: "payment_provider", value: p });
      toast({ title: `Gateway ativa`, description: PROVIDER_LABELS[p] });
      await loadDashboard();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const saveSecret = async (key: string) => {
    const val = (inputs[key] || "").trim();
    if (!val) return;
    setSavingKey(key);
    try {
      await callAdmin({ action: "set_secret", key, value: val });
      setInputs((prev) => ({ ...prev, [key]: "" }));
      toast({ title: "Chave atualizada com sucesso" });
      await loadDashboard();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const logout = () => {
    clearAdminPassword();
    navigate("/", { replace: true });
  };

  const providerHasAllSecrets = useCallback(
    (p: Provider) => PROVIDER_SECRETS[p].every((f) => data?.secrets?.[f.key]?.configured),
    [data],
  );

  if (!password) return null;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold">Painel Admin</h1>
              <p className="text-xs text-muted-foreground">Controle interno · sessão temporária</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Site
            </Button>
            <Button variant="outline" size="sm" onClick={loadDashboard} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button variant="destructive" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Faturamento total */}
        <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Faturamento acumulado (todas as gateways)
            </CardDescription>
            <CardTitle className="text-4xl">{fmtBRL(data?.revenue.total_cents ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {data?.revenue.count ?? 0} pedido{(data?.revenue.count ?? 0) === 1 ? "" : "s"} pago
              {(data?.revenue.count ?? 0) === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        {/* Kill switch */}
        <Card>
          <CardHeader>
            <CardTitle>Sistema de pagamento</CardTitle>
            <CardDescription>Ativa ou desativa o botão de pagar no checkout.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <Label className="font-semibold">
                  {paymentEnabled ? "Ativo" : "Desativado"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {paymentEnabled ? "Clientes podem pagar" : "Erro genérico é exibido no checkout"}
                </p>
              </div>
              <Switch
                checked={paymentEnabled}
                onCheckedChange={togglePayment}
                disabled={savingKey === "payment_enabled"}
              />
            </div>
          </CardContent>
        </Card>

        {/* Gateways: um card por gateway (na ordem solicitada), clicável */}
        <Card>
          <CardHeader>
            <CardTitle>Gateways</CardTitle>
            <CardDescription>
              Clique em uma gateway para configurar suas chaves ou defini-la como ativa. Faturamento
              exibido é apenas dos pedidos aprovados registrados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {PROVIDER_ORDER.map((p) => {
                const stats = data?.revenue.by_provider?.[p] ?? { total_cents: 0, count: 0 };
                const isActive = currentProvider === p;
                const configured = providerHasAllSecrets(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedProvider(p)}
                    className={`text-left p-4 rounded-xl border transition hover:shadow-md hover:border-primary/60 ${
                      isActive ? "border-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-semibold text-base">{PROVIDER_LABELS[p]}</span>
                      <div className="flex flex-col items-end gap-1">
                        {isActive && (
                          <Badge className="bg-primary text-primary-foreground">Ativa</Badge>
                        )}
                        <Badge variant={configured ? "default" : "secondary"} className="text-[10px]">
                          {configured ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Configurada
                            </>
                          ) : (
                            "Sem chave"
                          )}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-2xl font-bold">{fmtBRL(stats.total_cents)}</div>
                    <div className="text-xs text-muted-foreground">
                      {stats.count} pedido{stats.count === 1 ? "" : "s"} pago
                      {stats.count === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pedidos recentes */}
        <Card>
          <CardHeader>
            <CardTitle>Pedidos pagos recentes</CardTitle>
            <CardDescription>Últimos 25 pagamentos aprovados registrados.</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.recent_orders?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum pedido pago registrado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 pr-3">Gateway</th>
                      <th className="py-2 pr-3">Documento</th>
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((o, i) => (
                      <tr key={`${o.provider}-${o.external_id}-${i}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(o.created_at)}</td>
                        <td className="py-2 pr-3">
                          {PROVIDER_LABELS[o.provider as Provider] ?? o.provider}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{o.customer_document || "—"}</td>
                        <td className="py-2 pr-3 font-mono text-xs truncate max-w-[160px]">
                          {o.external_id}
                        </td>
                        <td className="py-2 pr-3 text-right font-medium">
                          {fmtBRL(o.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />
        <p className="text-xs text-muted-foreground text-center pb-6">
          Sessão expira ao fechar a aba. As chaves e ajustes são aplicados globalmente em produção.
        </p>
      </main>

      {/* Modal por gateway */}
      <Dialog open={!!selectedProvider} onOpenChange={(o) => !o && setSelectedProvider(null)}>
        <DialogContent className="max-w-md">
          {selectedProvider && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {PROVIDER_LABELS[selectedProvider]}
                  {currentProvider === selectedProvider && (
                    <Badge className="bg-primary text-primary-foreground">Ativa</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Configure as chaves e defina esta gateway como ativa.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {PROVIDER_SECRETS[selectedProvider].map((f) => {
                  const info = data?.secrets?.[f.key];
                  return (
                    <div key={f.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{f.label}</Label>
                        <Badge variant={info?.configured ? "default" : "secondary"} className="text-[10px]">
                          {info?.configured ? "Configurada" : "Não configurada"}
                        </Badge>
                      </div>
                      {f.key === "pix_static_key" && info?.value && (
                        <p className="text-xs text-muted-foreground font-mono break-all">
                          Atual: {info.value}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Input
                          type={f.type ?? "password"}
                          autoComplete="off"
                          placeholder={info?.configured ? "Digite para substituir" : "Cole o valor"}
                          value={inputs[f.key] || ""}
                          onChange={(e) => setInputs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          className="h-10 text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => saveSecret(f.key)}
                          disabled={!inputs[f.key]?.trim() || savingKey === f.key}
                        >
                          {savingKey === f.key ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                        </Button>
                      </div>
                      {info?.updated_at && (
                        <p className="text-[10px] text-muted-foreground">
                          Atualizado: {fmtDate(info.updated_at)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {currentProvider !== selectedProvider && (
                  <Button
                    variant="default"
                    onClick={() => setProvider(selectedProvider)}
                    disabled={savingKey === "payment_provider"}
                    className="w-full"
                  >
                    {savingKey === "payment_provider" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>Definir {PROVIDER_LABELS[selectedProvider]} como gateway ativa</>
                    )}
                  </Button>
                )}
                {currentProvider === selectedProvider && (
                  <p className="text-sm text-muted-foreground text-center w-full">
                    Esta é a gateway ativa no checkout.
                  </p>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
