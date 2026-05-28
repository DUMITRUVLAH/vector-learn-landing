import { Phone, MessageCircle, CreditCard, Mail, BarChart, FileText, Cloud, Webhook } from "lucide-react";

const categories = [
  {
    icon: Phone,
    title: "Telefonie IP",
    items: ["Asterisk", "Mango Office", "Sipnet", "Twilio Voice", "Zadarma"],
  },
  {
    icon: MessageCircle,
    title: "Mesagerie",
    items: ["WhatsApp Business", "Telegram Bot", "Viber", "SMS gateway-uri", "Facebook Messenger"],
  },
  {
    icon: CreditCard,
    title: "Plăți",
    items: ["Stripe", "PayU", "Netopia", "MobilPay", "Case marcat fiscale"],
  },
  {
    icon: Mail,
    title: "Email marketing",
    items: ["Mailchimp", "UniSender", "SendGrid", "Mandrill", "SMTP custom"],
  },
  {
    icon: BarChart,
    title: "Analytics & ads",
    items: ["Google Analytics 4", "Facebook Pixel", "Google Ads", "Yandex Metrica", "TikTok Ads"],
  },
  {
    icon: FileText,
    title: "Contabilitate",
    items: ["1C Contabilitate", "SAGA", "WMS", "Excel automation", "Export ANAF e-Factura"],
  },
  {
    icon: Cloud,
    title: "Cloud & storage",
    items: ["Google Drive", "Dropbox", "OneDrive", "Zoom (auto-link)", "Microsoft Teams"],
  },
  {
    icon: Webhook,
    title: "Automation",
    items: ["Zapier", "Make.com", "Albato", "APIX-Drive", "REST API + Webhooks"],
  },
];

export function Integrations() {
  return (
    <section id="integrations" className="py-24 sm:py-32 bg-muted/30 border-y border-border/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Integrări
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Funcționează cu tool-urile pe care{" "}
            <span className="text-gradient">deja le folosești</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Peste 350 de integrații native și prin platforme de automation. API REST complet documentat pentru orice custom.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <article
                key={cat.title}
                className="rounded-2xl border border-border bg-card p-5 card-hover"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="rounded-lg bg-primary/10 p-2">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <h3 className="text-sm font-bold">{cat.title}</h3>
                </div>
                <ul className="space-y-1.5">
                  {cat.items.map((item) => (
                    <li
                      key={item}
                      className="text-xs text-muted-foreground flex items-center gap-1.5"
                    >
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <a
            href="#api-docs"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Vezi documentația API completă →
          </a>
        </div>
      </div>
    </section>
  );
}
