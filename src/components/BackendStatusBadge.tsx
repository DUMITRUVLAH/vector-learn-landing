import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Status = "loading" | "connected" | "disconnected";

interface HealthResponse {
  ok: boolean;
  db?: string;
}

export function BackendStatusBadge() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) {
          if (alive) setStatus("disconnected");
          return;
        }
        const data: HealthResponse = await res.json();
        if (alive) setStatus(data.ok && data.db === "connected" ? "connected" : "disconnected");
      } catch {
        if (alive) setStatus("disconnected");
      }
    };
    void check();
    const interval = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (status === "loading") return null;

  const isUp = status === "connected";

  return (
    <div className="fixed bottom-4 left-4 z-40 pointer-events-none">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border bg-card/90 backdrop-blur px-2.5 py-1 text-[10px] font-semibold shadow-sm",
          isUp ? "border-success/30 text-success" : "border-destructive/30 text-destructive"
        )}
        role="status"
        aria-label={`Backend: ${status}`}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isUp ? "bg-success animate-pulse-soft" : "bg-destructive"
          )}
        />
        API: {isUp ? "connected" : "down"}
      </div>
    </div>
  );
}
