/**
 * Specificația OpenAPI 3.1 a API-ului public (cerința 64: „API documentat (REST)").
 *
 * Stă în cod, lângă rute, și se servește din aplicație (`GET /api/public/v1/openapi.json`). Un
 * document scris separat — într-un wiki, într-un PDF de ofertă — se desincronizează de cod în
 * două luni, iar integratorul descoperă asta abia când ceva nu merge. Aici, dacă cineva schimbă
 * un endpoint fără să atingă specificația, testul de mai jos (`public-api.routes.test.ts`) pică:
 * fiecare rută montată trebuie să apară în `paths`.
 *
 * Ce NU e aici: rutele de scriere. API-ul public e doar de citire, prin decizie — vezi antetul
 * din `server/routes/publicApi.ts`.
 */

const ENVELOPE = (itemsRef: string) => ({
  type: "object",
  properties: {
    items: { type: "array", items: { $ref: itemsRef } },
    page: { type: "integer", example: 1 },
    pageSize: { type: "integer", example: 50 },
    total: { type: "integer", example: 128 },
    totalPages: { type: "integer", example: 3 },
  },
  required: ["items", "page", "pageSize", "total", "totalPages"],
});

const PAGING_PARAMS = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 }, description: "Pagina cerută." },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    description: "Câte rânduri pe pagină. Maximul e 200 — o cerere nu poate trage toată baza.",
  },
];

const UPDATED_SINCE = {
  name: "updatedSince",
  in: "query",
  schema: { type: "string", format: "date-time" },
  description:
    "Doar rândurile modificate după acest moment (ISO 8601). Pentru reîmprospătare incrementală în Power BI / Excel, ca refresh-ul să nu tragă toată baza.",
};

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "FinFlow CRM — API public",
    version: "1.0.0",
    description: [
      "API REST **doar de citire** peste datele comerciale ale unui workspace FinFlow.",
      "",
      "Autentificare: cheie de workspace în antetul `X-API-Key` (sau `Authorization: Bearer fk_…`).",
      "Cheile se creează din aplicație, în CRM → API, și se văd în clar o singură dată.",
      "",
      "Limită: 120 de cereri pe minut per cheie. Răspunsul poartă antetele standard `RateLimit-*`.",
      "",
      "Tenantul (workspace-ul) se deduce din cheie — nu există niciun parametru prin care să se",
      "ceară datele altui workspace.",
      "",
      "Sumele sunt întregi, în bani (cenți): `valueCents: 125050` înseamnă 1.250,50.",
    ].join("\n"),
    contact: { name: "FinFlow", url: "https://www.finflow.best" },
  },
  servers: [{ url: "https://www.finflow.best/api/public/v1", description: "Producție" }],
  security: [{ ApiKeyAuth: [] }],
  tags: [
    { name: "Leaduri", description: "Oportunitățile comerciale." },
    { name: "Nomenclatoare", description: "Firme, produse, pâlnii, utilizatori." },
    { name: "Activitate", description: "Taskuri și acte." },
    { name: "Rapoarte", description: "Indicatori agregați, gata de pus într-un tablou de bord." },
  ],
  paths: {
    "/leads": {
      get: {
        tags: ["Leaduri"],
        summary: "Lista de leaduri",
        description:
          "Ordonate descrescător după ultima modificare. Leadul cu consimțământul retras iese marcat `consentRevoked: true` — sistemul din aval nu are voie să-l bage într-o campanie.",
        parameters: [
          ...PAGING_PARAMS,
          UPDATED_SINCE,
          { name: "stage", in: "query", schema: { type: "string" }, description: "Cheia etapei (ex. `new`, `contacted`)." },
          { name: "source", in: "query", schema: { type: "string" }, description: "Sursa leadului (ex. `webform`, `referral`)." },
          { name: "pipelineId", in: "query", schema: { type: "string", format: "uuid" }, description: "Pâlnia." },
        ],
        responses: {
          200: { description: "Pagina de leaduri", content: { "application/json": { schema: ENVELOPE("#/components/schemas/Lead") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/leads/{id}": {
      get: {
        tags: ["Leaduri"],
        summary: "Un lead",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Leadul cerut", content: { "application/json": { schema: { $ref: "#/components/schemas/Lead" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { description: "Nu există în workspace-ul cheii." },
        },
      },
    },
    "/companies": {
      get: {
        tags: ["Nomenclatoare"],
        summary: "Firmele (baza unică de clienți)",
        description: "Include firmografia după care se segmentează: industrie, regiune, mărime, consum anual.",
        parameters: [...PAGING_PARAMS, UPDATED_SINCE],
        responses: {
          200: { description: "Pagina de firme", content: { "application/json": { schema: ENVELOPE("#/components/schemas/Company") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/products": {
      get: {
        tags: ["Nomenclatoare"],
        summary: "Catalogul de produse/servicii",
        responses: {
          200: { description: "Catalogul", content: { "application/json": { schema: ENVELOPE("#/components/schemas/Product") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/pipelines": {
      get: {
        tags: ["Nomenclatoare"],
        summary: "Pâlniile, cu etapele lor",
        description: "Etapa poartă `isWon`/`isLost` și probabilitatea — de aici se calculează conversia și forecastul în BI.",
        responses: {
          200: { description: "Pâlniile", content: { "application/json": { schema: ENVELOPE("#/components/schemas/Pipeline") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/users": {
      get: {
        tags: ["Nomenclatoare"],
        summary: "Oamenii workspace-ului",
        description: "Pentru rapoartele pe agent: `assignedTo` de pe lead trimite aici.",
        responses: {
          200: { description: "Oamenii", content: { "application/json": { schema: ENVELOPE("#/components/schemas/User") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/tasks": {
      get: {
        tags: ["Activitate"],
        summary: "Taskurile pe leaduri",
        parameters: [...PAGING_PARAMS, { name: "status", in: "query", schema: { type: "string", enum: ["open", "done", "snoozed"] } }],
        responses: {
          200: { description: "Pagina de taskuri", content: { "application/json": { schema: ENVELOPE("#/components/schemas/Task") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/documents": {
      get: {
        tags: ["Activitate"],
        summary: "Actele (oferte, contracte, acte de primire-predare)",
        description: "Fără corpul actului — doar antetul lui: număr, dată, contraparte, stare, valoare.",
        parameters: [...PAGING_PARAMS, { name: "kind", in: "query", schema: { type: "string" }, description: "Tipul actului (ex. `oferta_comerciala`)." }],
        responses: {
          200: { description: "Pagina de acte", content: { "application/json": { schema: ENVELOPE("#/components/schemas/Document") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/reports/summary": {
      get: {
        tags: ["Rapoarte"],
        summary: "Indicatorii comerciali, agregați",
        description:
          "Un obiect mic, calculat în bază. Rata de conversie se calculează pe afacerile ÎNCHISE (câștigate / (câștigate + pierdute)): leadurile încă deschise n-au pierdut nimic, iar împărțirea la tot ce există doar diluează cifra pe măsură ce intră leaduri noi.",
        responses: {
          200: { description: "Indicatorii", content: { "application/json": { schema: { $ref: "#/components/schemas/Summary" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/openapi.json": {
      get: {
        tags: ["Rapoarte"],
        summary: "Specificația aceasta",
        description: "Publică, fără cheie: descrie forma datelor, nu datele.",
        security: [],
        responses: { 200: { description: "Documentul OpenAPI" } },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    responses: {
      Unauthorized: { description: "Cheie lipsă, greșită sau revocată." },
      RateLimited: { description: "Peste 120 de cereri pe minut pentru această cheie." },
    },
    schemas: {
      Lead: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          fullName: { type: "string" },
          dealName: { type: ["string", "null"], description: "Numele afacerii, când diferă de numele persoanei." },
          company: { type: ["string", "null"] },
          companyId: { type: ["string", "null"], format: "uuid" },
          phone: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          stage: { type: "string" },
          pipelineId: { type: ["string", "null"], format: "uuid" },
          source: { type: "string" },
          productId: { type: ["string", "null"], format: "uuid" },
          valueCents: { type: "integer", description: "Valoarea afacerii, în bani (cenți)." },
          probabilityPct: { type: ["integer", "null"], description: "Probabilitatea proprie; `null` = se moștenește de la etapă." },
          assignedTo: { type: ["string", "null"], format: "uuid" },
          lostReason: { type: ["string", "null"] },
          consentRevoked: { type: "boolean", description: "`true` = nu mai poate fi contactat comercial." },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Company: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          idno: { type: ["string", "null"] },
          industry: { type: ["string", "null"] },
          region: { type: ["string", "null"] },
          companySize: { type: ["string", "null"] },
          annualConsumptionKwh: { type: ["string", "null"] },
          website: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          address: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          sku: { type: ["string", "null"] },
          name: { type: "string" },
          category: { type: ["string", "null"] },
          unit: { type: "string" },
          listPriceCents: { type: "integer" },
          currency: { type: "string" },
          vatPercent: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
      Pipeline: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          isDefault: { type: "boolean" },
          orderIndex: { type: "integer" },
          stages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                orderIndex: { type: "integer" },
                isWon: { type: "boolean" },
                isLost: { type: "boolean" },
                probabilityPct: { type: ["integer", "null"] },
              },
            },
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: ["string", "null"] },
          email: { type: "string" },
          role: { type: "string" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          leadId: { type: "string", format: "uuid" },
          title: { type: "string" },
          dueAt: { type: ["string", "null"], format: "date-time" },
          status: { type: "string", enum: ["open", "done", "snoozed"] },
          assignedTo: { type: ["string", "null"], format: "uuid" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Document: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          kind: { type: "string" },
          docNumber: { type: ["string", "null"] },
          docDate: { type: "string", format: "date-time" },
          title: { type: "string" },
          status: { type: "string", enum: ["draft", "pending_approval", "final", "sent", "signed", "rejected", "cancelled"] },
          counterpartyName: { type: ["string", "null"] },
          totalCents: { type: "integer" },
          currency: { type: "string" },
          sentAt: { type: ["string", "null"], format: "date-time" },
          outcomeAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Summary: {
        type: "object",
        properties: {
          generatedAt: { type: "string", format: "date-time" },
          currency: { type: "string" },
          leads: {
            type: "object",
            properties: {
              total: { type: "integer" },
              open: { type: "integer" },
              won: { type: "integer" },
              lost: { type: "integer" },
              conversionPctOnClosed: { type: "integer" },
              openValueCents: { type: "integer" },
              weightedForecastCents: { type: "integer", description: "Valoarea afacerilor deschise, ponderată cu probabilitatea etapei, plus cele câștigate." },
            },
          },
          bySource: { type: "array", items: { type: "object", properties: { source: { type: "string" }, count: { type: "integer" } } } },
          byStage: {
            type: "array",
            items: {
              type: "object",
              properties: { stage: { type: "string" }, pipelineId: { type: ["string", "null"] }, count: { type: "integer" }, valueCents: { type: "integer" } },
            },
          },
          documents: {
            type: "array",
            items: { type: "object", properties: { status: { type: "string" }, count: { type: "integer" }, totalCents: { type: "integer" } } },
          },
        },
      },
    },
  },
} as const;

/** Căile documentate — folosit de test ca să nu existe rută nedocumentată. */
export const OPENAPI_PATHS = Object.keys(OPENAPI_DOCUMENT.paths);
