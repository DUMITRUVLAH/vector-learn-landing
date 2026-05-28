# Vector Learn — Landing Page

> CRM-ul complet pentru centre educaționale. Landing page construit cu React 18 + TypeScript + Tailwind CSS, urmând design system-ul Vector 365.

## Despre produs

**Vector Learn** este o platformă SaaS dedicată centrelor educaționale (școli de limbi, programare, muzică, dans, sport, pregătire examene, centre pentru copii). Înlocuiește Excel, WhatsApp Web, calendar separat, soft de contabilitate și instrumente de marketing — toate într-un singur produs.

## Module incluse

1. **Orar interactiv** — 5 vizualizări, drag & drop, recuperări automate
2. **Finanțe** — abonamente, plăți online, salarii profesori, integrare 1C
3. **CRM și vânzări** — pipeline kanban, automatizări, atribuire UTM
4. **Comunicare multi-canal** — WhatsApp, Telegram, SMS, Email
5. **Aplicație mobilă** — iOS/Android cu gamification
6. **Rapoarte și analize** — LTV, ARPU, churn, profitabilitate
7. **HR și echipă** — roluri custom, rating profesori, comisioane
8. **Multi-filiale și franciză** — rețele de centre dintr-un singur cont
9. **Integrări 350+** — telefonie, plăți, contabilitate, automation
10. **AI Assistant** — generare comunicare, sumarizare lecții, predicție churn

## Stack tehnic

- **React 18** cu TypeScript strict
- **Vite** pentru build și dev server
- **Tailwind CSS** + design system Vector 365 (tokens semantice, dark mode ready)
- **Lucide React** pentru iconițe
- **Onest** font (Google Fonts)

## Rulare locală

```bash
npm install
npm run dev
```

Apoi deschide [http://localhost:5173](http://localhost:5173).

## Build pentru producție

```bash
npm run build
npm run preview
```

## Structură

```
src/
├── components/         # secțiunile landing-ului
│   ├── Navbar.tsx
│   ├── Hero.tsx
│   ├── TrustBar.tsx
│   ├── Features.tsx
│   ├── ModuleSpotlight.tsx
│   ├── Stats.tsx
│   ├── Audience.tsx
│   ├── Integrations.tsx
│   ├── Comparison.tsx
│   ├── Pricing.tsx
│   ├── Testimonials.tsx
│   ├── FAQ.tsx
│   ├── CTA.tsx
│   ├── Footer.tsx
│   └── Logo.tsx
├── lib/
│   └── utils.ts        # cn() helper + paleta pastel
├── App.tsx
├── main.tsx
└── index.css           # tokens design system (CSS custom properties)
```

## Design system

Toate culorile, spacing-ul, radius-urile și shadow-urile vin din **Vector 365 Design System** (vezi `src/index.css` pentru tokens).

Schimbarea brandului se face dintr-un singur loc — `--primary` în `:root`.

## Secțiuni landing

1. **Hero** cu preview interactiv al dashboard-ului
2. **Trust bar** cu logos clienți
3. **Features grid** — 10 module
4. **Module spotlight** — 4 module în detaliu cu vizualizări custom
5. **Stats** — proof de scală
6. **Audience** — 8 tipuri de centre țintă
7. **Integrations** — 8 categorii de integrări
8. **Comparison** — vs Excel vs CRM generic
9. **Testimonials** — 6 reviews din diverse centre
10. **Pricing** — 4 planuri cu toggle lunar/anual
11. **FAQ** — 10 întrebări frecvente
12. **CTA** final cu gradient
13. **Footer** cu newsletter și 4 coloane de linkuri

## Licență

Proprietate Vector Learn SRL.
