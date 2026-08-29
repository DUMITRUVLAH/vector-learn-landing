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
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CircleSlash,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GitBranch,
  GitCompare,
  HelpCircle,
  Image as ImageIcon,
  Keyboard,
  Languages,
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
      href: "/business/features/ai-citeste-documentul",
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

/* ══════════════════════ AI care citește documentul ══════════════════════ */

const aiCapture: FeatureDef = {
  slug: "ai-citeste-documentul",
  navLabel: "AI care citește documentul",
  seoTitle: "Extragere automată din documente — FinFlow by Vector",
  seoDescription:
    "Urci contractul, factura sau poza actului. AI-ul scoate beneficiarul, codul fiscal, IBAN-ul și suma, apoi compară documentul cu cererea și îți arată unde nu se potrivesc.",

  eyebrow: "AI · Extragere din documente",
  h1: "Scoate datele din orice act, în câteva secunde",
  h1Accent: "în câteva secunde",
  heroSub:
    "Urci contractul, factura sau poza actului. Cererea se completează singură cu beneficiarul, codul fiscal, IBAN-ul și suma — apoi AI-ul compară documentul cu ce ai scris și îți arată exact unde nu se potrivesc.",
  heroVisual: (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5">
        <ScanLine className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1 truncate text-xs font-medium">act-primire-predare-2026.pdf</span>
        <Badge variant="success">citit</Badge>
      </div>
      {[
        { k: "Beneficiar", v: DEMO.vendor, ok: true },
        { k: "Cod fiscal", v: "1000000000001", ok: true },
        { k: "IBAN", v: "MD00EXMP0000000000004271", ok: true },
        { k: "Sumă", v: "148 500,00 MDL", ok: true },
        { k: "Bancă", v: "nu apare în document", ok: false },
      ].map((f) => (
        <div key={f.k} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">{f.k}</span>
          <span
            className={`truncate text-[11px] tabular-nums ${f.ok ? "font-semibold" : "italic text-muted-foreground"}`}
          >
            {f.v}
          </span>
        </div>
      ))}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Anexa are alt IBAN decât cererea</p>
        <p className="text-[10px] text-muted-foreground">AI-ul semnalează, omul decide.</p>
      </div>
    </div>
  ),

  benefits: [
    {
      icon: Keyboard,
      title: "Actele intră fără să tasteze nimeni",
      desc: "Beneficiar, cod fiscal, IBAN, sumă și scop — scoase direct din act. Timpul se duce pe verificat, nu pe retastat IBAN-uri dintr-un PDF.",
    },
    {
      icon: BadgeCheck,
      title: "Un dosar curat începe de la date curate",
      desc: "Suma, valuta și rechizitele corecte din primul pas, nu reparate după ce cererea a trecut deja de două semnături.",
    },
    {
      icon: CircleSlash,
      title: "Nu inventează. Când nu știe, lasă gol",
      desc: "Un câmp care nu apare în document rămâne gol, nu ghicit — și e marcat ca necitit, ca să nu-l confunzi cu unul verificat.",
    },
    {
      icon: ClipboardList,
      title: "Urma începe de la încărcare",
      desc: "Documentul, ce a citit AI-ul din el și ce a corectat omul rămân împreună în același dosar, până la audit.",
    },
  ],

  blocksTitle: "Cum funcționează",
  blocks: [
    {
      id: "orice-act",
      badge: "Orice tip de act",
      title: "Nu doar facturi — orice act pe care îl are dosarul",
      body: "Majoritatea instrumentelor de OCR se opresc la factură. Aici, cererea de plată se sprijină pe ce ai tu de fapt în mână: un contract, un act de primire-predare, un proces-verbal, un deviz sau poza unei chitanțe.",
      bullets: [
        "Factură, cont de plată, contract, act de primire-predare, proces-verbal, deviz, chitanță, bon, ofertă, invoice străin",
        "PDF, poză sau scan, Word, Excel, CSV și text",
        "Un PDF scanat, fără strat de text, e citit ca imagine — nu e respins",
        "Extrage și liniile de deviz, nu doar totalul",
      ],
      visual: (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {["Contract", "Factură", "Act primire-predare", "Proces-verbal", "Deviz", "Chitanță", "Ofertă"].map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: FileText, label: "PDF" },
              { icon: ImageIcon, label: "Poză / scan" },
              { icon: FileText, label: "Word" },
              { icon: FileSpreadsheet, label: "Excel / CSV" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <f.icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate text-[11px] font-medium">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border px-3 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Liniile de deviz
            </p>
            {[
              { d: "Revizie tehnică echipament", v: "96 000,00" },
              { d: "Piese de schimb", v: "52 500,00" },
            ].map((r) => (
              <div key={r.d} className="flex items-center justify-between gap-3 py-1">
                <span className="truncate text-[11px]">{r.d}</span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "cine-incaseaza",
      badge: "Beneficiarul corect",
      title: "Știe cine încasează și cine plătește",
      body: "Greșeala scumpă nu e o literă citită prost — e plătitul către partea greșită. Pe un act sunt cel puțin două companii, iar în actele de la noi cuvântul „Beneficiar” înseamnă aproape întotdeauna clientul care plătește, nu cel care încasează.",
      bullets: [
        "Beneficiarul plății e Prestatorul / Furnizorul / Executorul — nu organizația ta",
        "„Beneficiar” și „Autoritatea contractantă” sunt citite ca fiind clientul care plătește",
        "Partea ale cărei date bancare apar pentru încasare e cea propusă la plată",
        "Când două companii sunt la fel de plauzibile, întreabă în loc să ghicească",
      ],
      visual: (
        <div className="space-y-2.5">
          {[
            { name: DEMO.vendor, role: "Prestator · încasează", pick: true },
            { name: "Asociația „Acces Digital”", role: "Beneficiar din contract · plătește", pick: false },
          ].map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border px-3 py-2.5 ${p.pick ? "border-primary/40 bg-primary/5" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{p.role}</span>
                </span>
                {p.pick ? <Badge variant="success">Plătit</Badge> : <Badge variant="secondary">Plătitor</Badge>}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-2">
              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-[11px] font-bold">Când nu e clar, întreabă</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              „Actul menționează două companii. Care dintre ele încasează?” — mai bine o întrebare decât un IBAN
              greșit.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "limbi",
      badge: "Limbă și terminologie",
      title: "Română, rusă și engleză — plus termenii din actele de aici",
      body: "Un extractor generic vede „Исполнитель” sau „Bill From” și nu știe ce rol e. Aici terminologia contractuală din Moldova e parte din model: aceleași roluri, oricum ar fi scrise, și codurile fiscale locale recunoscute după formă, nu după etichetă.",
      bullets: [
        "Prestator, Furnizor, Vânzător, Antreprenor · Исполнитель, Поставщик, Подрядчик · Supplier, Seller, Bill From",
        "IDNO = IDNP = cod fiscal = ИДНО — toate ajung în același câmp",
        "Codul TVA e ținut separat, ca să nu fie confundat cu codul fiscal",
        "Un cod de 13 cifre e recunoscut ca IDNP chiar dacă e tipărit fără etichetă",
      ],
      visual: (
        <div className="space-y-2">
          {[
            { src: "Prestator / Поставщик / Bill From", dst: "Beneficiarul plății" },
            { src: "Beneficiar / Заказчик / Bill To", dst: "Clientul care plătește" },
            { src: "IDNO · IDNP · cod fiscal · ИДНО", dst: "Cod fiscal (13 cifre)" },
            { src: "Cod TVA · VAT · Код НДС", dst: "Cod TVA (câmp separat)" },
          ].map((r) => (
            <div key={r.src} className="rounded-xl border border-border px-3 py-2.5">
              <p className="mb-1 truncate text-[11px] text-muted-foreground">{r.src}</p>
              <div className="flex items-center gap-2">
                <Languages className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <p className="truncate text-[11px] font-semibold">{r.dst}</p>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "comparatie",
      badge: "Verificare",
      title: "Compară actul cu cererea și îți arată ambele valori",
      body: "„2 neconcordanțe” nu ajută pe nimeni. Cine se uită urmează să decidă dacă greșește documentul sau formularul — și nu poate face asta fără cele două valori una lângă alta. Iar tăcerea nu înseamnă acord: câmpurile pe care AI-ul nu le-a putut citi sunt listate separat.",
      bullets: [
        "Se verifică beneficiarul, codul fiscal, IBAN-ul, banca, suma și valuta",
        "Fiecare diferență arată ce scrie în document și ce scrie în cerere",
        "„Nu am putut citi” e afișat separat de „nu se potrivește”",
        "Aprobatorul vede semnalul înainte să semneze, nu la raportul de la final de lună",
      ],
      visual: (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">2 neconcordanțe</p>
          </div>
          {[
            { f: "Sumă", doc: "148 500,00 MDL", req: "145 000,00 MDL" },
            { f: "IBAN", doc: "MD00…4271", req: "MD00…9038" },
          ].map((r) => (
            <div key={r.f} className="rounded-xl border border-border px-3 py-2.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{r.f}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px]">
                  în document{" "}
                  <span className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">{r.doc}</span>
                </span>
                <span className="shrink-0 truncate text-[11px]">
                  în cerere <span className="font-semibold tabular-nums">{r.req}</span>
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <GitCompare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground">
              4 câmpuri concordante · 1 câmp necitit (bancă)
            </span>
          </div>
        </div>
      ),
    },
  ],

  related: [
    {
      icon: Layers,
      title: "Aprobări pe mai multe niveluri",
      desc: "Ce se întâmplă cu cererea după ce datele sunt în ea: pragurile construiesc singure lanțul.",
      href: "/business/features/aprobari-multi-nivel",
    },
    {
      icon: ShieldCheck,
      title: "Securitate și GDPR",
      desc: "Unde stau datele, cine le vede și ce se jurnalizează la fiecare apel de AI.",
      href: "/business#securitate",
    },
    {
      icon: Wand2,
      title: "Fluxul complet, de la cerere la plată",
      desc: "Finanțe, execuție, e-Factura — tot drumul, în aceeași platformă.",
      href: "/business#flux",
    },
  ],

  faq: [
    {
      q: "Ce tipuri de documente citește?",
      a: "Orice act pe care îl are dosarul, nu doar facturi: contract, cont de plată, act de primire-predare a serviciilor, proces-verbal, deviz, ordin de plată, chitanță, bon, ofertă sau invoice străin. Nu refuză un document doar pentru că nu e factură.",
    },
    {
      q: "Ce formate de fișier acceptă?",
      a: "PDF, imagini (poză sau scan), Word, Excel, CSV și text simplu. Un PDF scanat care nu are strat de text e trimis mai departe ca imagine, deci nu rămâne necitit.",
    },
    {
      q: "În ce limbi funcționează?",
      a: "Română, rusă și engleză, cu terminologia contractuală folosită în Moldova. Prestator, Поставщик și Bill From ajung la același rol, iar IDNO, IDNP, cod fiscal și ИДНО ajung în același câmp.",
    },
    {
      q: "Ce se întâmplă dacă citește greșit?",
      a: "Nimic nu se trimite singur. Fiecare câmp completat de AI rămâne editabil, iar ce nu apare în document rămâne gol și marcat ca necitit — ca să nu confunzi un câmp neverificat cu unul verificat.",
    },
    {
      q: "Cum știu că actul chiar corespunde cererii?",
      a: "AI-ul compară documentul cu formularul pe beneficiar, cod fiscal, IBAN, bancă, sumă și valută, și arată pentru fiecare diferență ce scrie în document și ce scrie în cerere. Câmpurile pe care nu le-a putut citi sunt listate separat de cele care nu se potrivesc.",
    },
    {
      q: "Ce se întâmplă dacă documentul are mai multe conturi bancare?",
      a: "Fiecare cont e legat de partea lângă care e tipărit, nu amestecat între companii. Dacă aceeași parte are mai multe conturi — unul în lei și unul în valută, de exemplu — sunt păstrate toate, iar tu alegi contul pe care se face plata.",
    },
    {
      q: "Datele din documentele mele ajung la un furnizor extern de AI?",
      a: "Da — textul documentului e trimis modelului (OpenAI sau Anthropic, în funcție de configurare) ca să poată fi citit. Fiecare apel e jurnalizat, cu buget lunar și posibilitatea de a opri funcția. Cu AI-ul oprit, aplicația rămâne funcțională: cererea se completează manual, ca până acum.",
    },
    {
      q: "Cine plătește dacă documentul menționează două companii?",
      a: "Beneficiarul plății e întotdeauna Prestatorul, Furnizorul sau Executorul — partea care prestează și încasează, de regulă cea ale cărei date bancare apar pe act. Când două companii sunt la fel de plauzibile, sistemul întreabă în loc să aleagă singur.",
    },
  ],

  ctaTitle: "Încarcă un act și vezi ce scoate din el",
  ctaSub:
    "Îți creezi workspace-ul, urci un contract sau o factură reală și vezi cererea completându-se. Fără card bancar.",
};

/* ══════════════════════ Registru ══════════════════════ */

/** Toate paginile de feature, indexate după slug. Adaugi o pagină nouă adăugând o intrare. */
export const FEATURES: Record<string, FeatureDef> = {
  [multiLevel.slug]: multiLevel,
  [aiCapture.slug]: aiCapture,
};

export function getFeature(slug: string): FeatureDef | undefined {
  return FEATURES[slug];
}
