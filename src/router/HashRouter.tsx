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

/**
 * Sari sus INSTANT la schimbarea paginii.
 *
 * `behavior: "auto"` nu înseamnă „fără animație": conform specificației, delegă deciziei
 * CSS-ului, iar noi avem `html { scroll-behavior: smooth }` — deci fiecare navigare pornea o
 * animație de derulare peste conținutul care tocmai se schimba. Așa se vedea „sare toată
 * pagina în sus și în jos" la fiecare click din meniu. `"instant"` taie animația.
 */
function jumpToTop() {
  try {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  } catch {
    window.scrollTo(0, 0); // browsere vechi, fără opțiuni de derulare
  }
}

export function HashRouter({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(() => getCurrentPath());

  useEffect(() => {
    const onHashChange = () => {
      setPath(getCurrentPath());
      jumpToTop();
    };
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
        // Derularea sus o face routerul, pentru ORICE navigare (link sau `navigate()`),
        // ca meniul și butoanele din pagină să se poarte la fel.
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
