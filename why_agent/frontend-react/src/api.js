import { clearSession, getToken } from "./auth.js";

export async function fetchJSON(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    clearSession();
    window.location.href = "/app/login";
    throw new Error("session expired");
  }
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export const getTransactions = () => fetchJSON("/transactions");
export const getTransaction = (id) => fetchJSON(`/transactions/${id}`);
export const getEvaluation = () => fetchJSON("/evaluation");

export const askWhy = (id, question) =>
  fetchJSON(`/transactions/${id}/why`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

export const simulate = (id, body) =>
  fetchJSON(`/transactions/${id}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export function inr(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
