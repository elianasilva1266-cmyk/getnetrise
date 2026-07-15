const KEY = "__admin_pw__";

export const getAdminPassword = (): string | null => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const setAdminPassword = (pw: string) => {
  try {
    sessionStorage.setItem(KEY, pw);
  } catch {
    /* ignore */
  }
};

export const clearAdminPassword = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
