/**
 * Popover — același API ca cel din HR365 (Radix), fără Radix. Vezi `floating.ts`.
 *
 * `modal` e acceptat pentru compatibilitate: în Radix el izola rotița mouse-ului de dialogul de
 * dedesubt. Aici panoul e portalat în `body` și nu există un scroll-lock care să-l înghită,
 * deci derularea listei merge oricum.
 */
import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  LayerContext,
  Slot,
  mergeRefs,
  useAnchoredPosition,
  useAutoFocus,
  useControllableOpen,
  useDismissableLayer,
  useStableId,
  type Align,
  type AutoFocusEvent,
  type Side,
} from "./floating";

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  contentId: string;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopover(component: string): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error(`<${component}> trebuie folosit în <Popover>`);
  return ctx;
}

export interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children: ReactNode;
}

export function Popover({ open, defaultOpen, onOpenChange, children }: PopoverProps) {
  const [isOpen, setOpen] = useControllableOpen(open, defaultOpen, onOpenChange);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentId = useStableId("popover");
  return (
    <PopoverContext.Provider value={{ open: isOpen, setOpen, triggerRef, contentId }}>
      {children}
    </PopoverContext.Provider>
  );
}

export interface PopoverTriggerProps extends HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export const PopoverTrigger = forwardRef<HTMLElement, PopoverTriggerProps>(function PopoverTrigger(
  { asChild, children, onClick, ...props },
  ref,
) {
  const { open, setOpen, triggerRef, contentId } = usePopover("PopoverTrigger");
  const handlers = {
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    "aria-controls": open ? contentId : undefined,
    "data-state": open ? "open" : "closed",
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) setOpen(!open);
    },
  };
  if (asChild) {
    return (
      <Slot {...props} {...handlers} slotRef={mergeRefs(ref, triggerRef)}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type="button"
      {...(props as HTMLAttributes<HTMLButtonElement>)}
      {...handlers}
      ref={mergeRefs(ref, triggerRef as RefObject<HTMLButtonElement | null>)}
    >
      {children}
    </button>
  );
});

export interface PopoverContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  collisionPadding?: number;
  onOpenAutoFocus?: (event: AutoFocusEvent) => void;
  onCloseAutoFocus?: (event: AutoFocusEvent) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
  onInteractOutside?: (event: PointerEvent) => void;
  /** Acceptat pentru compatibilitate cu sursa; panoul e oricum portalat. */
  withoutPortal?: boolean;
}

export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent(
  {
    className,
    side = "bottom",
    align = "center",
    sideOffset = 4,
    collisionPadding = 8,
    onOpenAutoFocus,
    onCloseAutoFocus,
    onEscapeKeyDown,
    onPointerDownOutside,
    onInteractOutside,
    withoutPortal: _withoutPortal,
    style,
    children,
    ...props
  },
  ref,
) {
  const { open, setOpen, triggerRef, contentId } = usePopover("PopoverContent");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const position = useAnchoredPosition(triggerRef, contentRef, { open, side, align, sideOffset, collisionPadding });

  const layerId = useDismissableLayer({
    open,
    onDismiss: () => setOpen(false),
    elements: () => [contentRef.current, triggerRef.current],
    closeOnFocusOutside: true,
    onEscapeKeyDown,
    onPointerDownOutside: (event) => {
      onPointerDownOutside?.(event);
      if (!event.defaultPrevented) onInteractOutside?.(event);
    },
  });
  useAutoFocus(open, contentRef, triggerRef, { onOpenAutoFocus, onCloseAutoFocus });

  if (!open) return null;
  return createPortal(
    <div
      ref={mergeRefs(ref, contentRef)}
      id={contentId}
      role="dialog"
      tabIndex={-1}
      data-state="open"
      data-side={position.side}
      style={{ ...position.style, ...style }}
      className={cn(
        "z-[80] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95",
        position.side === "bottom" && "slide-in-from-top-2",
        position.side === "top" && "slide-in-from-bottom-2",
        position.side === "left" && "slide-in-from-right-2",
        position.side === "right" && "slide-in-from-left-2",
        className,
      )}
      {...props}
    >
      <LayerContext.Provider value={layerId}>{children}</LayerContext.Provider>
    </div>,
    document.body,
  );
});

/** Închide popover-ul din interiorul lui (ex. după alegerea unei opțiuni). */
export function usePopoverClose(): () => void {
  const ctx = useContext(PopoverContext);
  return () => ctx?.setOpen(false);
}
