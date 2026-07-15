import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const CLICK_THRESHOLD = 7;
const CLICK_TIMEOUT = 2000;
const ADMIN_PW_STORAGE = "__admin_pw__";

export type PaymentProvider = "risepay" | "zuckpay" | "pix_static" | "masterfy" | "expfy" | "podpay";

const DEFAULT_PIX_STATIC_KEY = "6b81c3ec-916f-4974-9ea4-3c2d12edc555";
const POLL_INTERVAL_MS = 30_000;

export const usePaymentKillswitch = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [provider, setProviderState] = useState<PaymentProvider>("risepay");
  const [pixStaticKey, setPixStaticKeyState] = useState<string>(DEFAULT_PIX_STATIC_KEY);
  const [showPanel, setShowPanel] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  // Fetch public config from edge function (no direct table access)
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-public-config", {
          body: {},
        });
        if (!mounted || error || !data) return;
        if (typeof data.payment_enabled === "boolean") setIsEnabled(data.payment_enabled);
        if (
          data.payment_provider === "risepay" ||
          data.payment_provider === "zuckpay" ||
          data.payment_provider === "pix_static" ||
          data.payment_provider === "masterfy" ||
          data.payment_provider === "expfy" ||
          data.payment_provider === "podpay"
        ) {
          setProviderState(data.payment_provider);
        }
        if (data.pix_static_key) setPixStaticKeyState(data.pix_static_key);
      } catch (e) {
        console.warn("Falha ao carregar config pública", e);
      }
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const getAdminPassword = (): string | null => {
    try {
      const cached = sessionStorage.getItem(ADMIN_PW_STORAGE);
      if (cached) return cached;
    } catch {
      /* ignore */
    }
    const pw = window.prompt("Senha do painel admin:");
    if (!pw) return null;
    try {
      sessionStorage.setItem(ADMIN_PW_STORAGE, pw);
    } catch {
      /* ignore */
    }
    return pw;
  };

  const clearAdminPassword = () => {
    try {
      sessionStorage.removeItem(ADMIN_PW_STORAGE);
    } catch {
      /* ignore */
    }
  };

  const callAdmin = async (body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
    const pw = getAdminPassword();
    if (!pw) return { ok: false, error: "Senha admin necessária" };
    const { data, error } = await supabase.functions.invoke("admin-config", {
      body,
      headers: { "x-admin-password": pw },
    });
    if (error) {
      if ((error as any)?.context?.status === 401) {
        clearAdminPassword();
        return { ok: false, error: "Senha admin inválida" };
      }
      return { ok: false, error: error.message };
    }
    if (!data?.success) {
      if (data?.message?.toLowerCase?.().includes("senha")) clearAdminPassword();
      return { ok: false, error: data?.message || "Falha na operação" };
    }
    return { ok: true };
  };

  const togglePayment = useCallback(async (enabled: boolean) => {
    const prev = isEnabled;
    setIsEnabled(enabled);
    const res = await callAdmin({ action: "set_setting", key: "payment_enabled", value: enabled ? "1" : "0" });
    if (!res.ok) {
      setIsEnabled(prev);
      window.alert(res.error || "Falha ao alterar");
    }
  }, [isEnabled]);

  const setProvider = useCallback(async (p: PaymentProvider) => {
    const prev = provider;
    setProviderState(p);
    const res = await callAdmin({ action: "set_setting", key: "payment_provider", value: p });
    if (!res.ok) {
      setProviderState(prev);
      window.alert(res.error || "Falha ao alterar");
    }
  }, [provider]);

  const saveSecret = useCallback(async (key: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, error: "Valor vazio" };
    const res = await callAdmin({ action: "set_secret", key, value: trimmed });
    if (res.ok && key === "pix_static_key") setPixStaticKeyState(trimmed);
    return res;
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
      const pw = getAdminPassword();
      if (!pw) {
        setClickCount(0);
        return;
      }
      setShowPanel(true);
      setClickCount(0);
    }
  }, [clickCount, lastClickTime]);

  const closePanel = useCallback(() => {
    setShowPanel(false);
    clearAdminPassword();
  }, []);

  return {
    isPaymentEnabled: isEnabled,
    provider,
    setProvider,
    pixStaticKey,
    showPanel,
    handleSecretClick,
    togglePayment,
    closePanel,
    saveSecret,
  };
};
