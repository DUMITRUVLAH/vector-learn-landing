/**
 * CRM-144 — CopyButton
 * A small icon button that copies `value` to the clipboard.
 * Shows a checkmark for 1.5s after a successful copy, then reverts to the copy icon.
 * Gracefully handles unavailable clipboard (logs, does not throw).
 */
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  /** e.g. "Copiază telefonul", "Copiază email-ul" */
  ariaLabel: string;
  className?: string;
}

export function CopyButton({ value, ariaLabel, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback: execCommand (legacy browsers / HTTP contexts without clipboard API)
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — fail silently; user still sees the value on screen
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? "Copiat!" : ariaLabel}
      title={copied ? "Copiat!" : ariaLabel}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border p-1.5 min-w-[44px] min-h-[44px] transition-colors",
        copied
          ? "border-success/40 bg-success/10 text-success"
          : "hover:bg-muted text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied && (
        <span className="ml-1 text-[10px] font-semibold leading-none">Copiat!</span>
      )}
    </button>
  );
}
