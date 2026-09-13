/**
 * Showcase — randează fiecare primitivă din kit, ca să verifici instalarea.
 *
 * Lipește-l ca pagină în proiectul nou (`/showcase`) și deschide-l în light și în dark.
 * Butonul din antet comută tema. Dacă totul e lizibil în ambele, kitul e instalat corect.
 *
 * Importurile presupun aliasul `@` → `src` și `ds/` copiat în `src/components/ds`.
 */
import { useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  KpiTile,
  Label,
  ModuleCard,
  PageHeader,
  PastelIcon,
  Progress,
  Select,
  Separator,
  SidebarNavItem,
  Skeleton,
  StatusBadge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
  type ButtonVariant,
} from "@/components/ds";
import {
  BarChart3,
  FileText,
  Inbox,
  Moon,
  Settings,
  Sun,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

const BUTTON_VARIANTS: ButtonVariant[] = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "success",
  "warning",
  "destructive",
  "link",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Showcase() {
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState("toate");
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [open, setOpen] = useState(false);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground sm:p-10">
      <div className="mx-auto max-w-[--content-max] space-y-10">
        <PageHeader
          eyebrow="Design kit"
          title="HR365 by Vector"
          subtitle="Fiecare primitivă, în tema curentă. Comută tema și verifică din nou."
          size="large"
          actions={
            <Button variant="outline" onClick={toggleTheme}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {dark ? "Light" : "Dark"}
            </Button>
          }
        />

        <Section title="KPI">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Venit lunar" value="128.400 MDL" hint="+12% față de luna trecută" icon={<Wallet className="h-4 w-4" />} tone="indigo" />
            <KpiTile label="Clienți activi" value="1.412" hint="34 noi" icon={<Users className="h-4 w-4" />} tone="emerald" />
            <KpiTile label="Documente" value="8.902" icon={<FileText className="h-4 w-4" />} tone="sky" />
            <KpiTile label="Conversie" value="24,8%" hint="ultimele 30 de zile" icon={<TrendingUp className="h-4 w-4" />} tone="amber" />
          </div>
        </Section>

        <Section title="Module">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ModuleCard title="Rapoarte" description="Analize și export către contabilitate." icon={<BarChart3 className="h-5 w-5" />} tone="indigo" cta="Deschide" />
            <ModuleCard title="Documente" description="Aprobări pe mai multe niveluri." icon={<FileText className="h-5 w-5" />} tone="violet" badge="Nou" cta="Deschide" />
            <ModuleCard title="Setări" description="Utilizatori, roluri și permisiuni." icon={<Settings className="h-5 w-5" />} tone="teal" cta="Deschide" />
          </div>
        </Section>

        <Section title="Butoane">
          <div className="flex flex-wrap gap-2">
            {BUTTON_VARIANTS.map((v) => (
              <Button key={v} variant={v}>{v}</Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">sm</Button>
            <Button size="default">default</Button>
            <Button size="lg">lg</Button>
            <Button size="icon" aria-label="Setări"><Settings className="h-4 w-4" /></Button>
            <Button disabled>dezactivat</Button>
          </div>
        </Section>

        <Section title="Stări">
          <div className="flex flex-wrap gap-2">
            {["active", "pending", "approved", "rejected", "paid", "overdue", "draft", "archived"].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="success">success</Badge>
            <Badge variant="warning">warning</Badge>
            <Badge variant="info">info</Badge>
            <Badge variant="destructive">destructive</Badge>
          </div>
        </Section>

        <Section title="Mesaje">
          <div className="grid gap-3 sm:grid-cols-2">
            <Alert title="Informație">Documentul a fost trimis spre aprobare.</Alert>
            <Alert variant="success" title="Aprobat">Plata a fost înregistrată.</Alert>
            <Alert variant="warning" title="Atenție">Termenul expiră în 2 zile.</Alert>
            <Alert variant="destructive" title="Eroare">Nu am putut citi fișierul.</Alert>
          </div>
        </Section>

        <Section title="Formular">
          <Card>
            <CardHeader>
              <CardTitle>Furnizor nou</CardTitle>
              <CardDescription>Câmpurile marcate sunt obligatorii.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nume" required>Denumire</Label>
                <Input id="nume" placeholder="SRL Exemplu" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tip">Tip</Label>
                <Select id="tip" defaultValue="srl">
                  <option value="srl">SRL</option>
                  <option value="pf">Persoană fizică</option>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="note">Note</Label>
                <Textarea id="note" placeholder="Context intern…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iban">IBAN (invalid)</Label>
                <Input id="iban" invalid defaultValue="MD__ 0000" aria-invalid />
              </div>
              <div className="flex items-center gap-6 sm:col-span-2">
                <Checkbox checked={checked} onChange={setChecked} label="Furnizor preferat" />
                <div className="flex items-center gap-2">
                  <Switch checked={on} onChange={setOn} aria-label="Notificări" />
                  <span className="text-sm">Notificări</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button onClick={() => setOpen(true)}>Salvează</Button>
              <Button variant="ghost">Anulează</Button>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Navigație și taburi">
          <div className="grid gap-4 lg:grid-cols-[--sidebar-width,1fr]">
            <nav className="space-y-1 rounded-xl border border-sidebar-border bg-sidebar-background p-3">
              <SidebarNavItem label="Panou" icon={<BarChart3 className="h-4 w-4" />} tone="indigo" active />
              <SidebarNavItem label="Documente" icon={<FileText className="h-4 w-4" />} tone="violet" count={12} />
              <SidebarNavItem label="Clienți" icon={<Users className="h-4 w-4" />} tone="emerald" />
              <SidebarNavItem label="Arhivă" icon={<Inbox className="h-4 w-4" />} tone="sky" sub />
            </nav>
            <div className="space-y-4">
              <Tabs
                value={tab}
                onChange={setTab}
                aria-label="Filtrează documentele"
                tabs={[
                  { value: "toate", label: "Toate" },
                  { value: "asteptare", label: "În așteptare" },
                  { value: "aprobate", label: "Aprobate" },
                ]}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solicitant</TableHead>
                    <TableHead>Sumă</TableHead>
                    <TableHead>Stare</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { n: "Ana Rusu", s: "12.400 MDL", st: "approved" },
                    { n: "Ion Popa", s: "3.100 MDL", st: "pending" },
                    { n: "Vera Cojocaru", s: "890 MDL", st: "rejected" },
                  ].map((r) => (
                    <TableRow key={r.n} interactive>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar name={r.n} size="sm" />
                          {r.n}
                        </div>
                      </TableCell>
                      <TableCell>{r.s}</TableCell>
                      <TableCell><StatusBadge status={r.st} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </Section>

        <Section title="Chip-uri, progres, gol, încărcare">
          <div className="flex flex-wrap items-center gap-3">
            {(["indigo", "violet", "sky", "emerald", "amber", "rose", "blue", "orange", "teal"] as const).map((t) => (
              <PastelIcon key={t} tone={t}><FileText className="h-4 w-4" /></PastelIcon>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Progress value={72} />
            <Progress value={38} tone="warning" />
          </div>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={<Inbox className="h-6 w-6" />}
                  title="Nimic aici încă"
                  description="Documentele aprobate vor apărea în această listă."
                  action={<Button size="sm">Adaugă document</Button>}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          </div>
        </Section>

        <Dialog open={open} onClose={() => setOpen(false)} title="Confirmi salvarea?">
          <p className="text-sm text-muted-foreground">
            Furnizorul va fi vizibil pentru toți membrii echipei.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Nu</Button>
            <Button onClick={() => setOpen(false)}>Da, salvează</Button>
          </div>
        </Dialog>
      </div>
    </div>
  );
}
