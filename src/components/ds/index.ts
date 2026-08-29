/**
 * HR365 by Vector — design-system primitives for FinFlow.
 *
 * Import from `@/components/ds` (never from the individual files) so the layer
 * stays swappable. Everything here resolves through the semantic tokens in
 * `src/index.css`: no hex in `.tsx`, light + dark for free.
 */
export { Avatar, initialsOf } from "./Avatar";
export type { AvatarProps } from "./Avatar";

export { Badge, StatusBadge, STATUS_MAP } from "./Badge";
export type { BadgeProps, BadgeVariant, StatusBadgeProps } from "./Badge";

export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export { Combobox } from "./Combobox";
export type { ComboboxProps, ComboboxOption } from "./Combobox";

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./Card";
export type { CardProps } from "./Card";

export { EmptyState } from "./EmptyState";

export { Checkbox, Input, Label, Select, Switch, Textarea } from "./Field";
export type {
  CheckboxProps,
  InputProps,
  LabelProps,
  SelectProps,
  SwitchProps,
  TextareaProps,
} from "./Field";

export { Alert, Progress, Separator, Skeleton, Tabs } from "./Feedback";
export type { AlertProps, AlertVariant, ProgressProps, TabItem, TabsProps } from "./Feedback";

export { Dialog, Sheet } from "./Overlay";
export type { DialogProps, SheetProps } from "./Overlay";
export type { EmptyStateProps } from "./EmptyState";

export { LanguageSwitcher } from "./LanguageSwitcher";
export type { LanguageSwitcherProps } from "./LanguageSwitcher";

export { KpiTile } from "./KpiTile";
export type { KpiTileProps } from "./KpiTile";

export { ModuleCard } from "./ModuleCard";
export type { ModuleCardProps } from "./ModuleCard";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { PastelIcon } from "./PastelIcon";
export type { PastelIconProps } from "./PastelIcon";

export { SidebarNavItem } from "./SidebarNavItem";
export type { SidebarNavItemProps } from "./SidebarNavItem";

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./Table";
export type { TableRowProps } from "./Table";

export { CHIP_CYCLE, chipStyle, chipToneFor, moduleStyle } from "./tones";
export type { ChipTone, ModuleTone } from "./tones";
