# Regulile de design — pentru agentul care scrie codul

> Pune fișierul ăsta în rădăcina proiectului ca `AGENTS.md`, sau lipește-i conținutul
> într-o secțiune „Design system" din `CLAUDE.md`. E contractul pe care Claude îl citește
> înainte să atingă UI.

## Regula zero

**Zero hex hardcodat în `.tsx`.** Orice culoare trece printr-un token semantic. Asta e
singurul motiv pentru care dark mode vine gratis: `--background` se schimbă o dată în CSS,
nu în 200 de componente.

```tsx
❌ <div className="bg-[#4F46E5] text-white">
❌ <div style={{ background: "#fff" }}>
✅ <div className="bg-primary text-primary-foreground">
```

## Tokeni — ce folosești, când

| Vrei | Folosește | Nu folosi |
|---|---|---|
| fundal de pagină | `bg-background` | `bg-white`, `bg-gray-50` |
| suprafață ridicată | `bg-card` | `bg-white` |
| text principal | `text-foreground` | `text-gray-900`, `text-black` |
| text secundar / label | `text-muted-foreground` | `text-gray-500` |
| acțiune principală | `bg-primary text-primary-foreground` | `bg-indigo-600` |
| bordură, separator | `border-border` | `border-gray-200` |
| eroare | `text-destructive`, `bg-destructive` | `text-red-600` |
| ok / atenție / info | `text-success`, `text-warning`, `text-info` | verde/galben/albastru brut |
| tentă de categorie | `pastel-*` + `text-pastel-*-fg`, sau `chipStyle()` | culori Tailwind alese ad-hoc |
| rotunjire | `rounded-lg\|md\|sm` (bază 14px) | `rounded-[10px]` |
| tranziție | `duration-[--duration-base] ease-[--ease-out]` | durate inventate |

## Primitivele înainte de HTML brut

Înainte să scrii `<button className="...">`, verifică `@/components/ds`. Există deja:
`Button`, `Card`, `Badge`/`StatusBadge`, `Input`/`Label`/`Select`/`Switch`/`Checkbox`/`Textarea`,
`Table`, `Dialog`/`Sheet`, `Alert`/`Progress`/`Tabs`/`Skeleton`, `KpiTile`, `ModuleCard`,
`PageHeader`, `EmptyState`, `PastelIcon`, `SidebarNavItem`, `Avatar`.

Importă **doar** din barrel (`@/components/ds`), niciodată din fișierul individual — așa
stratul rămâne înlocuibil.

Dacă un primitiv nu acoperă cazul: **extinde primitivul**, nu construi o variantă paralelă
în pagină. O a doua definiție de buton e începutul derivei.

## Accesibilitate (WCAG 2.1 AA) — nu e opțional

- contrast text ≥ 4.5:1 (tokenii `*-foreground` sunt deja calculați pentru asta)
- țintă de atingere ≥ 44×44px — clasa `.touch-target`; pe telefon regula CSS o aplică
  automat la `input`/`select`/`textarea`
- fiecare `<button>` doar-cu-icon are `aria-label`
- fiecare input are `<label>` (vizibil sau `sr-only`)
- fiecare element interactiv e accesibil de la tastatură, cu `focus-visible:ring-ring`
- `axe` — zero violări critical + serious

## Dark mode

Fiecare componentă nouă trebuie să arate bine în **ambele** teme. Verifici comutând clasa
`dark` pe `<html>` — nu scrii variante `dark:` peste tot. Dacă ai nevoie de `dark:` mai
mult de o dată-două într-o componentă, înseamnă că ai folosit o culoare care nu era token.

## Spațiere și densitate

Scala Tailwind. Valorile arbitrare `[123px]` sunt ultimă soluție și cer un comentariu care
justifică de ce. Lățimea conținutului: `--content-max` (80rem). Sidebar: `--sidebar-width` (260px).

## Mișcare

`--duration-fast` (150ms) pentru hover, `--duration-base` (200ms) pentru tranziții de stare,
`--duration-slide` (300ms) pentru panouri, `--duration-fade` (400ms). Curbele: `--ease-out`,
`--ease-smooth`. Ridicarea la hover: `--lift-hover` (-2px), prin `.card-hover`.

## Checklist înainte de a raporta „gata"

- [ ] zero hex / `style={{ color }}` în diff
- [ ] arată corect în light ȘI dark
- [ ] am refolosit primitivele, n-am scris altele paralele
- [ ] icon-only are `aria-label`, input are `<label>`
- [ ] țintele de atingere ≥ 44px pe telefon
- [ ] focus vizibil pe tot ce e interactiv
