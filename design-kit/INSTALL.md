# Instalare — 6 pași

Ținta: proiect **React 18 + TypeScript + Vite + Tailwind v3**. Dacă proiectul e Next.js,
totul funcționează la fel; singura diferență e unde pui importul de CSS (`app/layout.tsx`).

## 1. Dependențe

```bash
npm i clsx tailwind-merge class-variance-authority lucide-react
npm i -D tailwindcss@^3.4 postcss autoprefixer tailwindcss-animate
```

## 2. Copiază fișierele

```bash
cp design-kit/tailwind.config.ts   ./tailwind.config.ts
cp design-kit/styles/tokens.css    ./src/index.css        # sau merge-uiește în CSS-ul existent
mkdir -p src/lib src/components
cp design-kit/lib/utils.ts         ./src/lib/utils.ts     # dacă ai deja `cn`, păstrează-l pe al tău
cp -r design-kit/ds                ./src/components/ds
```

## 3. Alias `@` → `src`

`vite.config.ts`:
```ts
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```
`tsconfig.json`:
```json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }
```

## 4. Fontul Onest

În `index.html`, în `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap" rel="stylesheet" />
```

## 5. Importă CSS-ul o singură dată

În `src/main.tsx`: `import "./index.css";`

## 6. Dark mode

`darkMode: ["class"]` — pui/scoți clasa `dark` pe `<html>`:
```ts
document.documentElement.classList.toggle("dark", prefersDark);
```

---

## Verificare (2 minute)

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, StatusBadge, KpiTile } from "@/components/ds";
```
Randează `example/Showcase.tsx` din kit. Dacă vezi butonul indigo `hsl(228 76% 52%)`, cardul
alb pe fundal `220 20% 97%` și chip-urile pastel — e instalat corect. Comută clasa `dark`:
totul trebuie să rămână lizibil, fără să schimbi o linie de cod.

## Router (opțional)

Primitivele cu `href` (`Button`, `KpiTile`, `ModuleCard`, `SidebarNavItem`) randează `<a>` simplu
în mod implicit. Ca să folosească routerul proiectului, învelești aplicația **o dată**:

```tsx
import { LinkProvider } from "@/components/ds";
import { Link as RouterLink } from "react-router-dom";

<LinkProvider component={({ to, children, ...rest }) => <RouterLink to={to} {...rest}>{children}</RouterLink>}>
  <App />
</LinkProvider>
```

## Ce NU e inclus

Layout-ul de aplicație (`BusinessShell`: sidebar 260px + antet de pagină) a rămas afară — e
cusut pe navigația FinFlow. Primitivele din care se construiește (`SidebarNavItem`, `PageHeader`,
`Avatar`) sunt toate aici; shell-ul se scrie în ~150 de linii peste ele.
