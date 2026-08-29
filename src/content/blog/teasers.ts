/**
 * Rândul explicativ de sub titlu, în blocurile „Mai departe”.
 *
 * Trăiește aici, nu în articolul care leagă: copiat în fiecare articol care trimite spre altul, o
 * redenumire ar lăsa în urmă descrieri false — exact clasa de bug pe care tipurile o previn în rest.
 * Un slug fără teaser cade elegant la titlu, dar testul de corpus pică, deci lipsa se vede la commit.
 */
export const TEASERS: Record<string, string> = {
  "cine-aproba-platile-limite-de-aprobare":
    "Matricea de limite, cele patru reguli uitate și textul politicii, gata de adaptat.",
  "frauda-prin-schimbarea-ibanului":
    "Cum arată atacul pas cu pas, de ce banca nu întoarce banii și emailul de confirmare.",
  "verificarea-facturii-inainte-de-plata":
    "Cele trei potriviri care prind problema reală, și ce nu merită verificat de fiecare dată.",
  "dosarul-unei-plati":
    "Cele cinci documente care fac un dosar să reziste, citate din contractele-tip ale finanțatorilor.",
  "cat-costa-aprobarea-pe-email-si-excel":
    "Aritmetica completă, cu fiecare ipoteză vizibilă, ca s-o poți reface cu cifrele tale.",
};
