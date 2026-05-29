import { useEffect, useState, createContext, useContext, ReactNode } from "react";

type RouterContextValue = {
  path: string;
  navigate: (to: string) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

function getCurrentPath(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "/";
}

export function HashRouter({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(() => getCurrentPath());

  useEffect(() => {
    const onHashChange = () => setPath(getCurrentPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (to: string) => {
    window.location.hash = to;
  };

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter must be used inside <HashRouter>");
  }
  return ctx;
}

export function Link({
  to,
  className,
  children,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
        window.scrollTo({ top: 0, behavior: "auto" });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
