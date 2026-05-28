export type IntegrationCategory =
  | "telefonie"
  | "plati"
  | "mesagerie"
  | "contabilitate"
  | "email"
  | "analytics"
  | "cloud"
  | "automation";

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  setupMinutes: number;
  popular?: boolean;
}

export const CATEGORY_META: Record<IntegrationCategory, { label: string; pastel: string }> = {
  telefonie: { label: "Telefonie", pastel: "pastel-sky" },
  plati: { label: "Plăți", pastel: "pastel-mint" },
  mesagerie: { label: "Mesagerie", pastel: "pastel-lavender" },
  contabilitate: { label: "Contabilitate", pastel: "pastel-peach" },
  email: { label: "Email", pastel: "pastel-rose" },
  analytics: { label: "Analytics", pastel: "pastel-lemon" },
  cloud: { label: "Cloud", pastel: "pastel-teal" },
  automation: { label: "Automation", pastel: "pastel-sky" },
};

export const INTEGRATIONS: Integration[] = [
  { id: "asterisk", name: "Asterisk", category: "telefonie", description: "PBX open-source self-hosted. Recording + transcriere apeluri.", setupMinutes: 30, popular: true },
  { id: "mango", name: "Mango Office", category: "telefonie", description: "Telefonie cloud, click-to-call, IVR vizual.", setupMinutes: 15, popular: true },
  { id: "twilio", name: "Twilio Voice", category: "telefonie", description: "Voice API global, plată pe minut.", setupMinutes: 20 },
  { id: "sipnet", name: "Sipnet", category: "telefonie", description: "SIP trunking, suport pentru RO și diaspora.", setupMinutes: 25 },

  { id: "stripe", name: "Stripe", category: "plati", description: "Plăți card globale, abonamente, Stripe Tax automat.", setupMinutes: 10, popular: true },
  { id: "payu", name: "PayU", category: "plati", description: "Cea mai populară gateway plăți pentru RO. Card + transfer bancar.", setupMinutes: 15, popular: true },
  { id: "netopia", name: "Netopia", category: "plati", description: "Procesator local, suport split TVA și 3DS.", setupMinutes: 20 },
  { id: "mobilpay", name: "MobilPay", category: "plati", description: "Card, transfer, Apple Pay, Google Pay în România.", setupMinutes: 15 },

  { id: "wa-business", name: "WhatsApp Business API", category: "mesagerie", description: "Mesaje template Meta-aprobate, conversații 24h gratuite.", setupMinutes: 45, popular: true },
  { id: "telegram-bot", name: "Telegram Bot API", category: "mesagerie", description: "Bot oficial pentru notificări, chat 1:1, inline buttons.", setupMinutes: 20 },
  { id: "viber", name: "Viber Business", category: "mesagerie", description: "Folosit mult în diaspora. Stickere și mesaje rich.", setupMinutes: 30 },
  { id: "fb-messenger", name: "Facebook Messenger", category: "mesagerie", description: "Răspuns automat la mesaje către pagina ta.", setupMinutes: 15 },

  { id: "1c", name: "1C Contabilitate", category: "contabilitate", description: "Export zilnic XML conform formatului 1C cu mapping editabil.", setupMinutes: 60, popular: true },
  { id: "saga", name: "SAGA", category: "contabilitate", description: "Software contabil popular în RO. Sync zilnic.", setupMinutes: 45 },
  { id: "anaf-spv", name: "ANAF e-Factura (SPV)", category: "contabilitate", description: "Trimitere directă e-Factura via SPV-ANAF, UBL 2.1 conform OUG 120/2021.", setupMinutes: 30, popular: true },
  { id: "smartbill", name: "SmartBill", category: "contabilitate", description: "Facturare cloud RO cu integrare bidirecțională.", setupMinutes: 20 },

  { id: "mailchimp", name: "Mailchimp", category: "email", description: "Campanii email + automation cu A/B testing.", setupMinutes: 15 },
  { id: "unisender", name: "UniSender", category: "email", description: "Email marketing cu preț bun pentru volum mediu.", setupMinutes: 15 },
  { id: "sendgrid", name: "SendGrid", category: "email", description: "SMTP API, deliverability 98%+, dedicated IP.", setupMinutes: 20 },
  { id: "mandrill", name: "Mandrill", category: "email", description: "Transactional email cu template engine.", setupMinutes: 25 },

  { id: "ga4", name: "Google Analytics 4", category: "analytics", description: "Server-side events, atribuire multi-touch.", setupMinutes: 20, popular: true },
  { id: "fb-pixel", name: "Facebook Pixel + CAPI", category: "analytics", description: "Conversion API server-side cu PII hashing.", setupMinutes: 30 },
  { id: "google-ads", name: "Google Ads", category: "analytics", description: "Offline conversion API: optimizezi bidding pe elevi plătitori.", setupMinutes: 25 },
  { id: "tiktok-ads", name: "TikTok Ads", category: "analytics", description: "Events API + audience matching pentru segmente.", setupMinutes: 20 },

  { id: "gdrive", name: "Google Drive", category: "cloud", description: "Backup automat materiale didactice + recordings lecții.", setupMinutes: 10 },
  { id: "dropbox", name: "Dropbox Business", category: "cloud", description: "Sync materiale și access management granular.", setupMinutes: 10 },
  { id: "onedrive", name: "OneDrive / Microsoft 365", category: "cloud", description: "Integrare cu Teams + Office 365 pentru școli enterprise.", setupMinutes: 20 },
  { id: "zoom", name: "Zoom Auto-link", category: "cloud", description: "Generare automată link meeting per lecție, recording sync.", setupMinutes: 15, popular: true },

  { id: "zapier", name: "Zapier", category: "automation", description: "5000+ apps. Triggere și acțiuni fără cod.", setupMinutes: 10, popular: true },
  { id: "make", name: "Make.com", category: "automation", description: "Scenarii vizuale cu logic complex, gratuit până la 1000 ops/lună.", setupMinutes: 15 },
  { id: "albato", name: "Albato", category: "automation", description: "350+ apps cu focus pe Europa de Est.", setupMinutes: 12 },
  { id: "n8n", name: "n8n", category: "automation", description: "Self-hosted automation cu cod când e nevoie.", setupMinutes: 30 },
];
