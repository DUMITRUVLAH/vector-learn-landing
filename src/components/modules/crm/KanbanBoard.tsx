import { useState } from "react";
import { Phone, Mail, MessageCircle, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export type LeadStage = "new" | "trial" | "paid" | "lost";

export interface Lead {
  id: string;
  name: string;
  course: string;
  source: "facebook" | "google" | "site" | "referral" | "phone";
  daysInStage: number;
  stage: LeadStage;
  value?: number;
}

interface Column {
  id: LeadStage;
  title: string;
  description: string;
  pastel: string;
  accent: string;
}

const COLUMNS: Column[] = [
  { id: "new", title: "Lead nou", description: "Captat, neapelat încă", pastel: "pastel-sky", accent: "text-pastel-sky-fg" },
  { id: "trial", title: "Trial / Demo", description: "Vine la ora de probă", pastel: "pastel-lavender", accent: "text-pastel-lavender-fg" },
  { id: "paid", title: "Client plătitor", description: "Abonament activ", pastel: "pastel-mint", accent: "text-pastel-mint-fg" },
  { id: "lost", title: "Pierdut", description: "Cu motiv salvat", pastel: "pastel-peach", accent: "text-pastel-peach-fg" },
];

const INITIAL_LEADS: Lead[] = [
  { id: "L-001", name: "Maria Popescu", course: "Spaniolă A2", source: "facebook", daysInStage: 1, stage: "new" },
  { id: "L-002", name: "Andrei Ionescu", course: "Programare web", source: "google", daysInStage: 2, stage: "new" },
  { id: "L-003", name: "Elena Vasilescu", course: "Pian copii", source: "referral", daysInStage: 0, stage: "new" },
  { id: "L-004", name: "Mihai Stoica", course: "Engleză B1", source: "site", daysInStage: 3, stage: "trial" },
  { id: "L-005", name: "Ana Dumitrescu", course: "Robotică", source: "facebook", daysInStage: 5, stage: "trial" },
  { id: "L-006", name: "Radu Constantin", course: "Vioară", source: "phone", daysInStage: 7, stage: "trial" },
  { id: "L-007", name: "Cristina Mitran", course: "Franceză A1", source: "google", daysInStage: 14, stage: "paid", value: 220 },
  { id: "L-008", name: "Sergiu Popa", course: "Pregătire BAC", source: "referral", daysInStage: 30, stage: "paid", value: 350 },
  { id: "L-009", name: "Ioana Răducanu", course: "Pian intermediar", source: "site", daysInStage: 21, stage: "paid", value: 480 },
  { id: "L-010", name: "Vlad Anghel", course: "Engleză B2", source: "facebook", daysInStage: 5, stage: "lost" },
];

const SOURCE_META: Record<Lead["source"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  facebook: { label: "Facebook", icon: MessageCircle },
  google: { label: "Google Ads", icon: Globe },
  site: { label: "Site web", icon: Globe },
  referral: { label: "Recomandare", icon: Mail },
  phone: { label: "Telefon", icon: Phone },
};

export function moveLead(leads: Lead[], leadId: string, toStage: LeadStage): Lead[] {
  return leads.map((l) => (l.id === leadId ? { ...l, stage: toStage, daysInStage: 0 } : l));
}

export function countByStage(leads: ReadonlyArray<Lead>): Record<LeadStage, number> {
  const acc: Record<LeadStage, number> = { new: 0, trial: 0, paid: 0, lost: 0 };
  for (const l of leads) acc[l.stage] += 1;
  return acc;
}

export function KanbanBoard() {
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<LeadStage | null>(null);

  const counts = countByStage(leads);

  const handleDrop = (toStage: LeadStage) => {
    if (!draggedId) return;
    setLeads((prev) => moveLead(prev, draggedId, toStage));
    setDraggedId(null);
    setHoverColumn(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">Pipeline vânzări — Mai 2026</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trage leadurile între coloane sau folosește tastele 1/2/3/4 pe focus
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{leads.length}</span> leaduri active
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        {COLUMNS.map((col) => {
          const colLeads = leads.filter((l) => l.stage === col.id);
          const isHover = hoverColumn === col.id && draggedId !== null;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverColumn(col.id);
              }}
              onDragLeave={() => setHoverColumn(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.id);
              }}
              className={cn(
                "min-h-[400px] bg-card p-3 flex flex-col gap-2 transition-colors",
                isHover && "bg-primary/5 ring-2 ring-primary/40 ring-inset"
              )}
              aria-label={`Coloana ${col.title}`}
            >
              <div className={cn("rounded-lg px-3 py-2", col.pastel)}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={cn("text-xs font-bold", col.accent)}>{col.title}</p>
                    <p className="text-[10px] text-foreground/60">{col.description}</p>
                  </div>
                  <span className="text-base font-display font-bold tabular-nums">
                    {counts[col.id]}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {colLeads.map((lead) => {
                  const SourceIcon = SOURCE_META[lead.source].icon;
                  return (
                    <div
                      key={lead.id}
                      draggable
                      tabIndex={0}
                      role="button"
                      aria-label={`Lead ${lead.name}, ${col.title}. Trage sau folosește 1-4 pentru a muta între coloane.`}
                      onDragStart={(e) => {
                        setDraggedId(lead.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", lead.id);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setHoverColumn(null);
                      }}
                      onKeyDown={(e) => {
                        const map: Record<string, LeadStage> = {
                          "1": "new",
                          "2": "trial",
                          "3": "paid",
                          "4": "lost",
                        };
                        const target = map[e.key];
                        if (target && target !== lead.stage) {
                          e.preventDefault();
                          setLeads((prev) => moveLead(prev, lead.id, target));
                        }
                      }}
                      className={cn(
                        "rounded-lg border border-border bg-card p-2.5 cursor-move shadow-sm transition-all",
                        "hover:shadow-md hover:-translate-y-0.5",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        draggedId === lead.id && "opacity-50"
                      )}
                    >
                      <p className="text-xs font-semibold leading-tight">{lead.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{lead.course}</p>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <SourceIcon className="h-2.5 w-2.5" aria-hidden />
                          {SOURCE_META[lead.source].label}
                        </span>
                        {lead.value ? (
                          <span className="text-[10px] font-semibold text-success tabular-nums">
                            +{lead.value}€
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/70">
                            {lead.daysInStage}z
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {colLeads.length === 0 && (
                  <div className="flex items-center justify-center h-20 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
                    Trage aici
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
