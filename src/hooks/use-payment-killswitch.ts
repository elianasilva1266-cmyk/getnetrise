import { useState, useEffect, useCallback } from "react";

const KILLSWITCH_KEY = "pks_e7x9z";
const PROVIDER_KEY = "ppr_e7x9z";
const CLICK_THRESHOLD = 7;
const CLICK_TIMEOUT = 2000;

export type PaymentProvider = "risepay" | "zuckpay";

export const usePaymentKillswitch = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [provider, setProviderState] = useState<PaymentProvider>("risepay");
  const [showPanel, setShowPanel] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(KILLSWITCH_KEY);
    if (stored === "0") {
      setIsEnabled(false);
    }
    const storedProvider = localStorage.getItem(PROVIDER_KEY);
    if (storedProvider === "zuckpay" || storedProvider === "risepay") {
      setProviderState(storedProvider);
    }
  }, []);

  const togglePayment = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    localStorage.setItem(KILLSWITCH_KEY, enabled ? "1" : "0");
  }, []);

  const setProvider = useCallback((p: PaymentProvider) => {
    setProviderState(p);
    localStorage.setItem(PROVIDER_KEY, p);
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
  };
};
