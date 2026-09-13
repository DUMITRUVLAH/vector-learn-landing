# HR365 by Vector — Design Kit

Design system-ul folosit în FinFlow / Vector Learn, împachetat ca să fie mutat într-un
proiect nou. React 18 + TypeScript + Tailwind v3.

## Ce e înăuntru

| Fișier | Ce e |
|---|---|
| [INSTALL.md](INSTALL.md) | **începe aici** — 6 pași de instalare + verificare |
| [AGENTS.md](AGENTS.md) | regulile pentru agentul AI din proiectul-țintă (zero hex, tokeni, a11y) |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | referința umană: tabelul de tokeni, paleta, tipografia |
| [styles/tokens.css](styles/tokens.css) | **sursa de adevăr** — toate variabilele CSS, light + dark |
| [tailwind.config.ts](tailwind.config.ts) | maparea tokeni → clase Tailwind, font, fontSize, animații |
| [lib/utils.ts](lib/utils.ts) | `cn()` (clsx + tailwind-merge) |
| [ds/](ds/) | 16 primitive React + `link.tsx` (adaptorul de router) |
| [example/Showcase.tsx](example/Showcase.tsx) | o pagină care randează tot — lipește-o ca să verifici instalarea |
| [reference/](reference/) | kitul HR365 offline (HTML), referința vizuală originală |

## Identitatea, pe scurt

- **Primar** `hsl(228 76% 52%)` — indigo
- **Font** Onest (100–900), sans + display
- **Radius** 0.875rem (14px)
- **Fundal** `220 20% 97%` light / `222 47% 6%` dark
- **Umbre** foarte discrete (opacitate 0.03–0.08), rândul activ de sidebar are halou colorat
- **Pasteluri** 7 tente cu `-fg` pentru contrast + 9 chip-uri + 9 tonuri de modul

## Cum îl dai unui agent

Copiază folderul în proiectul nou și spune-i:

> Instalează design system-ul din `design-kit/` urmând `design-kit/INSTALL.md`.
> Apoi mută `design-kit/AGENTS.md` în rădăcină ca `AGENTS.md` și respectă-l la fiecare
> componentă pe care o scrii. Verifică instalarea randând `design-kit/example/Showcase.tsx`
> în light și în dark.
