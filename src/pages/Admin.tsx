import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ArrowLeft,
  TrendingUp,
  CheckCircle2,
  Copy,
  KeyRound,
  Zap,
  AlertCircle,
  Lock,
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WEBHOOK_BASE = `${SUPABASE_URL}/functions/v1/payment-webhook`;

type Provider = "podpay" | "risepay" | "masterfy" | "expfy" | "zuckpay" | "veopag" | "pix_static";

const PROVIDER_LABELS: Record<Provider, string> = {
  podpay: "PodPay",
  risepay: "RisePay",
  masterfy: "MasterFy",
  expfy: "EXPFY",
  zuckpay: "ZuckPay",
  veopag: "VeoPag",
  pix_static: "PIX Estático",
};

const PROVIDER_ORDER: Provider[] = ["podpay", "risepay", "masterfy", "expfy", "zuckpay", "veopag", "pix_static"];

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
  veopag: [
    { key: "veopag_client_id", label: "Client ID" },
    { key: "veopag_client_secret", label: "Client Secret" },
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
  const [revealedSecret, setRevealedSecret] = useState<{ url: string; secret: string; provider: Provider } | null>(null);
  const [rotatingWebhook, setRotatingWebhook] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; detail?: string | null; took_ms?: number } | null>(null);

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
        if ((error as any)?.context?.status === 429) {
          throw new Error("Muitas tentativas. Aguarde alguns minutos.");
        }
        throw error;
      }
      if (!resp?.success && resp?.message && !("secret" in (resp || {})) && !("detail" in (resp || {}))) {
        throw new Error(resp?.message || "Falha");
      }
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

  const rotateWebhookSecret = async (p: Provider) => {
    setRotatingWebhook(true);
    try {
      const resp = await callAdmin({ action: "rotate_webhook_secret", provider: p });
      if (resp?.secret) {
        setRevealedSecret({ url: resp.webhook_url, secret: resp.secret, provider: p });
        await loadDashboard();
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "", variant: "destructive" });
    } finally {
      setRotatingWebhook(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await callAdmin({ action: "test_gateway", provider: currentProvider });
      setTestResult({
        success: !!resp?.success,
        message: resp?.message || (resp?.success ? "OK" : "Falha"),
        detail: resp?.detail ?? null,
        took_ms: resp?.took_ms,
      });
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || "Erro" });
    } finally {
      setTesting(false);
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

  const copyToClipboard = (text: string, label = "Copiado") => {
    navigator.clipboard.writeText(text);
    toast({ title: label });
  };

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

        {/* Gateways — MOVIDO PARA CIMA */}
        <Card>
          <CardHeader>
            <CardTitle>Gateways</CardTitle>
            <CardDescription>
              Clique em uma gateway para configurar chaves, gerar webhook ou defini-la como ativa.
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
                    className={`relative text-left p-4 rounded-xl border transition hover:shadow-md hover:border-primary/60 ${
                      isActive ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/40" : "border-border bg-card"
                    }`}
                  >
                    {/* BOLA VERDE de gateway ativa */}
                    {isActive && (
                      <span className="absolute top-3 right-3 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                      </span>
                    )}
                    <div className="flex items-start justify-between mb-2 pr-5">
                      <span className="font-semibold text-base">{PROVIDER_LABELS[p]}</span>
                      <div className="flex flex-col items-end gap-1">
                        {isActive && (
                          <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px]">Ativa</Badge>
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

        {/* Sistema de pagamento — MOVIDO PARA BAIXO com abas */}
        <Card>
          <CardHeader>
            <CardTitle>Sistema de pagamento</CardTitle>
            <CardDescription>Controle geral e testes da gateway ativa.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="control">
              <TabsList className="grid grid-cols-2 w-full max-w-md">
                <TabsTrigger value="control">Controle</TabsTrigger>
                <TabsTrigger value="test">Sincronização / Teste</TabsTrigger>
              </TabsList>

              <TabsContent value="control" className="pt-4">
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
              </TabsContent>

              <TabsContent value="test" className="pt-4">
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border bg-card flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs text-muted-foreground">Gateway ativa</p>
                      <p className="font-semibold flex items-center gap-2">
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        {PROVIDER_LABELS[currentProvider]}
                      </p>
                    </div>
                    <Button onClick={runTest} disabled={testing}>
                      {testing ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testando…</>
                      ) : (
                        <><Zap className="w-4 h-4 mr-2" /> Testar gateway ativa</>
                      )}
                    </Button>
                  </div>
                  {testResult && (
                    <div
                      className={`p-3 rounded-lg border ${
                        testResult.success
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-destructive/40 bg-destructive/5"
                      }`}
                    >
                      <p className="font-semibold flex items-center gap-2">
                        {testResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-destructive" />
                        )}
                        {testResult.success ? "Sincronização OK" : "Falha"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">{testResult.message}</p>
                      {testResult.detail && (
                        <p className="text-xs font-mono break-all mt-2 opacity-80">
                          {String(testResult.detail).slice(0, 160)}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    O teste envia uma transação de R$ 5,00 fictícia para a gateway ativa apenas para
                    validar credenciais e conectividade. Nenhum pedido real é criado.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
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
        <p className="text-xs text-muted-foreground text-center pb-6 flex items-center justify-center gap-2">
          <Lock className="w-3 h-3" />
          Sessão expira ao fechar a aba. Painel protegido por senha + limite de tentativas.
        </p>
      </main>

      {/* Modal por gateway */}
      <Dialog open={!!selectedProvider} onOpenChange={(o) => !o && setSelectedProvider(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {selectedProvider && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {PROVIDER_LABELS[selectedProvider]}
                  {currentProvider === selectedProvider && (
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
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
                    </div>
                  );
                })}

                {selectedProvider !== "pix_static" && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <KeyRound className="w-3.5 h-3.5" /> Webhook
                      </Label>
                      <Badge
                        variant={
                          data?.secrets?.[`webhook_secret_${selectedProvider}`]?.configured
                            ? "default"
                            : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {data?.secrets?.[`webhook_secret_${selectedProvider}`]?.configured
                          ? "Secret ativo"
                          : "Sem secret"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Gere um secret único. Ele será exibido <b>apenas uma vez</b>. Cole a URL completa
                      no painel da {PROVIDER_LABELS[selectedProvider]} — requisições sem o secret
                      correto são bloqueadas.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${WEBHOOK_BASE}?provider=${selectedProvider}`}
                        className="h-9 text-xs font-mono"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(`${WEBHOOK_BASE}?provider=${selectedProvider}`, "URL base copiada")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => rotateWebhookSecret(selectedProvider)}
                      disabled={rotatingWebhook}
                    >
                      {rotatingWebhook ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando…</>
                      ) : (
                        <><KeyRound className="w-4 h-4 mr-2" />
                          {data?.secrets?.[`webhook_secret_${selectedProvider}`]?.configured
                            ? "Gerar novo secret (invalida o anterior)"
                            : "Gerar secret do webhook"}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {currentProvider !== selectedProvider ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground text-center w-full">
                    Esta é a gateway ativa no checkout.
                  </p>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal one-time reveal do webhook secret */}
      <Dialog open={!!revealedSecret} onOpenChange={(o) => !o && setRevealedSecret(null)}>
        <DialogContent className="max-w-md">
          {revealedSecret && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-emerald-500" />
                  </div>
                  Webhook cadastrado
                </DialogTitle>
                <DialogDescription>
                  Aqui está o secret do seu webhook. Ele é exibido apenas neste momento. Guarde em
                  um local seguro para validar as notificações enviadas ao seu endpoint.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label className="text-xs">Secret</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      readOnly
                      value={revealedSecret.secret}
                      className="h-10 font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(revealedSecret.secret, "Secret copiado")}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <Copy className="w-4 h-4 mr-1" /> Copiar
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">URL completa (cole no painel da gateway)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      readOnly
                      value={revealedSecret.url}
                      className="h-10 font-mono text-[11px]"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(revealedSecret.url, "URL copiada")}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Se você perder esse secret, precisará gerar um novo webhook.
                </p>
              </div>
              <DialogFooter>
                <Button
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  onClick={() => setRevealedSecret(null)}
                >
                  OK
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
