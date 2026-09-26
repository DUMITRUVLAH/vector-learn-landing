/**
 * Fundația stratului UI al modulului de task-uri: ancorare, straturi, închidere, `asChild`.
 *
 * Modulul e portat din HR365, unde meniurile, popover-ele și selectoarele vin din Radix. Aici nu
 * există Radix (FinFlow își face primitivele singur, vezi `src/components/ds`), așa că ce făcea
 * Radix pentru noi e scris o singură dată, aici, și folosit de toate componentele din `ui/`:
 *
 * - **Ancorarea**: panoul stă `position: fixed` lângă trigger, se întoarce deasupra când jos nu
 *   încape și nu iese din ecran pe orizontală. Se recalculează la scroll și la redimensionare.
 * - **Straturile**: un popover deschis dintr-un dialog e un strat PESTE dialog. Escape și
 *   click-ul în afară închid doar stratul de sus — altfel un Escape în selectorul de responsabili
 *   închidea tot panoul task-ului.
 * - **`asChild`**: trigger-ul își lipește handler-ele și ref-ul pe copilul primit, ca în Radix,
 *   deci butonul rămâne butonul autorului (cu clasele lui), nu un `<button>` în plus.
 */
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  type SyntheticEvent,
} from "react";

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

// ─── Ref-uri ────────────────────────────────────────────────────────────────

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as MutableRefObject<T | null>).current = value;
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (value: T | null) => void {
  return (value) => {
    for (const ref of refs) assignRef(ref, value);
  };
}

/** Ref-ul pe care un element React îl poartă deja (React 18 îl ține pe element, nu în props). */
function elementRef(element: ReactElement): Ref<unknown> | undefined {
  return (element as unknown as { ref?: Ref<unknown> }).ref ?? undefined;
}

type Handler = ((event: SyntheticEvent) => void) | undefined;

/**
 * `asChild`: handler-ele noastre rulează DUPĂ ale copilului, iar dacă acela a cerut
 * `preventDefault()`, ale noastre nu mai rulează — aceeași convenție ca Radix, pe care o
 * folosesc componentele portate (ex. `stopPointer` în editările inline).
 */
export function Slot({
  children,
  slotRef,
  ...props
}: { children: ReactNode; slotRef?: Ref<HTMLElement> } & Record<string, unknown>): ReactElement | null {
  if (!isValidElement(children)) return null;
  const child = children as ReactElement<Record<string, unknown>>;
  const merged: Record<string, unknown> = { ...props };
  for (const [name, value] of Object.entries(props)) {
    const own = child.props[name];
    if (typeof value === "function" && /^on[A-Z]/.test(name) && typeof own === "function") {
      merged[name] = (event: SyntheticEvent) => {
        (own as Handler)?.(event);
        if (!event.defaultPrevented) (value as Handler)?.(event);
      };
    }
  }
  if (typeof props.className === "string" && typeof child.props.className === "string") {
    merged.className = `${child.props.className} ${props.className}`;
  }
  merged.ref = mergeRefs(elementRef(child) as Ref<HTMLElement>, slotRef);
  return cloneElement(child, merged);
}

// ─── Straturi ───────────────────────────────────────────────────────────────

interface Layer {
  id: number;
  elements: () => Array<HTMLElement | null>;
}

const layers: Layer[] = [];
let nextLayerId = 1;

function layerIndex(id: number): number {
  return layers.findIndex((layer) => layer.id === id);
}

/** Stratul `id` e cel de sus (ultimul deschis, încă deschis)? */
function isTopLayer(id: number): boolean {
  return layers.length > 0 && layers[layers.length - 1].id === id;
}

/** Ținta e într-un strat deschis DUPĂ `id` (un submeniu, un popover din popover)? */
function insideLayerAbove(id: number, target: Node): boolean {
  const index = layerIndex(id);
  for (let i = index + 1; i < layers.length; i += 1) {
    if (layers[i].elements().some((el) => el?.contains(target))) return true;
  }
  return false;
}

export interface DismissOptions {
  open: boolean;
  onDismiss: (reason: "escape" | "outside") => void;
  /** Elementele care NU închid stratul la click: panoul și trigger-ul lui. */
  elements: () => Array<HTMLElement | null>;
  /** `false` = click-ul în afară nu închide (AlertDialog). */
  closeOnOutside?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
}

/**
 * Înregistrează stratul cât e deschis și îl închide la Escape / click în afară — doar dacă e
 * stratul de SUS. Ordinea deschiderii dă ordinea straturilor, exact cum le vede omul pe ecran.
 */
export function useDismissableLayer({
  open,
  onDismiss,
  elements,
  closeOnOutside = true,
  onEscapeKeyDown,
  onPointerDownOutside,
}: DismissOptions): void {
  const latest = useRef({ onDismiss, elements, closeOnOutside, onEscapeKeyDown, onPointerDownOutside });
  latest.current = { onDismiss, elements, closeOnOutside, onEscapeKeyDown, onPointerDownOutside };

  useEffect(() => {
    if (!open) return;
    const id = nextLayerId++;
    layers.push({ id, elements: () => latest.current.elements() });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isTopLayer(id)) return;
      latest.current.onEscapeKeyDown?.(event);
      if (event.defaultPrevented) return;
      event.stopPropagation();
      latest.current.onDismiss("escape");
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !latest.current.closeOnOutside) return;
      if (latest.current.elements().some((el) => el?.contains(target))) return;
      if (insideLayerAbove(id, target)) return;
      latest.current.onPointerDownOutside?.(event);
      if (event.defaultPrevented) return;
      latest.current.onDismiss("outside");
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      const index = layerIndex(id);
      if (index >= 0) layers.splice(index, 1);
    };
  }, [open]);
}

// ─── Ancorare ───────────────────────────────────────────────────────────────

export interface AnchorOptions {
  open: boolean;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  collisionPadding?: number;
  /** Panoul cel puțin cât trigger-ul (selectoare). */
  matchAnchorWidth?: boolean;
}

export interface AnchoredPosition {
  style: CSSProperties;
  side: Side;
}

const HIDDEN: CSSProperties = { position: "fixed", top: 0, left: 0, visibility: "hidden" };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Calculul pur, testabil fără DOM. */
export function computePosition(
  anchor: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width" | "height">,
  floating: { width: number; height: number },
  viewport: { width: number; height: number },
  { side = "bottom", align = "center", sideOffset = 4, collisionPadding = 8 }: Omit<AnchorOptions, "open">,
): { top: number; left: number; side: Side } {
  const pad = collisionPadding;
  let placed: Side = side;
  let top: number;
  let left: number;

  if (side === "bottom" || side === "top") {
    const below = anchor.bottom + sideOffset;
    const above = anchor.top - sideOffset - floating.height;
    const fitsBelow = below + floating.height <= viewport.height - pad;
    const fitsAbove = above >= pad;
    if (side === "bottom") placed = fitsBelow || !fitsAbove ? "bottom" : "top";
    else placed = fitsAbove || !fitsBelow ? "top" : "bottom";
    top = placed === "bottom" ? below : above;

    if (align === "start") left = anchor.left;
    else if (align === "end") left = anchor.right - floating.width;
    else left = anchor.left + anchor.width / 2 - floating.width / 2;
    left = clamp(left, pad, Math.max(pad, viewport.width - floating.width - pad));
    top = clamp(top, pad, Math.max(pad, viewport.height - floating.height - pad));
  } else {
    const right = anchor.right + sideOffset;
    const leftSide = anchor.left - sideOffset - floating.width;
    const fitsRight = right + floating.width <= viewport.width - pad;
    const fitsLeft = leftSide >= pad;
    if (side === "right") placed = fitsRight || !fitsLeft ? "right" : "left";
    else placed = fitsLeft || !fitsRight ? "left" : "right";
    left = placed === "right" ? right : leftSide;

    if (align === "start") top = anchor.top;
    else if (align === "end") top = anchor.bottom - floating.height;
    else top = anchor.top + anchor.height / 2 - floating.height / 2;
    top = clamp(top, pad, Math.max(pad, viewport.height - floating.height - pad));
    left = clamp(left, pad, Math.max(pad, viewport.width - floating.width - pad));
  }
  return { top, left, side: placed };
}

/**
 * Poziția panoului față de ancoră. Până la prima măsurare panoul e invizibil (nu clipește în
 * colțul ecranului), apoi urmărește ancora la scroll (inclusiv în containere derulabile — de
 * aici `capture: true`) și la redimensionare.
 */
export function useAnchoredPosition(
  anchor: RefObject<HTMLElement | null>,
  floating: RefObject<HTMLElement | null>,
  options: AnchorOptions,
): AnchoredPosition {
  const { open, side = "bottom", align = "center", sideOffset = 4, collisionPadding = 8, matchAnchorWidth } = options;
  const [position, setPosition] = useState<AnchoredPosition>({ style: HIDDEN, side });

  const update = useCallback(() => {
    const anchorEl = anchor.current;
    const floatingEl = floating.current;
    if (!anchorEl || !floatingEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const size = { width: floatingEl.offsetWidth, height: floatingEl.offsetHeight };
    const next = computePosition(
      rect,
      size,
      { width: window.innerWidth, height: window.innerHeight },
      { side, align, sideOffset, collisionPadding },
    );
    setPosition({
      side: next.side,
      style: {
        position: "fixed",
        top: next.top,
        left: next.left,
        ...(matchAnchorWidth ? { minWidth: rect.width } : null),
      },
    });
  }, [anchor, floating, side, align, sideOffset, collisionPadding, matchAnchorWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition({ style: HIDDEN, side });
      return;
    }
    update();
    const floatingEl = floating.current;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (floatingEl) observer?.observe(floatingEl);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, update, floating, side]);

  return position;
}

// ─── Focus ──────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** Evenimentul „sintetic" pe care Radix îl dă la `onOpenAutoFocus` — doar `preventDefault` contează. */
export interface AutoFocusEvent {
  defaultPrevented: boolean;
  preventDefault: () => void;
}

export function autoFocusEvent(): AutoFocusEvent {
  const event: AutoFocusEvent = {
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
  };
  return event;
}

/**
 * La deschidere: focus pe primul element focusabil din panou (sau pe panou). La închidere:
 * focus înapoi pe trigger, dacă focusul era în panou — altfel tastatura rămâne „nicăieri".
 */
export function useAutoFocus(
  open: boolean,
  content: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null> | null,
  handlers: { onOpenAutoFocus?: (e: AutoFocusEvent) => void; onCloseAutoFocus?: (e: AutoFocusEvent) => void } = {},
): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const event = autoFocusEvent();
      latest.current.onOpenAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const root = content.current;
      if (!root || root.contains(document.activeElement)) return;
      const first = root.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(root)[0] ?? root;
      first.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      const event = autoFocusEvent();
      latest.current.onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const active = document.activeElement;
      const wasInside = !active || active === document.body || content.current?.contains(active);
      if (wasInside) trigger?.current?.focus({ preventScroll: true });
    };
  }, [open, content, trigger]);
}

/** Starea „controlată sau nu" din Radix: `open` + `onOpenChange`, cu fallback pe stare internă. */
export function useControllableOpen(
  open: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
): [boolean, (next: boolean) => void] {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const controlled = open !== undefined;
  const value = controlled ? open : inner;
  const latest = useRef(onOpenChange);
  latest.current = onOpenChange;
  const setValue = useCallback(
    (next: boolean) => {
      if (!controlled) setInner(next);
      latest.current?.(next);
    },
    [controlled],
  );
  return [value, setValue];
}

let idCounter = 0;
/** Id stabil pentru aria-controls / aria-labelledby. */
export function useStableId(prefix: string): string {
  const ref = useRef<string>();
  if (!ref.current) {
    idCounter += 1;
    ref.current = `${prefix}-${idCounter}`;
  }
  return ref.current;
}
