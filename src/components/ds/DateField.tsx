/**
 * Câmp de dată afișat mereu zi.lună.an (13.01.2027), oricare ar fi limba browserului.
 *
 * `<input type="date">` își ia ordinea din limba browserului, nu din pagină: pe un Chrome în
 * engleză (SUA) arăta 01/13/2027. Aici câmpul e text — tastezi 13012027 și punctele apar
 * singure — iar calendarul nativ rămâne la un click pe iconiță (sau Alt+↓).
 *
 * E un înlocuitor direct pentru `<Input type="date">`: `value` e tot ISO `YYYY-MM-DD` sau "",
 * iar `onChange` primește tot `e.target.value` în ISO. Cât timp scrii, formularul păstrează
 * ultima dată întreagă (un filtru nu se reîncarcă la fiecare cifră, iar paginile care pun o
 * valoare implicită în locul lui "" nu-ți rescriu textul sub degete). O dată lăsată neterminată
 * sau inexistentă (31.02) ajunge în formular ca "" la ieșirea din câmp — nu o valoare veche.
 */
import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_DATE_PLACEHOLDER, formatDayDate, parseDayDate, shapeDayDate } from "@/lib/dayDate";

/** Ce primește `onChange`: aceeași formă pe care o citeau handlerii câmpului nativ. */
export interface DateFieldChange {
  target: { value: string; name: string };
}

export interface DateFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "size" | "min" | "max"> {
  /** ISO `YYYY-MM-DD`, sau gol. */
  value: string | null | undefined;
  /** `e.target.value` e ISO `YYYY-MM-DD`, sau "" când câmpul e gol ori părăsit cu o dată greșită. */
  onChange?: (event: DateFieldChange) => void;
  /** ISO. Limitează calendarul și colorează în roșu o dată tastată în afara intervalului. */
  min?: string;
  max?: string;
  invalid?: boolean;
  /** Merge pe învelitoare — de obicei lățimea (`w-40`, `sm:max-w-[11.5rem]`). */
  className?: string;
  /** Merge pe câmpul de text — pentru formularele cu alt gabarit (`h-11` la cererea PAR). */
  inputClassName?: string;
}

export function DateField({
  value,
  onChange,
  min,
  max,
  invalid,
  className,
  inputClassName,
  name,
  disabled,
  readOnly,
  placeholder = DAY_DATE_PLACEHOLDER,
  onBlur,
  onKeyDown,
  ...rest
}: DateFieldProps) {
  const iso = value ?? "";
  const [text, setText] = useState(() => formatDayDate(iso));
  const [bad, setBad] = useState(false);
  const emitted = useRef(iso);
  const field = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // O valoare venită din afară (AI a completat, filtrul s-a resetat) rescrie textul. Ecoul
  // propriei valori nu — altfel „13.0" s-ar șterge sub degete când formularul primește "".
  useEffect(() => {
    if (iso === emitted.current) return;
    emitted.current = iso;
    setText(formatDayDate(iso));
    setBad(false);
  }, [iso]);

  const emit = (next: string) => {
    if (next === emitted.current) return;
    emitted.current = next;
    onChange?.({ target: { value: next, name: name ?? "" } });
  };

  const outOfRange = (d: string) => (min ? d < min : false) || (max ? d > max : false);

  // Câmpul nativ bloca trimiterea formularului cu un mesaj lângă câmp când data era sub `min`;
  // același lucru aici, și pentru o dată care nu există — altfel formularul ar pleca cu "".
  useEffect(() => {
    const parsed = parseDayDate(text);
    let message = "";
    if (text.trim() && !parsed) message = "Scrie data ca zi.lună.an, de exemplu 13.01.2027.";
    else if (parsed && min && parsed < min) message = `Data trebuie să fie cel puțin ${formatDayDate(min)}.`;
    else if (parsed && max && parsed > max) message = `Data trebuie să fie cel mult ${formatDayDate(max)}.`;
    field.current?.setCustomValidity(message);
  }, [text, min, max]);

  const handleText = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Punctele se pun doar când scrii la capăt; o corectură la mijloc rămâne cum ai lăsat-o,
    // ca să nu-ți sară cursorul la sfârșit.
    const atEnd = e.target.selectionStart === null || e.target.selectionStart === raw.length;
    const next = raw.length > text.length && atEnd ? shapeDayDate(raw) : raw;
    setText(next);
    setBad(false);
    const parsed = parseDayDate(next);
    if (parsed) emit(parsed);
    else if (next.trim() === "") emit("");
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const parsed = parseDayDate(text);
    if (parsed) setText(formatDayDate(parsed));
    // Ce a rămas în câmp nu e o dată: formularul nu mai poate ține data veche în spatele lui.
    else if (text.trim() !== "") emit("");
    setBad(text.trim() !== "" && (!parsed || outOfRange(parsed)));
    onBlur?.(e);
  };

  const openPicker = () => {
    const el = picker.current;
    if (!el || disabled || readOnly) return;
    try {
      el.showPicker();
    } catch {
      // Browsere fără showPicker(): focusul pe câmpul nativ deschide calendarul la click.
      el.focus();
      el.click();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      openPicker();
    }
    onKeyDown?.(e);
  };

  const handlePicked = (e: ChangeEvent<HTMLInputElement>) => {
    setText(formatDayDate(e.target.value));
    setBad(false);
    emit(e.target.value);
  };

  const isInvalid = invalid || bad;

  return (
    <div className={cn("relative w-full", className)}>
      <input
        {...rest}
        ref={field}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={isInvalid || undefined}
        onChange={handleText}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "h-10 w-full rounded-md border bg-background pl-3 pr-11 text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-50 max-sm:h-11",
          isInvalid ? "border-destructive" : "border-input",
          inputClassName,
        )}
      />
      {/* Calendarul nativ: invizibil, sub câmp, ca fereastra lui să se deschidă lângă câmp.
          `form` spre un id inexistent îl scoate din formular: cu `min`/`max` și o valoare în
          afara lor ar fi un câmp invalid pe care browserul nu-l poate focusa, deci ar bloca
          trimiterea fără niciun mesaj. Validarea vizibilă o face câmpul de text, mai sus. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        form="datefield-picker-outside-any-form"
        value={iso}
        min={min}
        max={max}
        disabled={disabled}
        onChange={handlePicked}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || readOnly}
        aria-label="Alege din calendar"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
