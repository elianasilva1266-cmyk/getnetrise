import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { setAdminPassword } from "@/lib/admin-session";

const CLICK_THRESHOLD = 7;
const CLICK_TIMEOUT = 2000;

export type PaymentProvider = "risepay" | "zuckpay" | "pix_static" | "masterfy" | "expfy" | "podpay" | "veopag" | "caospay";

const DEFAULT_PIX_STATIC_KEY = "6b81c3ec-916f-4974-9ea4-3c2d12edc555";
const POLL_INTERVAL_MS = 30_000;

export const usePaymentKillswitch = () => {
  const navigate = useNavigate();
  const [isEnabled, setIsEnabled] = useState(true);
  const [provider, setProviderState] = useState<PaymentProvider>("risepay");
  const [pixStaticKey, setPixStaticKeyState] = useState<string>(DEFAULT_PIX_STATIC_KEY);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-public-config", { body: {} });
        if (!mounted || error || !data) return;
        if (typeof data.payment_enabled === "boolean") setIsEnabled(data.payment_enabled);
        if (
          data.payment_provider === "risepay" ||
          data.payment_provider === "zuckpay" ||
          data.payment_provider === "pix_static" ||
          data.payment_provider === "masterfy" ||
          data.payment_provider === "expfy" ||
          data.payment_provider === "podpay" ||
          data.payment_provider === "veopag" ||
          data.payment_provider === "caospay"
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

  const handleSecretClick = useCallback(() => {
    const now = Date.now();
    const newCount = now - lastClickTime > CLICK_TIMEOUT ? 1 : clickCount + 1;
    setLastClickTime(now);
    setClickCount(newCount);
    if (newCount >= CLICK_THRESHOLD) {
      setClickCount(0);
      setPasswordInput("");
      setPasswordError(null);
      setShowPasswordModal(true);
    }
  }, [clickCount, lastClickTime]);

  const closePasswordModal = useCallback(() => {
    setShowPasswordModal(false);
    setPasswordInput("");
    setPasswordError(null);
  }, []);

  const submitPassword = useCallback(async () => {
    if (!passwordInput.trim()) {
      setPasswordError("Digite a senha");
      return;
    }
    setVerifying(true);
    setPasswordError(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-config", {
        body: { action: "verify" },
        headers: { "x-admin-password": passwordInput },
      });
      if (error || !data?.success) {
        setPasswordError("Senha inválida");
        setVerifying(false);
        return;
      }
      setAdminPassword(passwordInput);
      setShowPasswordModal(false);
      setPasswordInput("");
      setVerifying(false);
      navigate("/admin");
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Erro");
      setVerifying(false);
    }
  }, [passwordInput, navigate]);

  return {
    isPaymentEnabled: isEnabled,
    provider,
    pixStaticKey,
    handleSecretClick,
    showPasswordModal,
    passwordInput,
    setPasswordInput,
    submitPassword,
    closePasswordModal,
    verifying,
    passwordError,
  };
};
