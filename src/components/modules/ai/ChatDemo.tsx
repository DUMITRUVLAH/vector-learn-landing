import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface PresetPrompt {
  id: string;
  label: string;
  prompt: string;
  response: string;
}

const PRESETS: PresetPrompt[] = [
  {
    id: "welcome",
    label: "Scrie un mesaj de welcome pentru un nou părinte",
    prompt: "Scrie un mesaj de welcome pentru Cristina, mama Mariei (14 ani), care tocmai s-a înscris la cursul de engleză B2.",
    response:
      "Bună, Cristina! Bine ați venit la Lingua School 👋\n\nMă bucur că Maria începe cu noi cursul de engleză B2. Iată ce vă așteaptă în prima săptămână:\n\n• Luni 10:00 — prima lecție cu prof. Ana (Sala 4)\n• Materialele și aplicația mobilă: vor fi disponibile cu 24h înainte\n• Acces gratuit la 50+ lecții video pentru exersare acasă\n\nDacă aveți întrebări, scrieți-mi oricând pe WhatsApp.\n\nO zi frumoasă!\nEchipa Lingua School",
  },
  {
    id: "summary",
    label: "Sumarizează lecția de azi a Mariei Popescu",
    prompt: "Sumarizează lecția de azi a Mariei Popescu (Engleză B2, 14:00-15:30).",
    response:
      "📚 Sumar lecție Maria Popescu — Engleză B2 (28 mai, 14:00-15:30)\n\nTopic: Past Perfect Tense în context narativ\n\nProgres:\n• 12/15 exerciții corecte (80%)\n• Înțelegere bună a regulilor, dificultate la past perfect continuous\n• Participare activă, 7 răspunsuri voluntare\n\nFeedback profesor: Vocabular în creștere, are nevoie de mai multă practică pe forme negative.\n\nTemă: Exerciții 8-12 din Unit 7 + audio listening 15 min\nDeadline: joi 18:00\n\nNext lesson: 30 mai — Storytelling exercise",
  },
  {
    id: "churn",
    label: "Care elevi riscă să plece luna viitoare?",
    prompt: "Care elevi din centrul meu au risc mare de plecare în următoarele 30 de zile?",
    response:
      "⚠️ 4 elevi cu risc churn ridicat (>70% probabilitate):\n\n1. Radu Constantin (B2 Engleză) — risc 85%\n   Motiv: 3 absențe în 10 zile + plată restantă 14 zile\n   Acțiune: apel directă manager + ofertă pauză 1 lună\n\n2. Ana Popa (Pian) — risc 78%\n   Motiv: scădere prezență 90% → 60% în 30 zile\n   Acțiune: ofertă schimb profesor sau program\n\n3. Sergiu V. (Programare) — risc 73%\n   Motiv: progres lent + 2 evaluări sub 3*\n   Acțiune: 1:1 cu coordonatorul de program\n\n4. Elena D. (Spaniolă) — risc 72%\n   Motiv: 0 logări în app în 14 zile\n   Acțiune: trimite recap săptămânal personalizat\n\nValoare cumulată în pericol: ~1.080 €/lună (12.960 €/an).",
  },
];

type ChatState =
  | { status: "idle" }
  | { status: "typing"; prompt: PresetPrompt; visibleChars: number }
  | { status: "done"; prompt: PresetPrompt };

const TYPING_INTERVAL_MS = 15;

export function ChatDemo() {
  const [state, setState] = useState<ChatState>({ status: "idle" });
  const intervalRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state.status !== "typing") return;
    intervalRef.current = window.setInterval(() => {
      setState((prev) => {
        if (prev.status !== "typing") return prev;
        const next = prev.visibleChars + 4;
        if (next >= prev.prompt.response.length) {
          if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
          return { status: "done", prompt: prev.prompt };
        }
        return { ...prev, visibleChars: next };
      });
    }, TYPING_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, [state.status]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state]);

  const sendPrompt = (prompt: PresetPrompt) => {
    setState({ status: "typing", prompt, visibleChars: 0 });
  };

  const visibleResponse =
    state.status === "typing"
      ? state.prompt.response.slice(0, state.visibleChars)
      : state.status === "done"
        ? state.prompt.response
        : "";

  const activePrompt =
    state.status === "typing" || state.status === "done" ? state.prompt : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
      <div className="border-b border-border bg-muted/30 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </span>
          <div>
            <p className="text-sm font-bold">Vector AI — asistent intern</p>
            <p className="text-[10px] text-muted-foreground">Configurat cu datele centrului tău (RAG, nu fine-tuning) · GDPR</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-success font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
          Online
        </span>
      </div>

      <div ref={scrollRef} className="h-[280px] overflow-y-auto p-5 space-y-3" data-testid="chat-scroll">
        {!activePrompt && (
          <div className="text-center py-10 text-xs text-muted-foreground">
            Apasă pe un prompt de mai jos ca să vezi răspunsul AI.
            <p className="mt-2 text-[10px] text-muted-foreground/80">
              Toate numele și datele din demo sunt fictive — nu reprezintă elevi reali.
            </p>
          </div>
        )}
        {activePrompt && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-xs leading-relaxed">
                {activePrompt.prompt}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2.5 text-xs leading-relaxed whitespace-pre-line text-foreground">
                {visibleResponse}
                {state.status === "typing" && (
                  <span className="inline-block w-1 h-3 ml-0.5 bg-primary animate-pulse-soft align-middle" />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-border bg-muted/20 p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Prompts pre-configurate
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`prompt-${preset.id}`}
              onClick={() => sendPrompt(preset)}
              disabled={state.status === "typing"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                "border-border bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed",
                state.status === "done" && state.prompt.id === preset.id && "border-primary text-primary"
              )}
            >
              <Send className="h-3 w-3" />
              {preset.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 pt-1">
          <ShieldCheck className="h-3 w-3 text-success" />
          Demo cu date fictive · În producție: datele tale nu sunt folosite pentru training, conform Art. 8 GDPR pentru minori.
        </p>
      </div>
    </div>
  );
}
