/**
 * Tooltip — API-ul compus din HR365 (Radix), fără Radix. Apare la hover și la focus de
 * tastatură (altfel informația e invizibilă pentru cine nu folosește mouse-ul) și e legat de
 * trigger prin `aria-describedby`.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Slot, mergeRefs, useAnchoredPosition, useStableId, type Align, type Side } from "./floating";

const DelayContext = createContext(300);

export function TooltipProvider({ delayDuration = 300, children }: { delayDuration?: number; children: ReactNode }) {
  return <DelayContext.Provider value={delayDuration}>{children}</DelayContext.Provider>;
}

interface TooltipContextValue {
  open: boolean;
  show: () => void;
  hide: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  id: string;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function Tooltip({ children, delayDuration }: { children: ReactNode; delayDuration?: number }) {
  const providerDelay = useContext(DelayContext);
  const delay = delayDuration ?? providerDelay;
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const id = useStableId("tooltip");
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const show = () => {
    clear();
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };
  return <TooltipContext.Provider value={{ open, show, hide, triggerRef, id }}>{children}</TooltipContext.Provider>;
}

function useTooltip(component: string): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error(`<${component}> trebuie folosit în <Tooltip>`);
  return ctx;
}

export function TooltipTrigger({ asChild, children, ...props }: HTMLAttributes<HTMLElement> & { asChild?: boolean }) {
  const ctx = useTooltip("TooltipTrigger");
  const handlers = {
    "aria-describedby": ctx.open ? ctx.id : undefined,
    onPointerEnter: ctx.show,
    onPointerLeave: ctx.hide,
    onFocus: ctx.show,
    onBlur: ctx.hide,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") ctx.hide();
    },
  };
  if (asChild) {
    return (
      <Slot {...props} {...handlers} slotRef={ctx.triggerRef}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type="button"
      {...(props as HTMLAttributes<HTMLButtonElement>)}
      {...handlers}
      ref={mergeRefs(ctx.triggerRef as RefObject<HTMLButtonElement | null>)}
    >
      {children}
    </button>
  );
}

export function TooltipContent({
  className,
  side = "top",
  align = "center",
  sideOffset = 4,
  children,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { side?: Side; align?: Align; sideOffset?: number }) {
  const ctx = useTooltip("TooltipContent");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const position = useAnchoredPosition(ctx.triggerRef, contentRef, { open: ctx.open, side, align, sideOffset });
  if (!ctx.open) return null;
  return createPortal(
    <div
      ref={contentRef}
      id={ctx.id}
      role="tooltip"
      data-side={position.side}
      style={{ ...position.style, ...style }}
      className={cn(
        "pointer-events-none z-[80] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}
