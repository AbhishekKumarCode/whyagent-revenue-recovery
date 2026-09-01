import { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authApi.getStoredUser());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = authApi.getToken();
    if (!token) {
      setReady(true);
      return;
    }
    // Verify the stored token is still a real, live session on the server rather
    // than trusting whatever's cached in localStorage.
    fetch("/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("expired");
        return res.json();
      })
      .then((u) => setUser(u))
      .catch(() => {
        authApi.clearSession();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = async (email, password) => setUser(await authApi.login(email, password));
  const register = async (email, password, name) => setUser(await authApi.register(email, password, name));
  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, ready, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
