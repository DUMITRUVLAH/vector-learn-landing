/**
 * DG-111 — etichetele câmpurilor, în română, pentru mesajele serverului.
 *
 * De ce un fișier separat și nu importul catalogului din `src/lib/docs/fieldCatalog.ts`: acela e
 * pentru editor (grupuri, exemple, căutare) și trage cu el structuri de interfață. Aici avem nevoie
 * doar de traducerea nume→etichetă, ca omul să citească „IBAN contraparte", nu „contraparte.iban",
 * într-un mesaj de eroare de la API.
 */
const LABELS: Record<string, string> = {
  "noi.denumire": "Denumirea noastră",
  "noi.idno": "IDNO-ul nostru",
  "noi.adresa": "Adresa noastră juridică",
  "noi.iban": "IBAN-ul nostru",
  "noi.banca": "Banca noastră",
  "noi.administrator": "Administratorul nostru",
  "contraparte.denumire": "Denumirea contrapărții",
  "contraparte.idno": "Codul fiscal al contrapărții",
  "contraparte.iban": "IBAN contraparte",
  "contraparte.banca": "Banca contrapărții",
  "contraparte.bic": "Codul bancar (BIC/SWIFT)",
  "contraparte.adresa": "Adresa juridică a contrapărții",
  "contraparte.administrator": "Administratorul contrapărții",
  "contraparte.cod_tva": "Nr. plătitor TVA",
  "proiect.nume": "Proiectul",
  "proiect.donator": "Donatorul",
  "eveniment.nume": "Evenimentul",
  "document.numar": "Numărul actului",
  "document.data": "Data actului",
  "document.loc": "Locul întocmirii",
  "document.baza": "Actul-sursă (în baza…)",
  "total.suma": "Suma totală",
  "total.valuta": "Valuta",
  "total.in_litere": "Suma în litere",
  "utilizator.nume": "Numele întocmitorului",
  "utilizator.functie": "Funcția întocmitorului",
};

export function fieldLabelRo(name: string): string {
  return LABELS[name] ?? name;
}
