// @vitest-environment jsdom
/**
 * Comportamentul nucleului i18n: detectare, persistență, traducere, plural.
 *
 * Fiecare test de aici ține un comportament pe care l-am scris intenționat și care
 * s-ar pierde tăcut la o refactorizare — nu „funcția returnează un string".
 *
 * Două lucruri despre mediu, descoperite scriind testele și amândouă reale: jsdom-ul
 * configurat în `vitest.config.ts` **nu are `localStorage`** (ca Safari în navigare
 * privată), iar `navigator.language` e „en-US". Le controlăm pe amândouă explicit —
 * altfel testele ar măsura mediul, nu codul, iar al doilea e chiar cazul pe care
 * codul îl ignoră deliberat (vezi „NU urmează limba browserului").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

function installStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

function removeStorage(): void {
  Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
}

function setBrowserLanguages(...tags: string[]): void {
  Object.defineProperty(window.navigator, "languages", { configurable: true, value: tags });
  Object.defineProperty(window.navigator, "language", { configurable: true, value: tags[0] });
}

/** Modulul memorează limba, deci fiecare test îl ia de la zero. */
async function freshI18n() {
  vi.resetModules();
  return import("../core");
}

beforeEach(() => {
  installStorage();
  setBrowserLanguages("ro-MD");
  window.location.hash = "";
  document.documentElement.lang = "ro";
});

describe("detectarea limbii", () => {
  it("cade pe română când nu există nicio preferință", async () => {
    const { getLang } = await freshI18n();
    expect(getLang()).toBe("ro");
  });

  it("citește preferința salvată", async () => {
    localStorage.setItem("vf.lang", "en");
    const { getLang } = await freshI18n();
    expect(getLang()).toBe("en");
  });

  it("ignoră o valoare stricată din localStorage în loc să cadă", async () => {
    localStorage.setItem("vf.lang", "klingon");
    const { getLang } = await freshI18n();
    expect(getLang()).toBe("ro");
  });

  it("NU urmează limba browserului — româna rămâne implicită", async () => {
    // Decizie de produs, nu scăpare: în Moldova mulți vorbitori de română au browserul
    // pe engleză, iar auto-detecția le-ar fi comutat interfața fără să ceară nimeni.
    setBrowserLanguages("en-GB", "en-US");
    const { getLang } = await freshI18n();
    expect(getLang()).toBe("ro");
  });

  it("respectă ?lang= din hash — aplicația rulează pe hash routing", async () => {
    window.location.hash = "#/business/par?lang=en";
    const { getLang } = await freshI18n();
    expect(getLang()).toBe("en");
  });

  it("persistă limba primită din URL, ca primul click să n-o piardă", async () => {
    window.location.hash = "#/business?lang=en";
    const { getLang } = await freshI18n();
    getLang();
    expect(localStorage.getItem("vf.lang")).toBe("en");
  });

  it("preferă URL-ul în fața preferinței salvate — linkul primit e o intenție explicită", async () => {
    localStorage.setItem("vf.lang", "ro");
    window.location.hash = "#/business?lang=en";
    const { getLang } = await freshI18n();
    expect(getLang()).toBe("en");
  });
});

describe("schimbarea limbii", () => {
  it("anunță abonații și actualizează <html lang>", async () => {
    const { setLang, onLangChange, getLang } = await freshI18n();
    const listener = vi.fn();
    const unsubscribe = onLangChange(listener);

    setLang("en");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLang()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    unsubscribe();
  });

  it("nu anunță nimic când limba e deja cea cerută", async () => {
    const { setLang, onLangChange } = await freshI18n();
    const listener = vi.fn();
    const unsubscribe = onLangChange(listener);
    setLang("ro");
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("nu mai anunță după dezabonare", async () => {
    const { setLang, onLangChange } = await freshI18n();
    const listener = vi.fn();
    onLangChange(listener)();
    setLang("en");
    expect(listener).not.toHaveBeenCalled();
  });

  it("comută odată cu celălalt tab, la evenimentul de stocare", async () => {
    const { onLangChange, getLang } = await freshI18n();
    const listener = vi.fn();
    const unsubscribe = onLangChange(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "vf.lang", newValue: "en" }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLang()).toBe("en");
    unsubscribe();
  });
});

describe("traducerea", () => {
  it("întoarce textul limbii curente", async () => {
    const { t } = await freshI18n();
    expect(t("common.action.save", undefined, "ro")).toBe("Salvează");
    expect(t("common.action.save", undefined, "en")).toBe("Save");
  });

  it("interpolează variabilele", async () => {
    const { t } = await freshI18n();
    expect(t("common.lang.switchTo", { lang: "English" }, "en")).toBe("Switch language to English");
  });

  it("lasă acoladele pe ecran când variabila lipsește, în loc să scrie „undefined”", async () => {
    const { interpolate } = await freshI18n();
    expect(interpolate("Salut {name}", {})).toBe("Salut {name}");
  });

  it("întoarce cheia, nu gol, când lipsește peste tot", async () => {
    const { t } = await freshI18n();
    // Tipul respinge cheia inexistentă; la runtime (date vechi, cheie calculată) tot poate ajunge aici.
    const missing = "par.inexistent" as never;
    expect(t(missing)).toBe("par.inexistent");
  });
});

describe("pluralul", () => {
  it("alege forma românească potrivită — inclusiv „de” peste 19", async () => {
    const { plural } = await freshI18n();
    expect(plural("common.count.results", 1, undefined, "ro")).toBe("1 rezultat");
    expect(plural("common.count.results", 3, undefined, "ro")).toBe("3 rezultate");
    expect(plural("common.count.results", 21, undefined, "ro")).toBe("21 de rezultate");
  });

  it("alege forma engleză potrivită", async () => {
    const { plural } = await freshI18n();
    expect(plural("common.count.results", 1, undefined, "en")).toBe("1 result");
    expect(plural("common.count.results", 21, undefined, "en")).toBe("21 results");
  });
});

describe("fără stocare disponibilă", () => {
  it("pornește și comută fără să arunce — Safari privat nu e un incident", async () => {
    removeStorage();
    const { getLang, setLang } = await freshI18n();

    expect(getLang()).toBe("ro");
    // Comutarea trebuie să meargă mai departe: limba ține sesiunea, doar nu se ține minte.
    expect(() => setLang("en")).not.toThrow();
    expect(getLang()).toBe("en");
  });
});
