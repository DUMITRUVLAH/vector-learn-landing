/**
 * HR365-002 — Table family.
 *
 * The wrapper owns the rounded border and clips the corners; the table itself
 * is borderless. Header cells are 48px tall and muted; body rows 12px/16px.
 * The wrapper scrolls horizontally so a wide table never scrolls the page.
 */
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className={cn("w-full border-collapse text-sm", className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={className} {...rest}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean;
}

export function TableRow({ interactive = false, className, children, ...rest }: TableRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0",
        interactive && "cursor-pointer transition-colors hover:bg-muted/50",
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 align-middle", className)} {...rest}>
      {children}
    </td>
  );
}
