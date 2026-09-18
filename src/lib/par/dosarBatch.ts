/**
 * Cât de mare poate fi un pachet de dosare (owner: „să putem selecta mai multe PAR-uri o dată").
 *
 * Trăiește aici, nu în rută, fiindcă îl folosesc amândouă capetele: ecranul nu lasă omul să bifeze
 * 40 de cereri și să afle abia din server că nu se poate, iar serverul nu are încredere în ecran.
 * Același tipar ca `attachmentLimits.ts`.
 *
 * De ce 20: fiecare dosar e un PDF construit pe loc, din formular plus toate actele cererii, iar
 * funcția care răspunde moare la 60 de secunde pe platformă.
 */
export const DOSARE_ZIP_MAX = 20;
