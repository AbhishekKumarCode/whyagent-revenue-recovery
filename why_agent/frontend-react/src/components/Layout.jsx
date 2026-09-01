import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useActivity } from "../context/ActivityContext.jsx";

const PAGE_TITLES = [
  { test: (p) => p === "/dashboard", title: "Dashboard", sub: "At-a-glance state of this recovery batch.", icon: "dashboard" },
  {
    test: (p) => p === "/transactions",
    title: "Transactions",
    sub: "Every failed UPI AutoPay payment and what the agent decided.",
    icon: "payments",
  },
  { test: (p) => p === "/evaluation", title: "Insights", sub: "Agent performance vs. naive baseline, on a held-out batch.", icon: "analytics" },
  { test: (p) => p === "/rules", title: "Settings", sub: "The agent's fixed, non-negotiable operating constraints.", icon: "settings" },
  {
    test: (p) => /\/why$/.test(p),
    title: "Live \"Why\" Q&A",
    sub: "Ask the agent to explain any decision, grounded in real data.",
    icon: "psychology",
  },
  {
    test: (p) => /^\/transactions\/[^/]+$/.test(p),
    title: "Transaction Deep-Dive",
    sub: "Full reasoning trace for one failed payment.",
    icon: "account_tree",
  },
];

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, setOpen]);
  return ref;
}

function NavLinks({ navLinkClass, onNavigate }) {
  return (
    <div className="flex flex-col gap-xs flex-grow">
      <NavLink to="/dashboard" className={navLinkClass} onClick={onNavigate}>
        <span className="material-symbols-outlined icon-fill text-[20px]" aria-hidden="true">dashboard</span>
        Dashboard
      </NavLink>
      <NavLink to="/transactions" className={navLinkClass} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">payments</span>
        Transactions
      </NavLink>
      <NavLink to="/evaluation" className={navLinkClass} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">analytics</span>
        Insights
      </NavLink>
      <NavLink to="/rules" className={navLinkClass} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">settings</span>
        Settings
      </NavLink>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const page = PAGE_TITLES.find((p) => p.test(location.pathname));
  const [connected, setConnected] = useState(null);
  const isTransactions = location.pathname === "/transactions";
  const { user, logout } = useAuth();
  const { actions, visits, logVisit } = useActivity();

  const [notifOpen, setNotifOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const notifRef = useOutsideClose(notifOpen, setNotifOpen);
  const historyRef = useOutsideClose(historyOpen, setHistoryOpen);

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  // Records a page/transaction visit purely from routing — this is YOUR browsing
  // history for the session, distinct from the Dashboard's "latest failed payments".
  useEffect(() => {
    if (page) {
      logVisit({ path: location.pathname, title: page.title, icon: page.icon });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const initials = (user?.name || user?.email || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch("/health").then((r) => !cancelled && setConnected(r.ok)).catch(() => !cancelled && setConnected(false));
    check();
    const interval = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-sm px-sm py-sm rounded-md font-body-md text-body-md transition-all duration-200 ease-in-out ${
      isActive
        ? "bg-secondary-container text-on-secondary-container font-semibold"
        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
    }`;

  const handleSearch = (e) => {
    const q = e.target.value;
    const next = new URLSearchParams(q ? { q } : {});
    navigate({ pathname: "/transactions", search: next.toString() }, { replace: isTransactions });
  };

  return (
    <div className="flex h-screen overflow-hidden text-on-surface bg-background">
      {/* SideNavBar — desktop */}
      <nav className="hidden md:flex flex-col h-full py-lg px-md gap-sm bg-surface border-r border-outline-variant w-[240px] sticky top-0 left-0 z-30">
        <div className="flex items-center gap-sm mb-xl px-sm">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold">W</div>
          <div>
            <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">WHY Agent</h1>
            <p className="font-label-sm text-label-sm text-on-surface-variant">AI Payment Recovery</p>
          </div>
        </div>

        <NavLinks navLinkClass={navLinkClass} onNavigate={() => {}} />

        <div className="mt-auto flex flex-col gap-xs pt-md border-t border-outline-variant">
          <a
            className="flex items-center gap-sm px-sm py-sm rounded-md text-on-surface-variant hover:bg-surface-container transition-colors font-body-md text-body-md"
            href="https://razorpay.com/buildathon/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">help</span>
            Support
          </a>
          <button
            onClick={handleLogout}
            className="flex items-center gap-sm px-sm py-sm rounded-md text-on-surface-variant hover:bg-surface-container hover:text-error transition-colors font-body-md text-body-md text-left"
            title={user ? `Signed in as ${user.email}` : "Logout"}
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>
            Logout
          </button>
        </div>
      </nav>

      {/* SideNavBar — mobile slide-over */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <nav className="relative flex flex-col h-full py-lg px-md gap-sm bg-surface w-[260px] shadow-xl">
            <div className="flex items-center justify-between mb-xl px-sm">
              <div className="flex items-center gap-sm">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold">W</div>
                <div>
                  <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">WHY Agent</h1>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">AI Payment Recovery</p>
                </div>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="p-xs text-on-surface-variant" aria-label="Close menu">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <NavLinks navLinkClass={navLinkClass} onNavigate={() => setMobileNavOpen(false)} />
            <div className="mt-auto flex flex-col gap-xs pt-md border-t border-outline-variant">
              <a
                className="flex items-center gap-sm px-sm py-sm rounded-md text-on-surface-variant hover:bg-surface-container transition-colors font-body-md text-body-md"
                href="https://razorpay.com/buildathon/"
                target="_blank"
                rel="noreferrer"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">help</span>
                Support
              </a>
              <button
                onClick={handleLogout}
                className="flex items-center gap-sm px-sm py-sm rounded-md text-on-surface-variant hover:bg-surface-container hover:text-error transition-colors font-body-md text-body-md text-left"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>
                Logout
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full overflow-hidden w-full relative z-0">
        {/* TopNavBar */}
        <header className="flex justify-between items-center h-16 px-lg w-full z-40 bg-surface-container-lowest border-b border-outline-variant sticky top-0 gap-md">
          <div className="flex items-center gap-lg flex-1 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden text-on-surface-variant p-xs -ml-1 rounded-md hover:bg-surface-container"
              aria-label="Open menu"
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">menu</span>
            </button>
            <h1 className="md:hidden font-headline-md text-headline-md font-black text-on-surface shrink-0">WHY Agent</h1>
            <span className="hidden md:inline font-headline-sm text-headline-sm text-on-surface shrink-0">
              {page?.title || "WHY Agent"}
            </span>
            <div className="hidden md:flex items-center bg-surface-container rounded-md px-sm py-xs border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary w-64 transition-all">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden="true">search</span>
              <input
                className="bg-transparent border-none focus:ring-0 text-body-md font-body-md w-full px-sm outline-none text-on-surface placeholder:text-on-surface-variant"
                placeholder="Search transactions…"
                type="text"
                defaultValue={isTransactions ? searchParams.get("q") || "" : ""}
                onChange={handleSearch}
              />
            </div>
          </div>
          <div className="flex items-center gap-sm shrink-0">
            <div className="hidden sm:flex items-center gap-xs px-sm py-xs bg-surface-container-low rounded-full border border-outline-variant mr-sm">
              <div
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-tertiary-container animate-pulse" : connected === false ? "bg-error" : "bg-outline"
                }`}
              />
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {connected === null ? "Checking…" : connected ? "Live" : "Offline"}
              </span>
            </div>
            <span className="hidden lg:inline font-label-sm text-label-sm text-on-tertiary-container bg-tertiary-container/10 px-sm py-xs rounded-full border border-tertiary-container/20">
              Synthetic demo data
            </span>

            {/* Notifications — a log of things YOU did this session (simulations you
                ran, questions you asked) — not a re-list of dashboard data. */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setHistoryOpen(false);
                }}
                className="relative text-on-surface-variant hover:text-primary cursor-pointer transition-opacity active:opacity-70 p-xs rounded-full hover:bg-surface-container"
                title="Your session activity"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">notifications</span>
                {actions.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[10px] leading-none font-semibold w-4 h-4 rounded-full flex items-center justify-center">
                    {actions.length > 9 ? "9+" : actions.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
                  <div className="px-md py-sm border-b border-outline-variant bg-surface-container-low font-label-md text-label-md font-semibold text-on-surface">
                    Your Session Activity
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-outline-variant">
                    {actions.length === 0 && (
                      <div className="p-md text-on-surface-variant font-body-md text-body-md">
                        Nothing yet — run a retry simulation or ask the agent a "why" question and it'll show up here.
                      </div>
                    )}
                    {actions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setNotifOpen(false);
                          if (a.path) navigate(a.path);
                        }}
                        className="w-full text-left px-md py-sm hover:bg-surface-container-low transition-colors flex gap-sm items-start"
                      >
                        <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0" aria-hidden="true">
                          {a.icon || "bolt"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-body-md text-body-md text-on-surface leading-snug">{a.text}</div>
                          {a.sub && <div className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{a.sub}</div>}
                          <div className="font-label-sm text-label-sm text-outline mt-0.5">{timeAgo(a.at)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* History — pages/transactions YOU personally visited this session,
                like browser history, so you can jump back to what you were looking at. */}
            <div className="relative" ref={historyRef}>
              <button
                onClick={() => {
                  setHistoryOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="text-on-surface-variant hover:text-primary cursor-pointer transition-opacity active:opacity-70 p-xs rounded-full hover:bg-surface-container"
                title="Pages you've visited"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">history</span>
              </button>
              {historyOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
                  <div className="px-md py-sm border-b border-outline-variant bg-surface-container-low font-label-md text-label-md font-semibold text-on-surface">
                    Pages You've Visited
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-outline-variant">
                    {visits.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setHistoryOpen(false);
                          navigate(v.path);
                        }}
                        className="w-full text-left px-md py-sm hover:bg-surface-container-low transition-colors flex items-center gap-sm"
                      >
                        <span className="material-symbols-outlined text-on-surface-variant text-[18px] shrink-0" aria-hidden="true">
                          {v.icon || "history"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-body-md text-body-md text-on-surface truncate">{v.title}</div>
                          <div className="font-label-sm text-label-sm text-on-surface-variant font-mono truncate">{v.path}</div>
                        </div>
                        <span className="font-label-sm text-label-sm text-outline shrink-0">{timeAgo(v.at)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-label-md text-label-md font-semibold ml-sm border border-outline-variant"
              title={user ? `${user.name} · ${user.email}` : "Signed in"}
            >
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet context={{ pageSub: page?.sub }} />
        </main>
      </div>
    </div>
  );
}
