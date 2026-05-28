import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppScreen, SCREEN_LABEL, type ScreenId } from "./AppScreen";

export type PhoneOS = "ios" | "android";

const SCREENS: ScreenId[] = ["dashboard", "schedule", "homework", "payments"];

export function getNextScreen(current: ScreenId, direction: "next" | "prev"): ScreenId {
  const idx = SCREENS.indexOf(current);
  const next = direction === "next" ? idx + 1 : idx - 1;
  if (next < 0) return SCREENS[SCREENS.length - 1];
  if (next >= SCREENS.length) return SCREENS[0];
  return SCREENS[next];
}

interface PhoneMockupProps {
  initialScreen?: ScreenId;
}

export function PhoneMockup({ initialScreen = "dashboard" }: PhoneMockupProps) {
  const [os, setOs] = useState<PhoneOS>("ios");
  const [screen, setScreen] = useState<ScreenId>(initialScreen);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) < 40) return;
    setScreen((prev) => getNextScreen(prev, deltaX > 0 ? "prev" : "next"));
    touchStartX.current = null;
  };

  return (
    <div className="flex flex-col items-center">
      <div
        role="tablist"
        aria-label="Selectare sistem de operare"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 mb-6"
      >
        {(["ios", "android"] as PhoneOS[]).map((o) => (
          <button
            key={o}
            role="tab"
            aria-selected={os === o}
            onClick={() => setOs(o)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
              os === o ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            {o === "ios" ? "iOS" : "Android"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <button
          type="button"
          aria-label="Ecranul anterior"
          onClick={() => setScreen((p) => getNextScreen(p, "prev"))}
          className="touch-target rounded-full border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          className={cn(
            "relative w-[240px] sm:w-[280px] h-[480px] sm:h-[560px] rounded-[2.5rem] bg-foreground p-3 shadow-2xl",
            os === "ios" ? "rounded-[2.75rem]" : "rounded-[1.75rem]"
          )}
          data-testid={`phone-${os}`}
        >
          {os === "ios" ? (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 h-6 w-20 rounded-full bg-foreground z-10 flex items-center justify-center"
              aria-hidden
            >
              <span className="block h-1 w-1 rounded-full bg-background/40 ml-1" />
            </div>
          ) : (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-background/80 z-10"
              aria-hidden
            />
          )}

          <div
            className="h-full w-full rounded-[2rem] overflow-hidden bg-background"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <AppScreen screen={screen} />
          </div>
        </div>

        <button
          type="button"
          aria-label="Ecranul următor"
          onClick={() => setScreen((p) => getNextScreen(p, "next"))}
          className="touch-target rounded-full border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div role="tablist" aria-label="Indicator ecran" className="flex items-center gap-2 mt-5">
        {SCREENS.map((s) => {
          const meta = SCREEN_LABEL[s];
          const Icon = meta.icon;
          const active = s === screen;
          return (
            <button
              key={s}
              role="tab"
              aria-selected={active}
              aria-label={meta.label}
              onClick={() => setScreen(s)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
