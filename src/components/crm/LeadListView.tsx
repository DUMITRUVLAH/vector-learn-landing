/**
 * CRM Faza 9 — vederea LISTĂ a leadurilor (alternativa la kanban).
 *
 * Portare din crm-vector (`Leads.tsx`, `viewMode === "list"`), adaptată la FinFlow.
 *
 * De ce nu e o simplă „tablă întinsă": kanbanul citește cel mult 50 de carduri pe coloană și
 * filtrează în browser. Pe 3.200 de leaduri asta nu mai e un instrument de lucru — nu poți
 * sorta după valoare, nu poți ajunge la pagina 12, nu vezi responsabilul. Lista cere serverului
 * exact pagina afișată (`GET /api/crm/leads`, care are deja paginare + sortare + filtre), deci
 * numărul de leaduri nu mai contează pentru viteza ecranului.
 *
 * Coloanele sortabile trimit `sort`/`dir` la server, nu sortează array-ul local: o sortare
 * locală ar ordona doar pagina curentă și ar minți despre „cele mai valoroase leaduri".
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Phone, Mail } from "lucide-react";
import { Alert, Button, Checkbox, Label, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { cn } from "@/lib/utils";
import { listCrmLeads, type CrmLead, type CrmLeadListParams, type CrmStage } from "@/lib/api/crm";
import type { CrmSegmentFilters } from "@/lib/crm/segmentFilters";
import { LeadBulkBar } from "@/components/crm/LeadBulkBar";
import { crmStageLabel, crmSourceLabel } from "@/components/crm/constants";
import { formatCents, leadTitle } from "@/components/crm/format";

/** Coloanele pe care serverul le acceptă în `sort` (`SORTABLE_COLUMNS` din crmLeads.ts). */
export type LeadSortKey = "fullName" | "company" | "stage" | "source" | "valueCents" | "createdAt" | "updatedAt";

export interface LeadListViewProps {
  /** Pâlnia afișată — lista arată o singură pâlnie, exact ca tabla. */
  pipelineId: string | null;
  stages: readonly CrmStage[];
  /** Filtrele din bara de sus; se trimit SERVERULUI, nu se aplică peste pagina primită. */
  search: string;
  source: string;
  assignedTo: string | null;
  /** Segmentarea firmografică (industrie, regiune, mărime, consum) + produs — cernută de server
   *  prin firma leadului, la fel ca pe tablă. Aceleași filtre, același rezultat în ambele vederi. */
  segments?: CrmSegmentFilters;
  /** Numele responsabililor, pentru coloana „Responsabil" (id-ul singur nu spune nimic). */
  memberNames: Record<string, string>;
  /** Echipa, pentru acțiunile în masă. Absentă = lista nu oferă selecție multiplă. */
  members?: { id: string; fullName: string }[];
  /** `false` ascunde selecția multiplă — dreptul real e verificat pe server (`leads.edit`). */
  canBulkEdit?: boolean;
  /** După o acțiune în masă: părintele își reîncarcă tabla (numărătorile s-au schimbat). */
  onBulkDone?: () => void;
  onToast?: (t: { kind: "success" | "error"; message: string }) => void;
  onOpenLead: (leadId: string) => void;
  /** Crește când ceva din afară a schimbat leadurile (mutare, fișă închisă) → reîncărcare. */
  refreshToken?: number;
}

const PAGE_SIZES = [20, 50, 100] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function LeadListView({
  pipelineId,
  stages,
  search,
  source,
  assignedTo,
  segments,
  memberNames,
  members,
  canBulkEdit = false,
  onBulkDone,
  onToast,
  onOpenLead,
  refreshToken = 0,
}: LeadListViewProps) {
  const [items, setItems] = useState<CrmLead[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState<LeadSortKey>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Selecția pentru acțiuni în masă. Ține DOAR pagina curentă, intenționat: o selecție care ar
   *  supraviețui paginării ar promite că lucrezi pe tot segmentul, când de fapt serverul primește
   *  100 de id-uri. Bara scrie „pe această pagină" din același motiv. */
  const [selected, setSelected] = useState<string[]>([]);
  const bulkEnabled = canBulkEdit && !!members;

  // Orice schimbare de filtru readuce lista la prima pagină: altfel un filtru nou aplicat pe
  // pagina 7 ar arăta un ecran gol, deși există rezultate.
  /** Serializat: `segments` e un obiect nou la fiecare render al părintelui, iar ca dependență
   *  directă ar reîncărca lista la nesfârșit. Cheia se schimbă doar când se schimbă filtrele. */
  const segmentKey = JSON.stringify(segments ?? {});

  useEffect(() => {
    setPage(1);
  }, [search, source, assignedTo, pipelineId, pageSize, segmentKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: CrmLeadListParams = { page, pageSize, sort, dir, ...(JSON.parse(segmentKey) as CrmSegmentFilters) };
      if (pipelineId) params.pipelineId = pipelineId;
      if (search.trim()) params.search = search.trim();
      if (source !== "all") params.source = source;
      if (assignedTo) params.assignedTo = assignedTo;
      const res = await listCrmLeads(params);
      // Pagina s-a schimbat sub selecție: id-urile vechi nu mai sunt pe ecran, iar o acțiune în
      // masă asupra lor ar atinge leaduri pe care omul nu le mai vede.
      setSelected([]);
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut încărca lista de leaduri.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, dir, pipelineId, search, source, assignedTo, segmentKey]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  /** Click pe un antet: aceeași coloană inversează direcția, alta pornește descrescător. */
  function toggleSort(key: LeadSortKey) {
    if (sort === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir(key === "fullName" || key === "company" ? "asc" : "desc");
    }
    setPage(1);
  }

  function SortableHead({ column, children, className }: { column: LeadSortKey; children: React.ReactNode; className?: string }) {
    const active = sort === column;
    return (
      <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className="inline-flex items-center gap-1 rounded font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
          {active &&
            (dir === "asc" ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            ))}
        </button>
      </TableHead>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
        <div className="flex flex-col gap-2">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => void load()}>
            Reîncearcă
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {bulkEnabled && selected.length > 0 && (
        <LeadBulkBar
          selectedIds={selected}
          stages={stages}
          members={members ?? []}
          onCancel={() => setSelected([])}
          onToast={onToast}
          onDone={() => {
            setSelected([]);
            void load();
            onBulkDone?.();
          }}
        />
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă lista de leaduri..." />
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Niciun lead găsit. Schimbă filtrele sau adaugă un lead nou.
        </p>
      ) : (
        <Table aria-label={`Lista de leaduri — ${total} în total`}>
          <TableHeader>
            <TableRow>
              {bulkEnabled && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.length > 0 && selected.length === items.length}
                    onChange={(next) => setSelected(next ? items.map((l) => l.id) : [])}
                    aria-label="Selectează toate leadurile de pe această pagină"
                  />
                </TableHead>
              )}
              <SortableHead column="fullName">Nume / Companie</SortableHead>
              <SortableHead column="stage" className="whitespace-nowrap">
                Etapă
              </SortableHead>
              <SortableHead column="source" className="whitespace-nowrap">
                Sursă
              </SortableHead>
              <TableHead className="whitespace-nowrap">Responsabil</TableHead>
              <SortableHead column="valueCents" className="whitespace-nowrap">
                Valoare
              </SortableHead>
              <SortableHead column="createdAt" className="whitespace-nowrap">
                Creat
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((lead) => (
              <TableRow
                key={lead.id}
                interactive
                onClick={() => onOpenLead(lead.id)}
                // Rândul întreg e ținta de click (ca în referință), dar rămâne și o cale de
                // tastatură — altfel lista ar fi inaccesibilă fără mouse.
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenLead(lead.id);
                  }
                }}
                aria-label={`Deschide lead ${leadTitle(lead)}`}
              >
                {bulkEnabled && (
                  // Click pe celula de selecție nu deschide fișa: altfel bifarea a zece leaduri ar
                  // însemna zece sertare deschise peste listă.
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(lead.id)}
                      onChange={(next) =>
                        setSelected((prev) => (next ? [...prev, lead.id] : prev.filter((id) => id !== lead.id)))
                      }
                      aria-label={`Selectează ${leadTitle(lead)}`}
                    />
                  </TableCell>
                )}
                <TableCell className="max-w-[260px]">
                  <p className="truncate font-semibold text-foreground">{leadTitle(lead)}</p>
                  {lead.company && <p className="truncate text-xs italic text-muted-foreground">{lead.company}</p>}
                  <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                    {lead.phone && <Phone className="h-3 w-3" aria-label="Are telefon" />}
                    {lead.email && <Mail className="h-3 w-3" aria-label="Are email" />}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs font-medium">
                  {crmStageLabel(stages, lead.stage)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {crmSourceLabel(lead.source)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {lead.assignedTo ? memberNames[lead.assignedTo] ?? "—" : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs font-semibold tabular-nums">
                  {lead.valueCents > 0 ? formatCents(lead.valueCents) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(lead.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Paginarea rămâne pe ecran și când lista e goală: altfel, ajuns pe o pagină fără
          rezultate, omul n-ar mai avea cum să se întoarcă la prima. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" role="status">
          {total === 0
            ? "Niciun lead"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} din ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor="crm-list-page-size" className="text-xs text-muted-foreground">
            Pe pagină
          </Label>
          <Select
            id="crm-list-page-size"
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-9 w-[84px]"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Pagina anterioară"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className={cn("text-xs tabular-nums text-muted-foreground")}>
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Pagina următoare"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
