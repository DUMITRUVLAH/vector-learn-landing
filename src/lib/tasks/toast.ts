/**
 * Notificările scurte ale modulului de task-uri: `toast.success(text)`, `toast.error(text)`,
 * opțional cu o acțiune (`{ action: { label: "Anulează", onClick } }`).
 *
 * Aceeași formă de apel ca `sonner` din HR365, ca apelurile portate să rămână identice. O
 * singură coadă pentru tot modulul, afișată de `<TasksToaster />` din shell-ul modulului —
 * altfel fiecare pagină ar fi avut starea ei de toast (cum face CRM-ul cu `onToast`) și
 * mutațiile din hook-uri, care nu știu pe ce pagină sunt, n-ar fi avut unde scrie.
 */

export type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  description?: string;
  /** Milisecunde; implicit 4 s, 6 s când există o acțiune (timp să apeși „Anulează"). */
  duration?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener(items);
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  items = items.filter((item) => item.id !== id);
  emit();
}

function push(kind: ToastKind, message: string, options: ToastOptions = {}): number {
  const id = nextId++;
  // Cel mult trei deodată: un șir de erori identice nu trebuie să acopere ecranul.
  items = [...items, { id, kind, message, ...options }].slice(-3);
  const duration = options.duration ?? (options.action ? 6000 : 4000);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), duration),
  );
  emit();
  return id;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => {
    listeners.delete(listener);
  };
}

export const toast = Object.assign((message: string, options?: ToastOptions) => push("info", message, options), {
  success: (message: string, options?: ToastOptions) => push("success", message, options),
  error: (message: string, options?: ToastOptions) => push("error", message, options),
  info: (message: string, options?: ToastOptions) => push("info", message, options),
  dismiss: dismissToast,
});
