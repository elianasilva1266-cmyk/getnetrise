import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const CLICK_THRESHOLD = 7;
const CLICK_TIMEOUT = 2000;

export type PaymentProvider = "risepay" | "zuckpay";

export const usePaymentKillswitch = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [provider, setProviderState] = useState<PaymentProvider>("risepay");
  const [showPanel, setShowPanel] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  // Carrega configurações globais e escuta mudanças em tempo real
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", ["payment_provider", "payment_enabled"]);
      if (!mounted || !data) return;
      for (const row of data) {
        if (row.key === "payment_enabled") setIsEnabled(row.value !== "0");
        if (row.key === "payment_provider" && (row.value === "risepay" || row.value === "zuckpay")) {
          setProviderState(row.value);
        }
      }
    };
    load();

    const channel = supabase
      .channel(`app_settings_changes_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (!row) return;
          if (row.key === "payment_enabled") setIsEnabled(row.value !== "0");
          if (row.key === "payment_provider" && (row.value === "risepay" || row.value === "zuckpay")) {
            setProviderState(row.value);
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const persist = async (key: string, value: string) => {
    await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  };

  const togglePayment = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    persist("payment_enabled", enabled ? "1" : "0");
  }, []);

  const setProvider = useCallback((p: PaymentProvider) => {
    setProviderState(p);
    persist("payment_provider", p);
  }, []);

  const saveSecret = useCallback(async (key: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, error: "Valor vazio" };
    const { error } = await supabase
      .from("payment_secrets" as any)
      .upsert({ key, value: trimmed, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const handleSecretClick = useCallback(() => {
    const now = Date.now();

    if (now - lastClickTime > CLICK_TIMEOUT) {
      setClickCount(1);
    } else {
      setClickCount(prev => prev + 1);
    }

    setLastClickTime(now);

    if (clickCount + 1 >= CLICK_THRESHOLD) {
      setShowPanel(true);
      setClickCount(0);
    }
  }, [clickCount, lastClickTime]);

  const closePanel = useCallback(() => {
    setShowPanel(false);
  }, []);

  return {
    isPaymentEnabled: isEnabled,
    provider,
    setProvider,
    showPanel,
    handleSecretClick,
    togglePayment,
    closePanel,
    saveSecret,
  };
};
