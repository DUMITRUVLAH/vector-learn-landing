/**
 * Stratul UI al modulului de task-uri — un singur punct de import pentru componentele portate
 * din HR365: `import { Button, Popover, PopoverContent, … } from "@/components/tasks/ui"`.
 *
 * Numele și props-urile sunt cele din shadcn/Radix, pe care le folosea sursa, ca fiecare
 * componentă portată să se poată compara rând cu rând cu originalul. Implementarea e locală
 * (fără Radix), pe tokenii FinFlow; `Button` e cel din design system.
 */
export { Button } from "@/components/ds";
export type { ButtonProps, ButtonSize, ButtonVariant } from "@/components/ds";

export { Popover, PopoverContent, PopoverTrigger, usePopoverClose } from "./popover";
export type { PopoverContentProps, PopoverProps } from "./popover";

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./dialog";

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  ScrollArea,
  ScrollBar,
  Separator,
  Textarea,
} from "./primitives";
export type { CheckboxProps } from "./primitives";

export { Calendar } from "./calendar";
export type { CalendarProps } from "./calendar";

export { TasksToaster } from "./toaster";
