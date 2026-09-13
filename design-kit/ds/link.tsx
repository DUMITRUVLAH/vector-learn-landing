/**
 * Router adapter — the ONLY coupling point between this kit and a host app.
 *
 * The primitives (Button, KpiTile, ModuleCard, SidebarNavItem) render a real
 * `<a>` when given `href`, so middle-click / open-in-new-tab keep working.
 * Out of the box that is a plain anchor. If your app has a router, wrap the
 * tree once and every primitive picks it up:
 *
 *   import { Link as RouterLink } from "react-router-dom";
 *   <LinkProvider component={({ to, children, ...rest }) => (
 *     <RouterLink to={to} {...rest}>{children}</RouterLink>
 *   )}>
 *     <App />
 *   </LinkProvider>
 *
 * For a hash router, the adapter is `<a href={"#" + to}>`.
 */
import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from "react";

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  children?: ReactNode;
}

export type LinkComponent = (props: LinkProps) => ReactNode;

const DefaultLink: LinkComponent = ({ to, children, ...rest }) => (
  <a href={to} {...rest}>
    {children}
  </a>
);

const LinkContext = createContext<LinkComponent>(DefaultLink);

export function LinkProvider({
  component,
  children,
}: {
  component: LinkComponent;
  children: ReactNode;
}) {
  return <LinkContext.Provider value={component}>{children}</LinkContext.Provider>;
}

export function Link(props: LinkProps) {
  const Component = useContext(LinkContext);
  return <>{Component(props)}</>;
}
