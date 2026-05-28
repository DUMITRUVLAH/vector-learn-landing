import { MessageCircle, Zap, Megaphone, Bell, Shield, Clock, Layers, BarChart3 } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { AutomationBuilder } from "@/components/modules/comunicare/AutomationBuilder";
import { MessagePreview } from "@/components/modules/comunicare/MessagePreview";
import { PASTEL_CYCLE } from "@/lib/utils";

const sections = [
  {
    icon: MessageCircle,
    title: "WhatsApp Business API oficial",
    bullets: [
      "Template-uri aprobate de Meta (notification, marketing, utility)",
      "Numărul tău de business verificat, nu boți gri",
      "Conversații inițiate de elevi sunt gratuite 24h",
      "Cost mesaj template: ~0.05 €/mesaj (rate Meta RO)",
    ],
    description: "Singurul mod legitim de a face WhatsApp la scală. Conformitate Meta + GDPR + ANSPDCP.",
  },
  {
    icon: Zap,
    title: "Automatizări fără cod",
    bullets: [
      "Builder vizual: Trigger → Condiție → Acțiune",
      "23 template-uri gata pentru școli (recuperare, restanță, ziua elevului)",
      "Limită anti-spam: max 3 mesaje/elev/săptămână",
      "Test mode: rulezi automatizarea pe un lead fictiv înainte de live",
    ],
    description: "Mută toată comunicarea repetitivă pe pilot automat. Echipa ta vede doar excepțiile.",
  },
  {
    icon: Megaphone,
    title: "Broadcast cu segmentare",
    bullets: [
      "Segmente dinamice: 'elevi B2', 'părinți cu copii < 10 ani', 'restanți'",
      "A/B testing pe subiect / primul rând",
      "Programare în viitor cu time-zone awareness",
      "Tracking opens, clicks, opt-out — tot la nivel de segment",
    ],
    description: "Trimite anunțul de vacanță, oferta de Black Friday sau invitația la examen — exact către cei interesați.",
  },
  {
    icon: Bell,
    title: "Notificări push în app",
    bullets: [
      "iOS, Android și PWA cu același cod",
      "Categorii: orar, teme, plăți, social — utilizatorul controlează ce primește",
      "Deep links direct la lecție/factură/temă",
      "Rich push (imagine, butoane action) pe iOS 16+ și Android 13+",
    ],
    description: "Părinții văd notificarea pe ecranul de blocare, dau click și ajung direct la informația relevantă.",
  },
];

const stats = [
  { icon: Shield, label: "Conformitate WhatsApp", value: "Meta-verified Business" },
  { icon: Clock, label: "Latență mediană", value: "< 2 sec" },
  { icon: Layers, label: "Canale active", value: "4 (WA, Telegram, SMS, Email)" },
  { icon: BarChart3, label: "Rată opt-in", value: "82% (mediana centre)" },
];

const faqs = [
  {
    q: "Am nevoie de numărul meu de WhatsApp Business sau folosesc al vostru?",
    a: "Numărul tău de WhatsApp Business. Te ajutăm cu verificarea Meta Business Verification (poate dura 1-3 zile lucrătoare). După aprobare, conversațiile pleacă cu numele și logo-ul școlii tale, nu cu Vector Learn. Avem ghid pas-cu-pas + suport gratuit pentru onboarding.",
  },
  {
    q: "Care e diferența între template-uri și mesaje libere pe WhatsApp?",
    a: "Template-urile (notification + utility + marketing) sunt aprobate de Meta și pot fi inițiate de tine oricând — ~0.05 €/mesaj. Mesajele libere pot fi trimise doar în fereastra de 24h de la ultimul răspuns al utilizatorului — sunt gratuite. Practica recomandată: triggere automate folosesc template-uri, conversațiile cu părinții folosesc fereastra de 24h.",
  },
  {
    q: "Cum gestionez consimțământul și dreptul la opt-out?",
    a: 'Fiecare destinatar are buton „STOP" în footer-ul mesajelor. Opt-out-ul e instant și sincronizat pe toate canalele (dacă renunță la WhatsApp, oprești și SMS-ul de marketing automat). Audit log GDPR-compliant: cine, când, de pe ce canal. Export PDF pentru ANSPDCP la cerere.',
  },
  {
    q: "Pot trimite același mesaj în mai multe limbi?",
    a: 'Da. Definești template-ul în RO și marchezi „translate to: EN, RU, UA". Folosim translate API (DeepL) cu approval manual înainte de prima utilizare. Pentru școlile cu elevi internaționali (Erasmus, copii din diaspora), e standard la noi.',
  },
];

export function ComunicarePage() {
  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul Comunicare"
        title={
          <>
            Toată comunicarea cu părinții, <span className="text-gradient">pe pilot automat</span>
          </>
        }
        description="WhatsApp Business API oficial, automatizări fără cod, broadcast segmentat și notificări push în app — toate dintr-un singur loc, conform GDPR și cu opt-out instant pe toate canalele."
        ctaPrimary={{ label: "Cere demo comunicare", href: "#/?demo=comunicare" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
              Construiește o automatizare în 3 click-uri
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Builder-ul de mai jos generează un sumar live. Mesajul efectiv apare în preview-ul din dreapta.
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <AutomationBuilder />
            <MessagePreview />
          </div>
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <article key={stat.label} className="rounded-2xl border border-border bg-card p-5 text-center">
                  <Icon className="h-5 w-5 text-primary mx-auto mb-2" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="text-sm font-display font-bold mt-1">{stat.value}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              4 capabilități
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Comunicare multi-canal, automatizată și conformă
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {sections.map((section, i) => {
              const Icon = section.icon;
              return (
                <article key={section.title} className="rounded-2xl border border-border bg-card p-6 card-hover">
                  <div className="flex items-start gap-4 mb-3">
                    <div className={`${PASTEL_CYCLE[i % PASTEL_CYCLE.length]} rounded-xl p-2.5 flex-shrink-0`}>
                      <Icon className="h-5 w-5 text-foreground/80" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold mb-1.5">{section.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{section.description}</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 pl-12">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span className="h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <ModuleFAQ items={faqs} />
    </ModulePageShell>
  );
}
