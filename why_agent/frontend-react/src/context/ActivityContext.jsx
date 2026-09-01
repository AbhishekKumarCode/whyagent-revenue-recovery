import { createContext, useCallback, useContext, useState } from "react";

const ActivityContext = createContext(null);
const MAX_ITEMS = 20;

// Two genuinely different lists — neither duplicates the Dashboard's "latest failed
// payments" view:
//  - actions: things that happened because of something YOU did this session
//    (ran a retry simulation, asked the agent a question)
//  - visits: pages/transactions YOU personally looked at, in order, so you can jump
//    back — like browser history, not a data feed.
export function ActivityProvider({ children }) {
  const [actions, setActions] = useState([]);
  const [visits, setVisits] = useState([]);

  const logAction = useCallback((entry) => {
    setActions((prev) => [{ ...entry, id: crypto.randomUUID(), at: Date.now() }, ...prev].slice(0, MAX_ITEMS));
  }, []);

  const logVisit = useCallback((entry) => {
    setVisits((prev) => {
      if (prev[0]?.path === entry.path) return prev; // dedupe consecutive re-renders of the same route
      return [{ ...entry, id: crypto.randomUUID(), at: Date.now() }, ...prev].slice(0, MAX_ITEMS);
    });
  }, []);

  return (
    <ActivityContext.Provider value={{ actions, visits, logAction, logVisit }}>{children}</ActivityContext.Provider>
  );
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used inside ActivityProvider");
  return ctx;
}
