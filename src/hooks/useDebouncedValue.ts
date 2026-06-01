/**
 * CRM-139: useDebouncedValue — returns a debounced copy of `value` that only
 * updates after `delay` ms of inactivity. Cancels on unmount (no setState after
 * component is gone).
 */
import { useState, useEffect } from "react";

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
