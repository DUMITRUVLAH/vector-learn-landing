# Vector 365 — Design System

Design system folosit în **Vector Learn**. Copiați `index.css` + `tailwind.config` și urmați convențiile de mai jos.

---

## Stack

- **Tailwind CSS** v3 cu `darkMode: ["class"]`
- **Font**: [Onest](https://fonts.google.com/specimen/Onest) (sans + display)
- **Plugin**: `tailwindcss-animate`
- **Radius de bază**: `0.875rem` (14px)

---

## Culori semantice

Toate culorile sunt variabile CSS HSL. **Nu folosiți hex-uri hardcodate în componente** — folosiți doar clasa semantică.

| Token | Light (HSL) | Dark (HSL) | Utilizare |
|-------|------------|-----------|----------|
| `background` | 220 20% 97% | 222 47% 6% | Fundalul paginii |
| `foreground` | 222 47% 11% | 220 14% 96% | Text principal |
| `card` | 0 0% 100% | 222 47% 9% | Suprafața cardurilor |
| `card-foreground` | 222 47% 11% | 220 14% 96% | Text pe card |
| `primary` | 228 76% 52% | 228 76% 60% | Acțiuni principale, CTA |
| `primary-foreground` | 0 0% 100% | 0 0% 100% | Text pe buton primar |
| `secondary` | 220 14% 96% | 222 30% 16% | Buton secundar, badge |
| `secondary-foreground` | 222 47% 11% | 220 14% 96% | Text pe secondary |
| `muted` | 220 14% 96% | 222 30% 16% | Fundal subtil, secțiuni gri |
| `muted-foreground` | 220 9% 46% | 220 9% 60% | Text placeholder, label |
| `accent` | 228 76% 52% | 228 76% 60% | Highlight hover, focus |
| `border` | 220 13% 91% | 222 30% 20% | Borduri, dividers |
| `input` | 220 13% 91% | 222 30% 20% | Bordura input |
| `ring` | 228 76% 52% | 228 76% 60% | Focus ring |
| `destructive` | 0 84% 60% | 0 62% 30% | Erori, delete |
| `success` | 142 71% 45% | *(moștenit)* | Confirmare, status ok |
| `warning` | 38 92% 50% | *(moștenit)* | Avertizări |
| `info` | 210 92% 45% | *(moștenit)* | Info, notificări neutre |

---

## Culori pastel (badge-uri, tag-uri, categorii)

Fiecare pastel are o variantă `*-fg` pentru text cu contrast adecvat.

| Clasă bg | Clasă text | Culoare |
|----------|-----------|--------|
| `pastel-mint` | `text-pastel-mint-fg` | Verde mentă |
| `pastel-lavender` | `text-pastel-lavender-fg` | Lavandă |
| `pastel-peach` | `text-pastel-peach-fg` | Piersică |
| `pastel-sky` | `text-pastel-sky-fg` | Albastru cer |
| `pastel-rose` | `text-pastel-rose-fg` | Roz |
| `pastel-lemon` | `text-pastel-lemon-fg` | Lămâie |
| `pastel-teal` | `text-pastel-teal-fg` | Teal |

**Exemplu:**
```html
<span class="pastel-lavender text-pastel-lavender-fg px-2 py-0.5 rounded-sm text-xs font-medium">
  Matematică
</span>
```

---

## Gradiente

```css
--gradient-primary: linear-gradient(135deg, hsl(228, 76%, 52%), hsl(228, 76%, 42%));
--gradient-hero:    linear-gradient(135deg, hsl(228, 76%, 52%), hsl(250, 76%, 52%));
--gradient-card:    linear-gradient(180deg, hsl(0, 0%, 100%), hsl(220, 20%, 97%));
```

Folosire în Tailwind: `style={{ background: 'var(--gradient-hero)' }}` sau clasă custom.

---

## Umbre

| Clasă | Utilizare |
|-------|----------|
| `shadow-sm` | Carduri în repaus, inputs |
| `shadow-md` | Carduri hover, dropdowns |
| `shadow-lg` | Modals, popovers |
| `shadow-xl` | Hero elements, drawers |

---

## Border radius

| Clasă | Valoare |
|-------|--------|
| `rounded-lg` | `var(--radius)` = 14px |
| `rounded-md` | 12px |
| `rounded-sm` | 10px |

---

## Tipografie

Font: **Onest** — importat din Google Fonts.

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
```

```css
font-family: sans: ["Onest", "system-ui", "sans-serif"]
```

| Utilizare | Clase Tailwind |
|----------|---------------|
| Heading principal | `text-4xl font-bold tracking-tight` |
| Heading secțiune | `text-2xl font-bold tracking-tight` |
| Subheading | `text-lg font-semibold` |
| Body | `text-base` (moștenit din `body`) |
| Muted / caption | `text-sm text-muted-foreground` |
| Label form | `text-sm font-medium` |

---

## Utilitare custom

### `.text-gradient`
Text cu gradient de la `primary` la violet.
```html
<h1 class="text-gradient text-4xl font-bold">Vector Learn</h1>
```

### `.card-hover`
Efect subtil la hover pe carduri.
```html
<div class="card-hover rounded-lg border bg-card p-6">...</div>
```

### `.glass`
Efect frosted-glass (backdrop blur).
```html
<nav class="glass fixed top-0 w-full px-6 py-4">...</nav>
```

### `.touch-target`
Asigură țintă tactilă ≥ 44×44px (WCAG 2.1).
```html
<button class="touch-target flex items-center justify-center" aria-label="Închide">
  <X size={20} />
</button>
```

### `.grid-pattern`
Fundal cu grilă subtilă (utilitare pentru hero sections).
```html
<section class="grid-pattern radial-mask min-h-screen">...</section>
```

### `.radial-mask`
Fade radial — ascunde marginile unui pattern.

### `.glow`
Glow albastru pentru elemente hero.
```html
<div class="glow rounded-xl overflow-hidden">...</div>
```

---

## Animații

| Clasă | Efect | Durată |
|-------|-------|--------|
| `animate-fade-in` | Fade + slide up 8px | 0.6s ease-out |
| `animate-slide-in` | Fade + slide right 12px | 0.3s ease-out |
| `animate-float` | Float sus-jos 8px | 6s ease-in-out infinite |
| `animate-pulse-soft` | Pulsare opacity 70%–100% | 3s ease-in-out infinite |

---

## Reguli de implementare

1. **Zero hex-uri hardcodate** în `.tsx` — folosește doar tokeni semantici (`bg-primary`, `text-muted-foreground`)
2. **Spacing** — scala Tailwind standard; `[123px]` doar ca ultimă soluție cu comentariu
3. **Dark mode** — orice componentă nouă trebuie să funcționeze și în `.dark`
4. **Contrast** — text ≥ 4.5:1 față de fundal (WCAG AA)
5. **Touch targets** — butoane icon-only: minim 44×44px via `.touch-target`
6. **Aria** — orice `<button>` fără text vizibil are `aria-label`

---

## Structura `index.css` minimală pentru alt proiect

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 220 20% 97%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --primary: 228 76% 52%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 14% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted: 220 14% 96%;
    --muted-foreground: 220 9% 46%;
    --accent: 228 76% 52%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 71% 45%;
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 100%;
    --info: 210 92% 45%;
    --info-foreground: 0 0% 100%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 228 76% 52%;
    --radius: 0.875rem;
    --shadow-sm: 0 1px 3px 0 hsl(222 47% 11% / 0.03), 0 1px 2px -1px hsl(222 47% 11% / 0.02);
    --shadow-md: 0 4px 8px -2px hsl(222 47% 11% / 0.05), 0 2px 4px -2px hsl(222 47% 11% / 0.03);
    --shadow-lg: 0 10px 20px -4px hsl(222 47% 11% / 0.06), 0 4px 8px -4px hsl(222 47% 11% / 0.03);
    --shadow-xl: 0 20px 30px -8px hsl(222 47% 11% / 0.08), 0 8px 12px -6px hsl(222 47% 11% / 0.04);
  }

  .dark {
    --background: 222 47% 6%;
    --foreground: 220 14% 96%;
    --card: 222 47% 9%;
    --card-foreground: 220 14% 96%;
    --primary: 228 76% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 222 30% 16%;
    --secondary-foreground: 220 14% 96%;
    --muted: 222 30% 16%;
    --muted-foreground: 220 9% 60%;
    --accent: 228 76% 60%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 62% 30%;
    --destructive-foreground: 220 14% 96%;
    --border: 222 30% 20%;
    --input: 222 30% 20%;
    --ring: 228 76% 60%;
  }
}
```
