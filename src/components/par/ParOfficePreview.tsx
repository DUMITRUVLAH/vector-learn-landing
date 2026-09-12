/**
 * Word și Excel randate în vizualizatorul de documente PAR — doar de citit.
 *
 * Perechea de randare pentru `src/lib/par/officePreview.ts`: acolo stau parserele (importate
 * dinamic, ca să nu intre în bundle-ul de pornire), aici stă ce vede aprobatorul.
 *
 * Excelul se randează din DATE, nu din HTML: `readXlsxSheets` întoarce celule, iar aici devin
 * `<td>`-uri. Niciun `dangerouslySetInnerHTML` — un fișier încărcat de altcineva nu are cum să
 * injecteze markup în aplicație. Wordul e excepția tehnică: `docx-preview` scrie el însuși în DOM,
 * dar scrie într-un container izolat, iar imaginile devin `data:` (vezi `renderDocxInto`).
 *
 * Documentul rămâne pe fundal alb și în tema întunecată — la fel ca `<iframe>`-ul de PDF de
 * alături. O foaie de Word este o foaie albă; recolorând-o după temă am arăta altceva decât
 * documentul pe care omul semnează.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Tabs } from "@/components/ds";
import {
  renderDocxInto,
  readXlsxSheets,
  XLSX_MAX_ROWS,
  type XlsxSheet,
} from "@/lib/par/officePreview";

export interface ParOfficePreviewProps {
  /** Octeții documentului, deja descărcați de vizualizator pentru verificarea de acces. */
  file: Blob;
  fileName: string;
  /** Ce se întâmplă dacă biblioteca nu poate deschide fișierul (corupt, protejat cu parolă). */
  onFailed: (message: string) => void;
}

/** Starea comună a celor două randări. */
type Phase = "loading" | "ready" | "failed";

function Loading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Se pregătește documentul…
    </div>
  );
}

/** Word. `docx-preview` randează direct în `ref`-ul de mai jos. */
export function ParDocxPreview({ file, fileName, onFailed }: ParOfficePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setPhase("loading");
    void (async () => {
      try {
        await renderDocxInto(host, file);
        if (cancelled) return;
        setPhase("ready");
      } catch {
        if (cancelled) return;
        host.replaceChildren();
        setPhase("failed");
        onFailed(`„${fileName}" nu a putut fi afișat (fișier deteriorat sau protejat cu parolă).`);
      }
    })();
    return () => {
      cancelled = true;
      // Documentul randat se aruncă odată cu panoul: altfel `<style>`-ul injectat de docx-preview
      // și imaginile base64 ar rămâne în DOM după închidere.
      host.replaceChildren();
    };
  }, [file, fileName, onFailed]);

  return (
    <div className="min-h-full">
      {phase === "loading" && <Loading />}
      {/* `bg-white` intenționat, nu un token: e hârtia documentului, nu suprafața aplicației. */}
      <div
        ref={hostRef}
        className={phase === "ready" ? "flex justify-center bg-white py-4" : "hidden"}
        aria-label={`Conținutul documentului ${fileName}`}
      />
    </div>
  );
}

/** Excel. Fiecare foaie e un tabel; foile se schimbă din taburi. */
export function ParXlsxPreview({ file, fileName, onFailed }: ParOfficePreviewProps) {
  const [sheets, setSheets] = useState<XlsxSheet[]>([]);
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setActive(0);
    void (async () => {
      try {
        const parsed = await readXlsxSheets(file);
        if (cancelled) return;
        setSheets(parsed);
        setPhase("ready");
      } catch {
        if (cancelled) return;
        setPhase("failed");
        onFailed(`„${fileName}" nu a putut fi afișat (fișier deteriorat sau protejat cu parolă).`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, fileName, onFailed]);

  if (phase === "loading") return <Loading />;
  if (phase === "failed") return null;

  if (sheets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertCircle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Registrul nu conține nicio foaie vizibilă.</p>
      </div>
    );
  }

  const sheet = sheets[Math.min(active, sheets.length - 1)];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {sheets.length > 1 && (
        <div className="shrink-0 border-b border-border bg-background px-3 py-2">
          <Tabs
            aria-label="Foile registrului"
            tabs={sheets.map((s, i) => ({ value: String(i), label: s.name }))}
            value={String(Math.min(active, sheets.length - 1))}
            onChange={(next) => setActive(Number(next))}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-background p-3">
        <table className="w-max border-collapse text-sm">
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                    rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                    className={[
                      "max-w-[24rem] whitespace-pre-wrap break-words border border-border px-2 py-1 align-top text-foreground",
                      cell.bold ? "font-semibold" : "",
                      cell.numeric ? "text-right tabular-nums" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {sheet.truncated && (
          <p className="mt-3 text-xs text-muted-foreground">
            Foaie prea mare pentru previzualizare — sunt afișate primele {XLSX_MAX_ROWS} de rânduri.
            Descarcă fișierul ca să-l vezi întreg.
          </p>
        )}
      </div>
    </div>
  );
}
