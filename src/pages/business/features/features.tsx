/**
 * Conținutul paginilor de feature. O pagină = o intrare în `FEATURES`.
 *
 * Structura e modelată după paginile de produs ApprovalMax (owner: „ca design, ca structură
 * îmi place"), dar mesajele sunt rescrise pentru FinFlow și pentru realitatea din Moldova:
 * cereri de plată, praguri de semnătură, dosar pentru donator.
 *
 * ── Regula vizuală (owner, după prima versiune) ──────────────────────────────────────────
 * „În aceste screenuri e mult text și greu de înțeles pasul 1 2 3 4 5."
 *
 * Prima versiune reconstruia ecrane reale, dense: rânduri de 10–11px, cinci-șase câmpuri pe
 * vizual, tabele. Arătau *ce* face produsul, dar nu *în ce ordine* — cititorul trebuia să
 * citească ca să înțeleagă. Acum:
 *   • fiecare pagină începe cu o diagramă numerotată 1→5, tot parcursul dintr-o privire;
 *   • fiecare bloc poartă numărul treptei pe care o explică, deci nu se pierde nimeni;
 *   • fiecare vizual are UN SINGUR lucru de spus, în 2–4 elemente mari, nu în șase rânduri mici;
 *   • dimensiunea minimă de text în vizuale e `text-xs` (12px), nu 10px.
 * Dacă adaugi un vizual nou și ai nevoie de o legendă ca să se înțeleagă, vizualul e greșit.
 *
 * ── Regulile de conținut, aceleași ca pe landing ─────────────────────────────────────────
 * 1. **Toate datele afișate sunt inventate.** Nume, IDNO și IBAN sintetice (IBAN cu cifra de
 *    control `00`, imposibilă). O pagină publică nu publică date reale de beneficiari.
 * 2. **Nicio afirmație pe care aplicația nu o susține.** Dacă o capacitate nu există încă
 *    (memento automat către aprobator, de ex.), nu apare aici — nici măcar „în curând".
 */
import {
  AlertTriangle,
  ArrowDown,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  ClipboardList,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  GitBranch,
  GitCompare,
  HelpCircle,
  Image as ImageIcon,
  Keyboard,
  Languages,
  Layers,
  MoveRight,
  ScanLine,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserMinus,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ds";
import type { FeatureDef } from "./types";

/** Date de vitrină — inventate integral (vezi nota din capul fișierului). */
const DEMO = {
  amount: "148 500 MDL",
  vendor: "SRL „Tehnorevizie”",
  client: "Asociația „Acces Digital”",
  requester: "Ana Popescu",
  approver1: { name: "Victor Bălan", role: "Supervizor", initials: "VB" },
  approver2: { name: "Natalia Ursu", role: "Finanțe", initials: "NU" },
  approver3: { name: "Mihai Rusu", role: "Director", initials: "MR" },
  deputy: { name: "Elena Grosu", role: "Director adjunct", initials: "EG" },
} as const;

/* ─────────────────── Cărămizi de vizual, refolosite pe ambele pagini ─────────────────── */

/** O persoană pe un rând: inițiale, nume, rol, plus o stare la dreapta. */
function PersonRow({
  initials,
  name,
  role,
  right,
  tone = "plain",
}: {
  initials: string;
  name: string;
  role: string;
  right?: React.ReactNode;
  tone?: "plain" | "active" | "done" | "dim";
}) {
  const box =
    tone === "active"
      ? "border-primary/40 bg-primary/5"
      : tone === "done"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : tone === "dim"
          ? "border-border opacity-60"
          : "border-border";
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${box}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{role}</span>
      </span>
      {right}
    </div>
  );
}

/** Săgeata verticală dintre două etaje ale unei diagrame. */
function DownArrow() {
  return (
    <div className="flex justify-center py-0.5">
      <ArrowDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

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
      <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
        <span>
          <span className="block text-xs text-muted-foreground">Cerere de plată</span>
          <span className="block text-2xl font-bold tabular-nums">{DEMO.amount}</span>
        </span>
        <Badge variant="warning">La aprobat</Badge>
      </div>
      <PersonRow
        initials={DEMO.approver1.initials}
        name={DEMO.approver1.name}
        role={DEMO.approver1.role}
        tone="done"
        right={<CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
      />
      <PersonRow
        initials={DEMO.approver2.initials}
        name={DEMO.approver2.name}
        role={DEMO.approver2.role}
        tone="active"
        right={<span className="shrink-0 text-xs font-semibold text-primary">la el acum</span>}
      />
      <PersonRow
        initials={DEMO.approver3.initials}
        name={DEMO.approver3.name}
        role={DEMO.approver3.role}
        tone="dim"
        right={<span className="shrink-0 text-xs text-muted-foreground">urmează</span>}
      />
    </div>
  ),

  stepsTitle: "Cum trece o cerere prin organizație",
  stepsSub: "Pui regulile o dată. Restul se întâmplă singur, de fiecare dată la fel.",
  steps: [
    { icon: SlidersHorizontal, title: "Pui pragurile", desc: "O singură dată, la început." },
    { icon: GitBranch, title: "Lanțul se face singur", desc: "Suma decide cine semnează." },
    { icon: UserMinus, title: "Solicitantul iese din lanț", desc: "Nimeni nu semnează pentru sine." },
    { icon: CheckCircle2, title: "Se semnează pe rând", desc: "Cine lipsește, deleagă." },
    { icon: ClipboardList, title: "Dosarul e gata", desc: "Urma s-a scris singură." },
  ],

  blocksTitle: "Fiecare pas, pe îndelete",
  blocks: [
    {
      id: "reguli",
      step: 2,
      badge: "Reguli",
      title: "Suma decide cine semnează",
      body: "Definești benzile de sumă și cine semnează pe fiecare. La trimitere, FinFlow citește suma și construiește lanțul — solicitantul nu alege pe nimeni „din cap”.",
      bullets: [
        "Sub prag o semnătură, peste prag trei",
        "Reguli separate pe proiect, plătitor sau cod bugetar",
        "Trepte una după alta sau toți deodată",
        "Schimbi pragul o dată — se aplică tuturor cererilor următoare",
      ],
      visual: (
        <div className="space-y-3">
          {[
            { band: "≤ 10 000", chain: "Supervizor", steps: 1 },
            { band: "10 000 – 100 000", chain: "Supervizor → Director", steps: 2 },
            { band: "> 100 000", chain: "Supervizor → Finanțe → Director", steps: 3 },
          ].map((r) => (
            <div key={r.band} className="rounded-xl border border-border px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-bold tabular-nums">{r.band}</span>
                <span className="flex items-center gap-1" aria-label={`${r.steps} semnături`}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full ${i < r.steps ? "bg-primary" : "bg-muted"}`}
                      aria-hidden="true"
                    />
                  ))}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{r.chain}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "segregare",
      step: 3,
      badge: "Segregarea responsabilităților",
      title: "Nimeni nu-și aprobă propria cerere",
      body: "Regula pe care orice auditor o caută prima: cine cere banii nu e cine îi aprobă și nici cine îi execută. FinFlow o impune la nivel de sistem, nu de bună-credință.",
      bullets: [
        "Solicitantul e sărit automat din lanț",
        "Aprobarea și execuția plății sunt roluri diferite",
        "Rechizitele bancare le vede doar cine are treabă cu cererea",
        "Fiecare acces la datele bancare rămâne în jurnal",
      ],
      visual: (
        <div>
          <PersonRow
            initials="AP"
            name={DEMO.requester}
            role="a depus cererea"
            right={<Badge variant="secondary">Solicitant</Badge>}
          />
          <div className="flex items-center justify-center gap-2 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10">
              <X className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">nu poate semna</span>
          </div>
          <DownArrow />
          <div className="pt-1">
            <PersonRow
              initials={DEMO.approver1.initials}
              name={DEMO.approver1.name}
              role={DEMO.approver1.role}
              tone="active"
              right={<Badge variant="outline">Aprobator</Badge>}
            />
          </div>
        </div>
      ),
    },
    {
      id: "delegare",
      step: 4,
      badge: "Delegare",
      title: "Când aprobatorul lipsește, cererea nu stă",
      body: "Directorul pleacă două săptămâni. În loc să circule parola sau să se aprobe „pe WhatsApp, seara”, dreptul de semnătură trece pe perioada exactă a absenței, către o persoană anume.",
      bullets: [
        "Cu dată de început și de sfârșit — expiră singură",
        "În jurnal rămâne cine a semnat și în numele cui",
        "Vezi oricând la ce treaptă e cererea și cine urmează",
        "Se retrage oricând, fără să afecteze ce s-a aprobat deja",
      ],
      visual: (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold tabular-nums">12 — 26 martie</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 rounded-xl border border-border px-3 py-3 text-center opacity-60">
              <span className="block truncate text-sm font-semibold">{DEMO.approver3.name}</span>
              <span className="block text-xs text-muted-foreground">plecat</span>
            </span>
            <MoveRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 rounded-xl border border-primary/40 bg-primary/5 px-3 py-3 text-center">
              <span className="block truncate text-sm font-semibold">{DEMO.deputy.name}</span>
              <span className="block text-xs text-muted-foreground">semnează</span>
            </span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Pe 27 martie dreptul se întoarce singur. Nimeni nu trebuie să-și amintească.
          </p>
        </div>
      ),
    },
    {
      id: "urma",
      step: 5,
      badge: "Audit",
      title: "Dosarul se scrie singur, pe parcurs",
      body: "Nu mai reconstruiești dosarul din e-mailuri și capturi de ecran. Istoricul se scrie în momentul deciziei și iese ca PDF oficial când îl cere auditorul ori donatorul.",
      bullets: [
        "Jurnal care nu se editează și nu se șterge",
        "Formularul oficial, generat ca PDF",
        "Filtrezi pe proiect, perioadă, beneficiar sau aprobator",
        "Export CSV, XLSX și PDF pentru finanțator",
      ],
      visual: (
        <div>
          <ol className="relative space-y-3 pl-6">
            <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" aria-hidden="true" />
            {[
              { who: DEMO.requester, what: "a trimis cererea", ok: null },
              { who: DEMO.approver1.name, what: "a aprobat", ok: true },
              { who: DEMO.approver2.name, what: "a cerut clarificări", ok: false },
              { who: DEMO.deputy.name, what: `a aprobat pentru ${DEMO.approver3.name}`, ok: true },
            ].map((r) => (
              <li key={r.what} className="relative">
                <span
                  className={`absolute -left-6 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-background ${
                    r.ok === true ? "bg-emerald-500" : r.ok === false ? "bg-amber-500" : "bg-muted-foreground/50"
                  }`}
                  aria-hidden="true"
                />
                <span className="block text-sm font-semibold">{r.who}</span>
                <span className="block text-xs text-muted-foreground">{r.what}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-border px-3 py-3">
            <FileCheck2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1 truncate text-sm font-medium">Dosar de audit.pdf</span>
            <span className="shrink-0 text-xs text-muted-foreground">gata</span>
          </div>
        </div>
      ),
    },
  ],

  benefits: [
    {
      icon: Layers,
      title: "Complexitatea nu strică acuratețea",
      desc: "Cererea ajunge la aprobatorii pe care îi cere politica, nu la cine își amintește cineva.",
    },
    {
      icon: GitBranch,
      title: "Fluxuri pe măsura organizației",
      desc: "Regula o scrii o dată. De aplicat, o aplică sistemul — la fiecare cerere.",
    },
    {
      icon: UserMinus,
      title: "Concediul nu mai blochează plata",
      desc: "Dreptul de semnătură trece pe durata absenței, fără să circule parola nimănui.",
    },
    {
      icon: ClipboardList,
      title: "Urma rămâne, oricât de complicat e traseul",
      desc: "Cine, ce și când — într-un jurnal care nu se editează și se exportă.",
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
    <div>
      <div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-3">
        <ScanLine className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1 truncate text-sm font-medium">act-primire-predare.pdf</span>
        <Badge variant="success">citit</Badge>
      </div>
      <DownArrow />
      <div className="space-y-2">
        {[
          { k: "Beneficiar", v: DEMO.vendor },
          { k: "IBAN", v: "MD00 EXMP …4271" },
          { k: "Sumă", v: "148 500,00 MDL" },
        ].map((f) => (
          <div key={f.k} className="rounded-xl border border-border px-3 py-2.5">
            <span className="block text-xs text-muted-foreground">{f.k}</span>
            <span className="block truncate text-sm font-semibold tabular-nums">{f.v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          Anexa are alt IBAN decât cererea
        </span>
      </div>
    </div>
  ),

  stepsTitle: "De la act încărcat la cerere completată",
  stepsSub: "Tot ce urmează se întâmplă în câteva secunde, fără să tastezi nimic.",
  steps: [
    { icon: Upload, title: "Urci actul", desc: "PDF, poză, Word sau Excel." },
    { icon: FileText, title: "Se citește orice act", desc: "Nu doar facturi." },
    { icon: Send, title: "Se alege cine încasează", desc: "Prestatorul, nu tu." },
    { icon: Languages, title: "Termenii locali", desc: "RO, RU, EN — același rol." },
    { icon: GitCompare, title: "Se compară cu cererea", desc: "Diferențele ies la lumină." },
  ],

  blocksTitle: "Fiecare pas, pe îndelete",
  blocks: [
    {
      id: "orice-act",
      step: 2,
      badge: "Orice tip de act",
      title: "Nu doar facturi — orice act pe care îl are dosarul",
      body: "Majoritatea instrumentelor de OCR se opresc la factură. Aici, cererea se sprijină pe ce ai tu de fapt în mână: un contract, un act de primire-predare, un deviz sau poza unei chitanțe.",
      bullets: [
        "Contract, act de primire-predare, proces-verbal, deviz, chitanță, ofertă, invoice străin",
        "PDF, poză sau scan, Word, Excel, CSV",
        "Un PDF scanat, fără strat de text, e citit ca imagine — nu e respins",
        "Extrage și liniile de deviz, nu doar totalul",
      ],
      visual: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { icon: FileText, label: "PDF" },
              { icon: ImageIcon, label: "Poză / scan" },
              { icon: FileText, label: "Word" },
              { icon: FileSpreadsheet, label: "Excel / CSV" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-3">
                <f.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Contract", "Act primire-predare", "Deviz", "Proces-verbal", "Chitanță", "Ofertă"].map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "cine-incaseaza",
      step: 3,
      badge: "Beneficiarul corect",
      title: "Știe cine încasează și cine plătește",
      body: "Greșeala scumpă nu e o literă citită prost — e plătitul către partea greșită. Pe un act sunt cel puțin două companii, iar în actele de la noi „Beneficiar” înseamnă aproape întotdeauna clientul care plătește, nu cel care încasează.",
      bullets: [
        "Beneficiarul plății e Prestatorul — nu organizația ta",
        "„Beneficiar” și „Autoritatea contractantă” = clientul care plătește",
        "Partea cu datele bancare pentru încasare e cea propusă la plată",
        "Când două companii sunt la fel de plauzibile, întreabă",
      ],
      visual: (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{DEMO.vendor}</span>
                <span className="block text-xs text-muted-foreground">Prestator · încasează</span>
              </span>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
          </div>
          <div className="rounded-xl border border-border px-3 py-3 opacity-60">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{DEMO.client}</span>
                <span className="block text-xs text-muted-foreground">„Beneficiar” în contract · plătește</span>
              </span>
              <X className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3 py-3">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-xs leading-relaxed">
              Când nu e clar, întreabă: <em>„Actul menționează două companii. Care încasează?”</em>
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "limbi",
      step: 4,
      badge: "Limbă și terminologie",
      title: "Română, rusă și engleză — plus termenii din actele de aici",
      body: "Un extractor generic vede „Исполнитель” sau „Bill From” și nu știe ce rol e. Aici terminologia contractuală din Moldova e parte din model: același rol, oricum ar fi scris.",
      bullets: [
        "Prestator · Поставщик · Bill From — același rol",
        "IDNO = IDNP = cod fiscal = ИДНО, toate în același câmp",
        "Codul TVA e ținut separat, ca să nu fie confundat cu cel fiscal",
        "Un cod de 13 cifre e recunoscut chiar tipărit fără etichetă",
      ],
      visual: (
        <div className="space-y-3">
          {[
            { src: ["Prestator", "Поставщик", "Bill From"], dst: "Beneficiarul plății" },
            { src: ["Beneficiar", "Заказчик", "Bill To"], dst: "Clientul care plătește" },
            { src: ["IDNO", "IDNP", "ИДНО"], dst: "Cod fiscal · 13 cifre" },
          ].map((r) => (
            <div key={r.dst} className="rounded-xl border border-border px-3 py-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {r.src.map((t) => (
                  <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <ArrowDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate text-sm font-semibold">{r.dst}</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "comparatie",
      step: 5,
      badge: "Verificare",
      title: "Compară actul cu cererea și îți arată ambele valori",
      body: "„2 neconcordanțe” nu ajută pe nimeni. Cine se uită urmează să decidă dacă greșește documentul sau formularul — și nu poate fără cele două valori una lângă alta. Iar tăcerea nu înseamnă acord: ce n-a putut fi citit e listat separat.",
      bullets: [
        "Se verifică beneficiarul, codul fiscal, IBAN-ul, banca, suma și valuta",
        "Fiecare diferență arată ce scrie în document și ce scrie în cerere",
        "„Nu am putut citi” e afișat separat de „nu se potrivește”",
        "Aprobatorul vede semnalul înainte să semneze",
      ],
      visual: (
        <div className="space-y-3">
          {[
            { f: "Sumă", doc: "148 500,00", req: "145 000,00" },
            { f: "IBAN", doc: "…4271", req: "…9038" },
          ].map((r) => (
            <div key={r.f} className="rounded-xl border border-border px-3 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{r.f}</p>
              <div className="grid grid-cols-2 gap-3">
                <span>
                  <span className="block text-xs text-muted-foreground">în document</span>
                  <span className="block truncate text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {r.doc}
                  </span>
                </span>
                <span className="border-l border-border pl-3">
                  <span className="block text-xs text-muted-foreground">în cerere</span>
                  <span className="block truncate text-sm font-bold tabular-nums">{r.req}</span>
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
            <GitCompare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">4 câmpuri concordante · 1 necitit (bancă)</span>
          </div>
        </div>
      ),
    },
  ],

  benefits: [
    {
      icon: Keyboard,
      title: "Actele intră fără să tasteze nimeni",
      desc: "Timpul se duce pe verificat, nu pe retastat IBAN-uri dintr-un PDF.",
    },
    {
      icon: BadgeCheck,
      title: "Un dosar curat începe de la date curate",
      desc: "Suma și rechizitele corecte din primul pas, nu reparate după două semnături.",
    },
    {
      icon: CircleSlash,
      title: "Nu inventează. Când nu știe, lasă gol",
      desc: "Ce nu apare în document rămâne gol și marcat ca necitit, nu ghicit.",
    },
    {
      icon: ClipboardList,
      title: "Urma începe de la încărcare",
      desc: "Documentul, ce a citit AI-ul și ce a corectat omul — în același dosar.",
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
