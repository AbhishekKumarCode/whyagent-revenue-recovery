import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = location.state?.from || "/dashboard";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const continueAsDemo = async () => {
    setError("");
    setBusy(true);
    try {
      await login("demo@razorpay.com", "demo1234");
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Demo login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-gutter">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-sm mb-lg">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-lg">
            W
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface leading-none">WHY Agent</h1>
            <p className="font-label-sm text-label-sm text-on-surface-variant">AI Payment Recovery</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-lg">
          <div className="flex bg-surface-container rounded-lg p-1 mb-md">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 py-2 rounded-md font-label-md text-label-md font-medium transition-colors ${
                mode === "login" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 py-2 rounded-md font-label-md text-label-md font-medium transition-colors ${
                mode === "register" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant"
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-md">
            {mode === "register" && (
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-xs">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg p-2.5 font-body-md text-body-md text-on-surface bg-transparent focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Ops Reviewer"
                />
              </div>
            )}
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-xs">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-outline-variant rounded-lg p-2.5 font-body-md text-body-md text-on-surface bg-transparent focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="you@razorpay.com"
              />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-xs">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-outline-variant rounded-lg p-2.5 font-body-md text-body-md text-on-surface bg-transparent focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="At least 6 characters"
              />
            </div>

            {error && (
              <div className="font-label-md text-label-md text-error bg-error-container/40 border border-error/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary hover:bg-primary/90 transition-colors text-white font-headline-sm text-headline-sm py-3 px-4 rounded-lg flex justify-center items-center gap-sm shadow-sm hover:shadow disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          <div className="flex items-center gap-sm my-md">
            <div className="h-px flex-1 bg-outline-variant" />
            <span className="font-label-sm text-label-sm text-on-surface-variant">or</span>
            <div className="h-px flex-1 bg-outline-variant" />
          </div>

          <button
            type="button"
            onClick={continueAsDemo}
            disabled={busy}
            className="w-full bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors text-on-surface font-label-md text-label-md py-2.5 px-4 rounded-lg disabled:opacity-60"
          >
            Continue as Demo Reviewer
          </button>
          <p className="font-label-sm text-label-sm text-on-surface-variant text-center mt-sm">
            Skips the form with a seeded account (demo@razorpay.com) — real login underneath, just pre-filled for reviewers.
          </p>
        </div>

        <p className="font-label-sm text-label-sm text-on-surface-variant text-center mt-md">
          Accounts and passwords are real (hashed, stored server-side) — the transaction data itself is synthetic demo data.
        </p>
      </div>
    </div>
  );
}
