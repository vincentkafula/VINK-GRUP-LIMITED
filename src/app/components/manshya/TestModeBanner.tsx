import { useEffect, useState } from "react";
import { publicApi } from "./api";

/** Visible whenever the server runs in sandbox mode, so test data can never be mistaken for real money. Hidden in live mode. */
export function TestModeBanner() {
  const [mode, setMode] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    publicApi<{ payments_mode?: string; mode?: string }>("/health")
      .then((h) => { if (live) setMode(h.payments_mode ?? (h.mode === "live" ? "live" : "sandbox")); })
      .catch(() => { if (live) setMode("sandbox"); });   // if we cannot tell, assume test and say so
    return () => { live = false; };
  }, []);
  if (mode === null || mode === "live") return null;
  return <div className="testmode" role="status">TEST MODE · sandbox data only · no real money moves</div>;
}
