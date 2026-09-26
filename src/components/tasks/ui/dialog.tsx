/**
 * Dialog, AlertDialog și Sheet — API-ul din HR365 (Radix), fără Radix.
 *
 * Toate trei sunt aceeași suprafață modală: portal în `body`, fundalul aplicației (`foreground`
 * la 60%, ca în `ds/Overlay`), derularea paginii blocată, focusul ținut înăuntru cu Tab și
 * readus pe elementul de dinainte la închidere. Diferențele sunt de comportament:
 * - AlertDialog nu se închide la click pe fundal (e o confirmare, nu o fereastră oarecare);
 * - Sheet alunecă dintr-o margine în loc să apară în centru.
 */
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { lockBodyScroll } from "@/lib/scrollLock";
import { Button, type ButtonProps } from "@/components/ds";
import {
  LayerContext,
  Slot,
  focusableIn,
  mergeRefs,
  useAutoFocus,
  useControllableOpen,
  useDismissableLayer,
  useStableId,
  type AutoFocusEvent,
} from "./floating";

interface ModalContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  /** Referim descrierea doar cât timp e randată — un `aria-describedby` spre un id inexistent e o legătură ruptă. */
  hasDescription: boolean;
  setHasDescription: (present: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function useModal(component: string): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error(`<${component}> trebuie folosit într-un Dialog / AlertDialog / Sheet`);
  return ctx;
}

export interface ModalRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children: ReactNode;
}

function ModalRoot({ open, defaultOpen, onOpenChange, children }: ModalRootProps) {
  const [isOpen, setOpen] = useControllableOpen(open, defaultOpen, onOpenChange);
  const titleId = useStableId("dialog-title");
  const descriptionId = useStableId("dialog-desc");
  const [hasDescription, setHasDescription] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  return (
    <ModalContext.Provider
      value={{ open: isOpen, setOpen, titleId, descriptionId, hasDescription, setHasDescription, triggerRef }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export const Dialog = ModalRoot;
export const AlertDialog = ModalRoot;
export const Sheet = ModalRoot;

function ModalTrigger({ asChild, children, ...props }: HTMLAttributes<HTMLElement> & { asChild?: boolean }) {
  const ctx = useModal("Trigger");
  const onClick = () => ctx.setOpen(true);
  if (asChild) {
    return (
      <Slot {...props} onClick={onClick} slotRef={ctx.triggerRef}>
        {children}
      </Slot>
    );
  }
  return (
    <button type="button" {...(props as HTMLAttributes<HTMLButtonElement>)} onClick={onClick} ref={ctx.triggerRef as RefObject<HTMLButtonElement>}>
      {children}
    </button>
  );
}

export const DialogTrigger = ModalTrigger;
export const AlertDialogTrigger = ModalTrigger;
export const SheetTrigger = ModalTrigger;

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  role: "dialog" | "alertdialog";
  closeOnOverlay: boolean;
  showClose: boolean;
  onOpenAutoFocus?: (event: AutoFocusEvent) => void;
  onCloseAutoFocus?: (event: AutoFocusEvent) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
  onInteractOutside?: (event: PointerEvent) => void;
}

const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  {
    role,
    closeOnOverlay,
    showClose,
    className,
    children,
    onOpenAutoFocus,
    onCloseAutoFocus,
    onEscapeKeyDown,
    onPointerDownOutside,
    onInteractOutside,
    onKeyDown,
    ...props
  },
  ref,
) {
  const ctx = useModal("Content");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => (ctx.open ? lockBodyScroll() : undefined), [ctx.open]);
  const layerId = useDismissableLayer({
    open: ctx.open,
    onDismiss: () => ctx.setOpen(false),
    elements: () => [panelRef.current],
    closeOnOutside: closeOnOverlay,
    onEscapeKeyDown,
    onPointerDownOutside: (event) => {
      onPointerDownOutside?.(event);
      if (!event.defaultPrevented) onInteractOutside?.(event);
    },
  });
  useAutoFocus(ctx.open, panelRef, ctx.triggerRef, { onOpenAutoFocus, onCloseAutoFocus });

  if (!ctx.open) return null;
  return createPortal(
    <>
      <div
        aria-hidden="true"
        data-state="open"
        className="fixed inset-0 z-50 bg-foreground/60 animate-in fade-in-0"
      />
      <div
        ref={mergeRefs(ref, panelRef)}
        role={role}
        aria-modal="true"
        aria-labelledby={ctx.titleId}
        aria-describedby={ctx.hasDescription ? ctx.descriptionId : undefined}
        tabIndex={-1}
        data-state="open"
        className={className}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.key !== "Tab") return;
          // Capcana de focus: Tab de pe ultimul element revine la primul, Shift+Tab invers.
          const items = focusableIn(panelRef.current);
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        {...props}
      >
        <LayerContext.Provider value={layerId}>{children}</LayerContext.Provider>
        {showClose && (
          <button
            type="button"
            onClick={() => ctx.setOpen(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none max-sm:inline-flex max-sm:h-11 max-sm:w-11 max-sm:items-center max-sm:justify-center max-sm:right-2 max-sm:top-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Închide</span>
          </button>
        )}
      </div>
    </>,
    document.body,
  );
});

type ContentProps = Omit<SurfaceProps, "role" | "closeOnOverlay" | "showClose">;

const CENTERED =
  "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none animate-in fade-in-0 zoom-in-95 sm:w-full sm:rounded-lg";

export const DialogContent = forwardRef<HTMLDivElement, ContentProps>(function DialogContent(
  { className, ...props },
  ref,
) {
  return <Surface ref={ref} role="dialog" closeOnOverlay showClose className={cn(CENTERED, className)} {...props} />;
});

export const AlertDialogContent = forwardRef<HTMLDivElement, ContentProps>(function AlertDialogContent(
  { className, ...props },
  ref,
) {
  return (
    <Surface
      ref={ref}
      role="alertdialog"
      closeOnOverlay={false}
      showClose={false}
      className={cn(CENTERED, className)}
      {...props}
    />
  );
});

const SHEET_SIDES = {
  top: "inset-x-0 top-0 border-b slide-in-from-top",
  bottom: "inset-x-0 bottom-0 border-t slide-in-from-bottom",
  left: "inset-y-0 left-0 h-full w-3/4 border-r slide-in-from-left sm:max-w-sm",
  right: "inset-y-0 right-0 h-full w-3/4 border-l slide-in-from-right sm:max-w-sm",
} as const;

export const SheetContent = forwardRef<HTMLDivElement, ContentProps & { side?: keyof typeof SHEET_SIDES }>(
  function SheetContent({ className, side = "right", ...props }, ref) {
    return (
      <Surface
        ref={ref}
        role="dialog"
        closeOnOverlay
        showClose
        className={cn(
          "fixed z-50 gap-4 bg-background p-6 shadow-lg outline-none animate-in duration-300",
          SHEET_SIDES[side],
          className,
        )}
        {...props}
      />
    );
  },
);

// ─── Antet / subsol / titlu / descriere ─────────────────────────────────────

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2", className)}
      {...props}
    />
  );
}

export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
}

export const SheetHeader = AlertDialogHeader;
export const SheetFooter = AlertDialogFooter;

function Title({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  const ctx = useModal("Title");
  return <h2 id={ctx.titleId} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />;
}

function Description({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const ctx = useModal("Description");
  const { setHasDescription } = ctx;
  useLayoutEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);
  return <p id={ctx.descriptionId} className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export const DialogTitle = Title;
export const AlertDialogTitle = Title;
export const SheetTitle = Title;
export const DialogDescription = Description;
export const AlertDialogDescription = Description;
export const SheetDescription = Description;

// ─── Butoanele AlertDialog ──────────────────────────────────────────────────

/** Confirmarea: rulează acțiunea autorului, apoi închide — dacă autorul n-a cerut `preventDefault`. */
export const AlertDialogAction = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children"> & { children?: ReactNode }>(
  function AlertDialogAction({ onClick, children, ...props }, ref) {
    const ctx = useModal("AlertDialogAction");
    return (
      <Button
        ref={ref}
        {...props}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) ctx.setOpen(false);
        }}
      >
        {children}
      </Button>
    );
  },
);

export const AlertDialogCancel = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children"> & { children?: ReactNode }>(
  function AlertDialogCancel({ onClick, className, variant = "outline", children, ...props }, ref) {
    const ctx = useModal("AlertDialogCancel");
    return (
      <Button
        ref={ref}
        variant={variant}
        className={cn("mt-2 sm:mt-0", className)}
        {...props}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) ctx.setOpen(false);
        }}
      >
        {children}
      </Button>
    );
  },
);

/** Butonul de închidere pentru subsoluri personalizate (`<DialogClose asChild>`). */
export function DialogClose({ asChild, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const ctx = useModal("DialogClose");
  if (asChild) {
    return (
      <Slot {...props} onClick={() => ctx.setOpen(false)}>
        {children}
      </Slot>
    );
  }
  return (
    <button type="button" {...props} onClick={() => ctx.setOpen(false)}>
      {children}
    </button>
  );
}
