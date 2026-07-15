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
import { useToast } from "@/hooks/use-toast";
import { getAdminPassword, clearAdminPassword } from "@/lib/admin-session";
import { Loader2, LogOut, RefreshCw, ShieldCheck, ArrowLeft, TrendingUp } from "lucide-react";

type Provider = "risepay" | "zuckpay" | "pix_static" | "masterfy" | "expfy" | "podpay";
const PROVIDER_LABELS: Record<Provider, string> = {
  risepay: "RisePay",
  zuckpay: "ZuckPay",
  masterfy: "MasterFy",
  expfy: "EXPFY",
  podpay: "PodPay",
  pix_static: "PIX Estático",
};

const SECRET_FIELDS: { key: string; label: string; provider: Provider | "all"; type?: string }[] = [
  { key: "pix_static_key", label: "Chave PIX Estática", provider: "pix_static", type: "text" },
  { key: "risepay_token", label: "RisePay — Token Privado", provider: "risepay" },
  { key: "zuckpay_client_id", label: "ZuckPay — Client ID", provider: "zuckpay" },
  { key: "zuckpay_client_secret", label: "ZuckPay — Client Secret", provider: "zuckpay" },
  { key: "masterfy_api_key", label: "MasterFy — API Key", provider: "masterfy" },
  { key: "expfy_public_key", label: "EXPFY — Public Key", provider: "expfy" },
  { key: "expfy_secret_key", label: "EXPFY — Secret Key", provider: "expfy" },
  { key: "podpay_api_key", label: "PodPay — API Key", provider: "podpay" },
];

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
      toast({ title: `Provedor alterado`, description: PROVIDER_LABELS[p] });
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
      toast({ title: "Chave atualizada" });
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

  const providers = useMemo(() => Object.keys(PROVIDER_LABELS) as Provider[], []);

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
        {/* Faturamento */}
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-3 bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Faturamento acumulado (todas gateways)
              </CardDescription>
              <CardTitle className="text-4xl">
                {fmtBRL(data?.revenue.total_cents ?? 0)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {data?.revenue.count ?? 0} pedido{(data?.revenue.count ?? 0) === 1 ? "" : "s"} pago{(data?.revenue.count ?? 0) === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>

          {providers.map((p) => {
            const stats = data?.revenue.by_provider?.[p] ?? { total_cents: 0, count: 0 };
            return (
              <Card key={p}>
                <CardHeader className="pb-2">
                  <CardDescription>{PROVIDER_LABELS[p]}</CardDescription>
                  <CardTitle className="text-2xl">{fmtBRL(stats.total_cents)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {stats.count} pedido{stats.count === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Kill switch & provedor */}
        <Card>
          <CardHeader>
            <CardTitle>Configuração de pagamentos</CardTitle>
            <CardDescription>Ativa/desativa o botão de pagamento e escolhe a gateway atual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <Label className="font-semibold">Sistema de pagamento</Label>
                <p className="text-sm text-muted-foreground">
                  {paymentEnabled ? "Ativo — clientes podem pagar" : "Desativado — erro genérico exibido"}
                </p>
              </div>
              <Switch
                checked={paymentEnabled}
                onCheckedChange={togglePayment}
                disabled={savingKey === "payment_enabled"}
              />
            </div>

            <div>
              <Label className="font-semibold mb-2 block">Provedor ativo</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {providers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    disabled={savingKey === "payment_provider"}
                    className={`p-3 rounded-lg border text-sm font-medium transition ${
                      currentProvider === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Atualizado: {fmtDate(data?.settings?.payment_provider?.updated_at ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Secrets */}
        <Card>
          <CardHeader>
            <CardTitle>Chaves das gateways</CardTitle>
            <CardDescription>
              Valores nunca são exibidos por segurança — mostramos apenas se estão configurados. Digite para substituir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {SECRET_FIELDS.map((f) => {
              const info = data?.secrets?.[f.key];
              const isConfigured = !!info?.configured;
              return (
                <div key={f.key} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">{f.label}</Label>
                    <Badge variant={isConfigured ? "default" : "secondary"}>
                      {isConfigured ? "Configurada" : "Não configurada"}
                    </Badge>
                  </div>
                  {f.key === "pix_static_key" && info?.value && (
                    <p className="text-xs text-muted-foreground font-mono break-all">
                      Atual: {info.value}
                    </p>
                  )}
                  {info?.updated_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Atualizado: {fmtDate(info.updated_at)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type={f.type === "text" ? "text" : "password"}
                      autoComplete="off"
                      placeholder={isConfigured ? "Digite novo valor para substituir" : "Cole o valor da chave"}
                      value={inputs[f.key] || ""}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="h-9 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => saveSecret(f.key)}
                      disabled={!inputs[f.key]?.trim() || savingKey === f.key}
                    >
                      {savingKey === f.key ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                    </Button>
                  </div>
                </div>
              );
            })}
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
    </div>
  );
};

export default AdminPage;
