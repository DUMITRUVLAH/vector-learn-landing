/**
 * Traduce eșecul unei citiri de cerere PAR într-o propoziție care spune DE CE.
 *
 * Incidentul care a produs asta (2026-08-28): un link din emailul „ready for payment" deschis
 * într-o sesiune logată în alt workspace. Cererea exista, drepturile erau în regulă — doar contul
 * era altul. Ecranul afișa `not_found`, adică fix informația care nu ajută pe nimeni.
 *
 * Serverul răspunde în continuare 404 pe toate cazurile (nu confirmăm un id din alt workspace),
 * dar trimite și `reason` + contextul contului curent. Aici îl facem citibil.
 */

export interface ParAccessErrorBody {
  reason?: unknown;
  currentEmail?: unknown;
  currentWorkspace?: unknown;
  workspace?: unknown;
}

export interface ParAccessMessage {
  /** Titlul afișat în banner. */
  title: string;
  /** Explicația — de ce vine eroarea și ce are omul de făcut. */
  detail: string;
  /** True când remediul e „intră cu alt cont", deci merită arătat linkul de autentificare. */
  suggestsRelogin: boolean;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** „ești autentificat ca a@b în workspace-ul X" — partea comună a mesajelor. */
function whoAmI(body: ParAccessErrorBody): string {
  const email = str(body.currentEmail);
  const workspace = str(body.currentWorkspace);
  if (email && workspace) return `Ești autentificat ca ${email}, în workspace-ul „${workspace}”.`;
  if (email) return `Ești autentificat ca ${email}.`;
  if (workspace) return `Ești autentificat în workspace-ul „${workspace}”.`;
  return "";
}

const FALLBACK: ParAccessMessage = {
  title: "Cererea nu a fost găsită",
  detail: "Linkul nu duce la o cerere pe care o poți deschide cu contul curent.",
  suggestsRelogin: false,
};

export function parAccessMessage(body: ParAccessErrorBody | null | undefined): ParAccessMessage {
  const reason = str(body?.reason);
  if (!body || !reason) return FALLBACK;
  const me = whoAmI(body);
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" ");

  switch (reason) {
    case "other_workspace": {
      const workspace = str(body.workspace);
      return {
        title: "Cererea aparține altui workspace",
        detail: join(
          workspace
            ? `Cererea e în workspace-ul „${workspace}”, nu în cel în care ești acum.`
            : "Cererea e în alt workspace decât cel în care ești acum.",
          me,
          workspace
            ? `Ai cont și în „${workspace}” cu același email — deconectează-te și intră acolo ca s-o deschizi.`
            : "Deconectează-te și intră în workspace-ul care ți-a trimis notificarea."
        ),
        suggestsRelogin: true,
      };
    }
    case "other_workspace_no_account":
      return {
        title: "Cererea aparține altui workspace",
        detail: join(
          "Cererea există, dar într-un alt workspace decât cel în care ești autentificat.",
          me,
          "Deschide linkul din contul care a primit notificarea — de regulă alt email decât cel curent."
        ),
        suggestsRelogin: true,
      };
    case "not_requestor":
      return {
        title: "Nu ai acces la această cerere",
        detail: join(
          "Cererea a fost depusă de altcineva, iar contul tău nu are rol de aprobator, finanțe sau administrator PAR.",
          me,
          "Cere-i unui administrator PAR să-ți dea rolul potrivit."
        ),
        suggestsRelogin: false,
      };
    case "draft_private":
      return {
        title: "Cererea e încă ciornă",
        detail: join(
          "O ciornă e vizibilă doar autorului ei până la depunere — nici aprobatorii, nici finanțele nu o văd.",
          me
        ),
        suggestsRelogin: false,
      };
    case "out_of_scope":
      return {
        title: "Cererea e în afara ariei tale",
        detail: join(
          "Cererea aparține unui proiect sau unei organizații la care contul tău nu e alocat.",
          me,
          "Cere-i unui administrator PAR să te adauge la proiectul respectiv."
        ),
        suggestsRelogin: false,
      };
    case "module_disabled":
      return {
        title: "Modulul PAR e oprit pentru această organizație",
        detail: join(
          "Cererea aparține unei organizații pentru care modulul PAR nu e activat.",
          me,
          "Activarea se face din Consola Platformă."
        ),
        suggestsRelogin: false,
      };
    case "unknown_id":
      return {
        title: "Cererea nu există",
        detail: join(
          "Nicio cerere nu are acest identificator — probabil a fost ștearsă sau linkul e trunchiat.",
          me
        ),
        suggestsRelogin: false,
      };
    default:
      return FALLBACK;
  }
}
