import { useEffect, useState } from "react";

/** The time, renewed every `every` ms, so "starts in 5 minutes" stays right while a page is open */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
