import { Mail, BookOpen, AlertTriangle, ShieldCheck, Lock, Server, Sparkles } from "lucide-react";
import { ModulePageShell } from "@/components/modules/ModulePageShell";
import { ModuleHero } from "@/components/modules/ModuleHero";
import { ModuleFAQ } from "@/components/modules/ModuleFAQ";
import { ChatDemo } from "@/components/modules/ai/ChatDemo";
import { UseCaseCard } from "@/components/modules/ai/UseCaseCard";

const useCases = [
  {
    icon: Mail,
    title: "Răspuns automat părinți pe WhatsApp",
    description:
      "AI generează draft de răspuns pentru întrebări frecvente (orar, plăți, recuperări). Tu doar aprobi sau editezi.",
    benefit: "Reducere timp recepție 60-70% pe interacțiunile repetitive. Răspuns sub 30 secunde, 24/7.",
  },
  {
    icon: BookOpen,
    title: "Sumarizare lecții pentru părinți",
    description:
      "După fiecare lecție, AI scrie un sumar de 5 rânduri cu progres, temă, dificultăți și recomandări — direct din notițele profesorului.",
    benefit: "Părinții simt că primesc valoare săptămânal fără ca profesorul să scrie rapoarte. Retenție +18%.",
  },
  {
    icon: AlertTriangle,
    title: "Predicție churn cu motive identificate",
    description:
      "Modelul învață din istoricul tău și identifică elevii cu risc mare de plecare, plus motivul specific.",
    benefit: "Acțiuni preventive cu 30 zile înainte de cancellation. Salvezi 20-30% din churn-ul preventibil.",
  },
];

const guarantees = [
  { icon: ShieldCheck, label: "GDPR & ANSPDCP", desc: "Procesare în UE (Frankfurt), DPA semnabil, drept la uitare instant" },
  { icon: Lock, label: "Datele tale rămân ale tale", desc: "NU sunt folosite pentru training-ul modelelor publice (OpenAI, Anthropic, Mistral)" },
  { icon: Server, label: "EU AI Act compliant", desc: "Categorie risc minim. Disclosure obligatoriu unde se aplică (decizii automate)" },
  { icon: Sparkles, label: "Human-in-the-loop", desc: "AI propune, omul decide. Niciun mesaj/notificare nu pleacă fără aprobare la prima setare" },
];

const faqs = [
  {
    q: "Ce model AI folosiți și de ce?",
    a: "Folosim un mix: Claude 3.5 Sonnet (Anthropic) pentru sumarizări și răspunsuri lungi, GPT-4o (OpenAI) pentru clasificare rapidă, plus modele open-source self-hosted (Mistral 7B) pentru date sensibile care nu pot părăsi UE. Routing-ul e automat în funcție de tipul de task și clasificarea de sensibilitate.",
  },
  {
    q: "Datele elevilor mei sunt trimise la OpenAI/Anthropic?",
    a: "DOAR cu pseudonimizare prealabilă (nume → token, e-mail → hash). Conținutul lecției e trimis fără identificatori. Pe planul Enterprise, totul rulează pe instanțe self-hosted Mistral și NIMIC nu părăsește infrastructura noastră UE. Avem DPA semnat cu fiecare provider, conform Art. 28 GDPR.",
  },
  {
    q: "Cât costă AI-ul în plus față de Vector Learn?",
    a: "Pe planul Growth: 500 acțiuni AI/lună incluse (mai mult decât suficient pentru un centru de 100 elevi). Pe Pro: nelimitat. Pe Enterprise: cu volume garantate. Cost real per acțiune: ~0.002 € (sub un cent). Comparativ cu salariul unei recepționere care răspunde aceleași întrebări: ROI > 50x.",
  },
  {
    q: "AI poate greși? Cine răspunde dacă trimite ceva greșit?",
    a: 'Da, AI poate greși. De asta toate acțiunile cu impact extern (mesaje către părinți, decizii pe student) sunt în „mod draft" implicit — un om aprobă înainte de trimitere. Pe acțiunile interne (sumarizări, analitice), eroarea afectează doar tine. Avem audit log complet și un buton „raportează răspuns greșit" care îmbunătățește modelul nostru fără a-l reantrenan global.',
  },
];

export function AIPage() {
  return (
    <ModulePageShell>
      <ModuleHero
        badge="Modulul AI Assistant"
        title={<>AI care chiar înțelege <span className="text-gradient">o academie</span></>}
        description="Chat intern pentru sumarizări, răspunsuri auto către părinți și predicție churn cu motive identificate. Antrenat pe datele tale, conform GDPR + EU AI Act, cu human-in-the-loop pe orice acțiune externă. Nu un chatbot generic."
        ctaPrimary={{ label: "Cere demo AI", href: "#/?demo=ai" }}
        ctaSecondary={{ label: "Vezi prețuri", href: "#/?section=pricing" }}
      />

      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
              Încearcă chat-ul AI — apasă pe un prompt
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Demo cu răspunsuri reprezentative. În producție, răspunsurile vin din datele centrului tău.
            </p>
          </div>
          <ChatDemo />
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">3 use case-uri reale</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Unde aduce valoare AI-ul în academia ta</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {useCases.map((useCase, i) => (
              <UseCaseCard key={useCase.title} {...useCase} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">Privacy & siguranță</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              AI conform <span className="text-gradient">GDPR și EU AI Act</span>
            </h2>
            <p className="mt-4 text-sm text-muted-foreground">
              Datele tale nu pleacă unde nu trebuie. Niciodată.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {guarantees.map((g) => {
              const Icon = g.icon;
              return (
                <article key={g.label} className="rounded-2xl border border-border bg-card p-5">
                  <Icon className="h-5 w-5 text-primary mb-3" />
                  <p className="text-sm font-bold mb-1">{g.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{g.desc}</p>
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
