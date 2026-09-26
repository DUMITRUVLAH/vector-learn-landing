/**
 * Tooltip — cuvântul din spatele unei pictograme, la survolare.
 *
 * De ce există (owner, 26.09.2026, pe coada de finanțe): „când faci hover pe butoane să poți
 * vedea la ce acțiune se referă". Butoanele aveau deja `title`, dar tooltipul nativ al browserului
 * apare abia după 1–2 secunde, într-o casetă de sistem, lângă cursor — pe o bară de cinci
 * pictograme asta înseamnă că omul ghicește sau dă click aiurea înainte să apuce să citească.
 * Bula de aici apare în 120ms, arată ca restul produsului și merge și de la tastatură.
 *
 * Randată prin portal, cu poziție `fixed`: bara de acțiuni stă într-un tabel cu `overflow-x-auto`,
 * iar o bulă poziționată în interiorul rândului ar fi fost tăiată chiar de marginea tabelului.
 *
 * Accesibilitate: bula e `aria-hidden` — butonul își păstrează `aria-label`-ul complet (cu numărul
 * cererii), deci cititorul de ecran aude „Înregistrează plata pentru PAR-2026-0042", nu de două
 * ori eticheta scurtă. Tooltipul e un ajutor vizual, nu singura sursă de sens: un buton fără
 * `aria-label` nu devine accesibil fiindcă l-ai înfășurat aici.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Cât aștept înainte să arăt: destul cât să nu clipească la trecerea peste bară, destul de puțin
 *  cât să fie un răspuns la intenție, nu o pauză. */
const SHOW_DELAY_MS = 120;
/** Distanța dintre buton și bulă. */
const GAP_PX = 8;
/** Marginea minimă față de marginile ferestrei. */
const EDGE_PX = 8;

export type TooltipSide = "top" | "bottom";

export interface TooltipProps {
  /** Textul scurt care spune ce face butonul. */
  label: string;
  /** Preferința de poziție; dacă nu încape, se întoarce pe partea cealaltă. */
  side?: TooltipSide;
  /** Butonul (sau orice alt control) peste care se survolează. */
  children: ReactNode;
  /** Clase pentru învelișul care primește evenimentele, nu pentru bulă. */
  className?: string;
}

interface Anchor {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, width: r.width };
}

function Bubble({ anchor, label, side }: { anchor: Anchor; label: string; side: TooltipSide }) {
  const ref = useRef<HTMLDivElement>(null);
  // Poziția se poate calcula doar după ce știu cât de lată e bula, deci prima randare o ține
  // în afara ecranului, iar măsurarea (sincronă, înainte de paint) o aduce la locul ei.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const above = anchor.top - height - GAP_PX;
    const below = anchor.bottom + GAP_PX;
    let top = side === "top" ? above : below;
    if (top < EDGE_PX) top = below;
    if (top + height > window.innerHeight - EDGE_PX) top = Math.max(EDGE_PX, above);
    const left = Math.min(
      Math.max(EDGE_PX, anchor.left + anchor.width / 2 - width / 2),
      Math.max(EDGE_PX, window.innerWidth - width - EDGE_PX),
    );
    setPos({ top, left });
  }, [anchor, side, label]);

  return (
    <div
      ref={ref}
      role="tooltip"
      aria-hidden="true"
      data-slot="tooltip"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cn(
        "pointer-events-none fixed z-[60] max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5",
        "text-xs font-medium leading-snug text-popover-foreground shadow-md",
        pos ? "opacity-100" : "opacity-0",
      )}
    >
      {label}
    </div>
  );
}

export function Tooltip({ label, side = "top", children, className }: TooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Un click lasă butonul focusat. Fără semnul ăsta, `onFocus` ar re-aprinde bula imediat după
  // `onPointerDown` — adică exact peste modala tocmai deschisă. (`:focus-visible` ar răspunde la
  // aceeași întrebare, dar e o pseudo-clasă pe care nu o pot verifica în teste; un semn propriu
  // se comportă la fel în browser și în jsdom.)
  const viaPointer = useRef(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    cancel();
    setAnchor(null);
  }, [cancel]);

  const show = useCallback(
    (delay: number) => {
      cancel();
      const open = () => {
        const el = wrapRef.current;
        if (el) setAnchor(anchorOf(el));
      };
      if (delay <= 0) open();
      else timer.current = setTimeout(open, delay);
    },
    [cancel],
  );

  // Cât timp bula e deschisă, rândul se poate mișca sub ea: tabelul se derulează lateral, pagina
  // vertical. Recalculez în loc să ascund — altfel bula ar dispărea exact când omul citește.
  useEffect(() => {
    if (!anchor) return;
    const follow = () => {
      const el = wrapRef.current;
      if (el) setAnchor(anchorOf(el));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, hide]);

  useEffect(() => cancel, [cancel]);

  return (
    <span
      ref={wrapRef}
      className={cn("inline-flex", className)}
      // Pointer, nu mouse: pe telefon un „hover" nu există, dar browserul trimite oricum un
      // mouseenter sintetic după atingere — bula ar rămâne agățată pe ecran până la următoarea
      // atingere. Filtrată după `pointerType`, atingerea nu mai aprinde nimic.
      onPointerEnter={(e) => {
        if (e.pointerType && e.pointerType !== "mouse") return;
        show(SHOW_DELAY_MS);
      }}
      onPointerLeave={hide}
      // Click = omul știe deja ce a apăsat; bula rămasă peste un modal proaspăt deschis e gunoi.
      onPointerDown={() => {
        viaPointer.current = true;
        hide();
      }}
      // Tastatura nu are survolare: acolo bula e singura explicație, deci apare fără întârziere.
      onFocus={() => {
        if (!viaPointer.current) show(0);
      }}
      onBlur={() => {
        viaPointer.current = false;
        hide();
      }}
    >
      {children}
      {anchor && typeof document !== "undefined"
        ? createPortal(<Bubble anchor={anchor} label={label} side={side} />, document.body)
        : null}
    </span>
  );
}
