/**
 * Ce NU are voie nimeni să atingă: documentele semnate electronic.
 *
 * Motivul e mecanic, nu de prudență. O semnătură PDF acoperă un interval de octeți din chiar
 * fișierul acela (`/ByteRange [0 a b c]`), iar verificatorul recalculează amprenta peste exact
 * acei octeți. Orice rescriere — chiar una perfect corectă vizual, care nu schimbă nici un pixel —
 * mută offset-urile și invalidează semnătura. Documentul rămâne lizibil, dar devine un document
 * NESEMNAT, adică fără valoare juridică.
 *
 * Nu e teorie: pe `74484483_1_FiscalInvoice.pdf` din storage-ul nostru (1,71 MB, e-Factura semnată),
 * o simplă reîncărcare-și-resalvare cu pdf-lib scoate 1,71 MB → 324 KB. Pare o compresie
 * spectaculoasă de 82%; în realitate cei 1,4 MB „economisiți" ERAU semnătura și actualizarea
 * incrementală care o poartă. De asta detecția de aici rulează ÎNAINTE de orice compresie, iar la
 * dubii răspunde „semnat" — un fișier nemicșorat costă 1 MB, un fișier desemnat costă un act.
 */

/** Marcajele care, prezente în octeții bruți, înseamnă „aici e o semnătură". */
const SIGNATURE_MARKERS = [
  "/ByteRange", // intervalul peste care s-a calculat amprenta — nucleul oricărei semnături PDF
  "/Type/Sig",
  "/Type /Sig",
  "/adbe.pkcs7", // SubFilter Adobe (PKCS#7)
  "/ETSI.CAdES.detached", // SubFilter PAdES — ce folosesc MSign și SFS
  "/ETSI.RFC3161", // marcă temporală (DocTimeStamp)
  "/DocMDP", // semnătură de certificare, care blochează modificările
  "/FT/Sig",
  "/FT /Sig", // câmpul de formular care ȚINE semnătura
];

/** Extensiile care sunt ele însele un container de semnătură sau un act care se verifică octet cu octet. */
const SIGNATURE_EXTENSIONS = [".p7s", ".p7m", ".asice", ".asics", ".sce", ".sig", ".xades", ".xml"];

/**
 * Numele care spun singure că actul e semnat. SFS-ul din Moldova livrează e-Factura ca
 * `<idno>_<perioada>_<serie>.signed.pdf`, iar MSign adaugă `-semnat`.
 */
const SIGNED_NAME_PATTERNS = [/\.signed\.pdf$/i, /[-_ ]semnat(ă|a)?\.pdf$/i, /[-_ ]signed\.pdf$/i];

/** Actul se verifică octet cu octet după nume — fără să-i citim conținutul. */
export function hasSignedFileName(fileName: string): boolean {
  const name = fileName.toLowerCase().trim();
  if (SIGNATURE_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return SIGNED_NAME_PATTERNS.some((re) => re.test(name));
}

/**
 * Caută marcajele de semnătură în octeții PDF-ului.
 *
 * Citirea e pe text brut (latin1), nu pe structura parsată, și asta e intenționat: dicționarul
 * semnăturii NU poate sta într-un object stream comprimat (semnătura trebuie să fie citibilă
 * înainte de a decomprima ceva), deci marcajele sunt mereu în clar. O căutare pe text le vede
 * chiar și în fișierele pe care parser-ul nostru nu reușește să le deschidă — exact cazul în care
 * ne-am dori cel mai tare să nu atingem nimic.
 */
export function hasSignatureMarkers(bytes: Uint8Array): boolean {
  // `/Encrypt` intră tot aici: un PDF criptat nu se rescrie fără parola cu care a fost făcut.
  const text = latin1(bytes);
  if (text.includes("/Encrypt")) return true;
  return SIGNATURE_MARKERS.some((m) => text.includes(m));
}

/** Verdictul complet pentru un PDF: nume + conținut. La orice îndoială → `true`. */
export function isSignedPdf(bytes: Uint8Array, fileName = ""): boolean {
  if (fileName && hasSignedFileName(fileName)) return true;
  return hasSignatureMarkers(bytes);
}

function latin1(bytes: Uint8Array): string {
  // `TextDecoder("latin1")` mapează 1:1 octet → caracter, deci marcajele ASCII se caută corect
  // oricât de binar ar fi restul fișierului. Alternativa naivă,
  // `String.fromCharCode(...bytes)`, aruncă „Maximum call stack size exceeded" pe un PDF de
  // câțiva MB — iar un fișier mare declarat nesemnat dintr-o eroare de decodare e exact
  // accidentul pe care modulul ăsta există ca să-l prevină.
  return new TextDecoder("latin1").decode(bytes);
}
