/**
 * Conținutul paginilor de feature. O pagină = o intrare în `FEATURES`.
 *
 * Structura e modelată după paginile de produs ApprovalMax (owner: „ca design, ca structură
 * îmi place"), dar mesajele sunt rescrise pentru FinFlow și pentru realitatea din Moldova:
 * cereri de plată, praguri de semnătură, dosar pentru donator.
 *
 * Două reguli de conținut, aceleași ca pe landing:
 * 1. **Toate datele afișate sunt inventate.** Nume, IDNO și IBAN sintetice (IBAN cu cifra de
 *    control `00`, imposibilă). O pagină publică nu publică date reale de beneficiari.
 * 2. **Nicio afirmație pe care aplicația nu o susține.** Dacă o capacitate nu există încă
 *    (memento automat către aprobator, de ex.), nu apare aici — nici măcar „în curând".
 */
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  GitBranch,
  Layers,
  Lock,
  ScanLine,
  ShieldCheck,
  UserMinus,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ds";
import type { FeatureDef } from "./types";

/** Date de vitrină — inventate integral (vezi nota din capul fișierului). */
const DEMO = {
  requestNo: "PAR-2026-0042",
  amount: "148 500,00 MDL",
  project: "Acces Digital",
  vendor: "SRL „Tehnorevizie”",
  requester: "Ana Popescu",
  approver1: { name: "Victor Bălan", role: "Supervizor de proiect" },
  approver2: { name: "Natalia Ursu", role: "Finanțe" },
  approver3: { name: "Mihai Rusu", role: "Director executiv" },
  deputy: { name: "Elena Grosu", role: "Director adjunct" },
} as const;

/* ══════════════════════ Aprobări pe mai multe niveluri ══════════════════════ */

const multiLevel: FeatureDef = {
  slug: "aprobari-multi-nivel",
  navLabel: "Aprobări pe mai multe niveluri",
  seoTitle: "Aprobări pe mai multe niveluri — FinFlow by Vector",
  seoDescription:
    "Configurezi pragurile o dată, iar fiecare cerere de plată își construiește singură lanțul de aprobare: secvențial sau în paralel, oricâte trepte cere politica ta.",

  eyebrow: "Aprobări",
  h1: "Aprobări care fac față complexității reale",
  h1Accent: "complexității reale",
  heroSub:
    "Fie că e o cerere de plată, un avans sau un decont, îți configurezi regulile o dată. Apoi fiecare cerere urmează exact traseul pe care îl cere politica ta — oricâte trepte ar avea.",
  heroVisual: (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tabular-nums">{DEMO.requestNo}</span>
        <Badge variant="warning">La aprobat</Badge>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
        <span className="text-[11px] text-muted-foreground">Sumă</span>
        <span className="text-[11px] font-semibold tabular-nums">{DEMO.amount}</span>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
        <span className="text-[11px] text-muted-foreground">Proiect</span>
        <span className="text-[11px] font-semibold">{DEMO.project}</span>
      </div>

      <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Lanțul construit automat
      </p>
      {[
        { p: DEMO.approver1, state: "done" as const },
        { p: DEMO.approver2, state: "current" as const },
        { p: DEMO.approver3, state: "next" as const },
      ].map((s, i) => (
        <div
          key={s.p.name}
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
            s.state === "current" ? "border-primary/40 bg-primary/5" : "border-border"
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              s.state === "done"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : s.state === "current"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {s.state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold">{s.p.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{s.p.role}</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {s.state === "done" ? "aprobat" : s.state === "current" ? "la el acum" : "urmează"}
          </span>
        </div>
      ))}
    </div>
  ),

  benefits: [
    {
      icon: Layers,
      title: "Complexitatea nu strică acuratețea",
      desc: "Oricâte praguri, proiecte și excepții ai, cererea ajunge de fiecare dată la aprobatorii pe care îi cere politica — nu la cine își amintește cineva.",
    },
    {
      icon: GitBranch,
      title: "Fluxuri pe măsura organizației",
      desc: "Secvențial sau în paralel, pe bandă de sumă, proiect sau tip de cheltuială. Regula o scrii o dată; de aplicat o aplică sistemul.",
    },
    {
      icon: UserMinus,
      title: "Concediul nu mai blochează plata",
      desc: "Delegare pe perioadă determinată, către o persoană anume, fără să dai parola nimănui și fără să dispară din urmă cine a semnat de fapt.",
    },
    {
      icon: ClipboardList,
      title: "Urma rămâne, oricât de complicat e traseul",
      desc: "Cine, ce, când și pe ce versiune de document. Jurnal care nu se editează, filtrabil și exportabil pentru audit sau donator.",
    },
  ],

  blocksTitle: "Cum funcționează",
  blocks: [
    {
      id: "reguli",
      badge: "Reguli",
      title: "Fluxul rulează pe regulile pe care le pui tu",
      body: "Definești benzile de sumă și cine semnează pe fiecare. La trimitere, FinFlow citește suma, proiectul și tipul cheltuielii și construiește lanțul — fără ca solicitantul să aleagă pe cineva „din cap”.",
      bullets: [
        "Trepte pe bandă de sumă: sub prag o semnătură, peste prag trei",
        "Reguli separate pe proiect, plătitor sau cod bugetar",
        "Trepte secvențiale (una după alta) sau în paralel (toți deodată)",
        "Modifici pragul o dată — se aplică tuturor cererilor următoare",
      ],
      visual: (
        <div className="space-y-2">
          {[
            { band: "≤ 10 000 MDL", chain: "Supervizor", steps: 1 },
            { band: "10 000 – 100 000", chain: "Supervizor → Director executiv", steps: 2 },
            { band: "> 100 000 MDL", chain: "Supervizor → Finanțe → Director", steps: 3 },
          ].map((r) => (
            <div key={r.band} className="rounded-xl border border-border px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold tabular-nums">{r.band}</span>
                <Badge variant="outline">
                  {r.steps} {r.steps === 1 ? "semnătură" : "semnături"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: r.steps }).map((_, i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full bg-primary/70" />
                ))}
                {Array.from({ length: 3 - r.steps }).map((_, i) => (
                  <span key={`e${i}`} className="h-1.5 flex-1 rounded-full bg-muted" />
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">{r.chain}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "segregare",
      badge: "Segregarea responsabilităților",
      title: "Nimeni nu-și aprobă propria cerere",
      body: "Regula pe care orice auditor o caută prima: persoana care cere banii nu e aceeași cu cea care îi aprobă și nici cu cea care îi execută. FinFlow o impune la nivel de sistem, nu de bună-credință.",
      bullets: [
        "Solicitantul e sărit automat din lanț dacă apare și ca aprobator",
        "Aprobarea și execuția plății sunt roluri diferite",
        "Rechizitele bancare le vede doar cine are treabă cu cererea",
        "Fiecare acces la datele bancare rămâne în jurnal",
      ],
      visual: (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
              AP
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold">{DEMO.requester}</span>
              <span className="block text-[10px] text-muted-foreground">a depus cererea</span>
            </span>
            <Badge variant="secondary">Solicitant</Badge>
          </div>
          {/* Perechea explicită light/dark: pe tema închisă `--destructive` e un roșu ÎNCHIS
              (0 62% 30%), gândit ca fundal — ca text pe o suprafață închisă devine ilizibil. */}
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              <p className="text-[11px] font-bold text-red-700 dark:text-red-400">Nu poate aproba această cerere</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Este solicitantul. Sistemul trece treapta la următorul aprobator eligibil.
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              VB
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold">{DEMO.approver1.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{DEMO.approver1.role}</span>
            </span>
            <Badge variant="outline">Aprobator</Badge>
          </div>
        </div>
      ),
    },
    {
      id: "delegare",
      badge: "Delegare",
      title: "Când aprobatorul lipsește, cererea nu stă",
      body: "Directorul pleacă două săptămâni. În loc să circule parola sau să se aprobe „pe WhatsApp, seara”, deleghezi dreptul de semnătură pe perioada exactă a absenței, către o persoană anume.",
      bullets: [
        "Delegare cu dată de început și de sfârșit — expiră singură",
        "În jurnal rămâne și cine a semnat, și în numele cui",
        "Vezi în orice moment la ce treaptă e cererea și cine urmează",
        "Delegarea se retrage oricând, fără să afecteze ce s-a aprobat deja",
      ],
      visual: (
        <div className="space-y-3">
          <div className="rounded-xl border border-border px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Delegare activă
            </p>
            <p className="text-[11px] font-semibold">
              {DEMO.approver3.name} → {DEMO.deputy.name}
            </p>
            <p className="text-[10px] text-muted-foreground">12–26 martie · drept de aprobare, treapta 3</p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              EG
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold">{DEMO.deputy.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                în numele lui {DEMO.approver3.name}
              </span>
            </span>
            <Badge variant="success">Aprobat</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            După 26 martie, dreptul se întoarce automat. Nimeni nu trebuie să-și amintească să-l retragă.
          </p>
        </div>
      ),
    },
    {
      id: "urma",
      badge: "Audit",
      title: "Fiecare aprobare lasă o urmă de hârtie",
      body: "Nu mai reconstruiești dosarul din e-mailuri și capturi de ecran. Istoricul se scrie singur, în momentul deciziei, și iese ca PDF oficial sau ca export filtrabil când îl cere auditorul ori donatorul.",
      bullets: [
        "Jurnal append-only: nimic nu se editează și nimic nu se șterge",
        "Formularul oficial, cu toate secțiunile, generat ca PDF",
        "Filtrezi pe proiect, perioadă, beneficiar sau aprobator",
        "Export CSV, XLSX și PDF pentru raportarea către finanțator",
      ],
      visual: (
        <div className="space-y-2">
          {[
            { t: "10:04", who: DEMO.requester, what: "a trimis cererea", tone: "muted" as const },
            { t: "11:20", who: DEMO.approver1.name, what: "a aprobat · treapta 1", tone: "ok" as const },
            { t: "14:47", who: DEMO.approver2.name, what: "a cerut clarificări", tone: "warn" as const },
            { t: "09:12", who: DEMO.approver2.name, what: "a aprobat · treapta 2", tone: "ok" as const },
            { t: "09:40", who: DEMO.deputy.name, what: "a aprobat · treapta 3", tone: "ok" as const },
          ].map((r) => (
            <div key={`${r.t}-${r.what}`} className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{r.t}</span>
              <span className="min-w-0 flex-1 truncate text-[11px]">
                <span className="font-semibold">{r.who}</span> {r.what}
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  r.tone === "ok" ? "bg-emerald-500" : r.tone === "warn" ? "bg-amber-500" : "bg-muted-foreground/40"
                }`}
                aria-hidden="true"
              />
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1 truncate text-[11px] font-medium">{DEMO.requestNo}-audit.pdf</span>
            <span className="text-[10px] text-muted-foreground">gata de trimis</span>
          </div>
        </div>
      ),
    },
  ],

  related: [
    {
      icon: ScanLine,
      title: "AI care citește documentul",
      desc: "Beneficiar, cod fiscal, IBAN și sumă, extrase din contract sau factură — fără retastare.",
      href: "/business#ai",
    },
    {
      icon: ShieldCheck,
      title: "Securitate și GDPR",
      desc: "Date în Europa, acces minim necesar, jurnal de audit care nu se editează.",
      href: "/business#securitate",
    },
    {
      icon: Wand2,
      title: "Fluxul complet, de la cerere la plată",
      desc: "Ce se întâmplă după ultima semnătură: finanțe, execuție, e-Factura.",
      href: "/business#flux",
    },
  ],

  faq: [
    {
      q: "Câte trepte de aprobare pot configura?",
      a: "Câte cere politica ta. Definești benzi de sumă, iar fiecare bandă poate avea oricâte trepte — de la o singură semnătură pentru cheltuieli mici, până la lanțuri cu supervizor, finanțe și director pentru sumele mari.",
    },
    {
      q: "Aprobatorii au nevoie de acces la contabilitate?",
      a: "Nu. Aprobatorul intră în FinFlow, vede cererea, documentele atașate și contextul de care are nevoie — și atât. Nu are acces la restul evidenței financiare, iar rechizitele bancare le vede doar cine are treabă cu cererea.",
    },
    {
      q: "Ce se întâmplă dacă un aprobator e în concediu?",
      a: "Deleghezi dreptul de semnătură pe perioada exactă a absenței, către o persoană anume. Delegarea expiră singură la data pusă, iar în jurnal rămâne scris și cine a semnat, și în numele cui.",
    },
    {
      q: "Pot avea reguli diferite pe proiecte sau pe entități juridice?",
      a: "Da. Structura e plătitor → proiect → cod bugetar, cu acces separat pe fiecare nivel, deci un proiect finanțat de un donator poate avea alte praguri decât bugetul propriu.",
    },
    {
      q: "Cu ce e mai bun decât aprobarea pe e-mail sau WhatsApp?",
      a: "Pe e-mail nimeni nu știe la cine stă cererea, aprobarea nu e legată de o versiune anume a documentului, iar dosarul pentru audit se adună manual, zile în șir. Aici traseul e impus de reguli, iar dovada se scrie singură în momentul deciziei.",
    },
    {
      q: "Se poate schimba suma după ce cererea a fost trimisă?",
      a: "Nu. După trimitere conținutul e sigilat — sumele nu se mai schimbă. Dacă e nevoie de altceva, cererea se întoarce la solicitant și pornește un ciclu nou de aprobare, vizibil în istoric.",
    },
    {
      q: "Ce se întâmplă dacă suma plătită depășește ce s-a aprobat?",
      a: "Depășirea nu așteaptă raportul de la final de lună: peste pragul stabilit, cererea intră automat la reaprobare, pe loc.",
    },
    {
      q: "Cum arată dovada pentru auditor sau donator?",
      a: "Formularul oficial iese ca PDF, cu toate secțiunile completate, iar jurnalul de audit e append-only și filtrabil pe proiect, perioadă, beneficiar sau aprobator, cu export CSV, XLSX și PDF.",
    },
  ],

  ctaTitle: "Pune-ți pragurile o singură dată",
  ctaSub:
    "Îți creezi workspace-ul, inviți aprobatorii, configurezi benzile de sumă și trimiți o cerere reală. Fără card bancar.",
};

/* ══════════════════════ Registru ══════════════════════ */

/** Toate paginile de feature, indexate după slug. Adaugi o pagină nouă adăugând o intrare. */
export const FEATURES: Record<string, FeatureDef> = {
  [multiLevel.slug]: multiLevel,
};

export function getFeature(slug: string): FeatureDef | undefined {
  return FEATURES[slug];
}
