/**
 * `data:` URL → Blob, fără `fetch`.
 *
 * `fetch("data:…")` pare cea mai scurtă cale și funcționează pe localhost — dar în producție
 * pagina rulează sub un CSP, iar o schemă `data:` nu e acoperită de `connect-src 'self'`:
 * browserul refuză conexiunea și `fetch` aruncă „Failed to fetch". Într-un `catch` tăcut asta
 * arată exact ca bug-ul raportat de utilizator, „apăs și nu se descarcă nimic".
 *
 * Decodarea locală nu depinde de nicio politică de rețea, pentru că nu e o cerere de rețea:
 * conținutul e deja în pagină. Vezi și `shared/csp.mjs`.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) {
    throw new Error("Nu e un data: URL valid.");
  }
  const header = dataUrl.slice(5, comma);
  const isBase64 = /;base64$/i.test(header);
  const mime = header.replace(/;base64$/i, "") || "application/octet-stream";
  const payload = dataUrl.slice(comma + 1);

  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
