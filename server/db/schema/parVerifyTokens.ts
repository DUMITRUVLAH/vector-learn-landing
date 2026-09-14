/**
 * PARVERIFY-001 — tokenul din codul QR tipărit pe formularul PAR.
 *
 * Un rând per cerere, creat leneș la prima generare a PDF-ului. Tokenul e singura parte care
 * TREBUIE stocată: codurile de semnătură și amprenta stării se derivă (vezi `lib/par/verifyCodes.ts`),
 * dar un link public trebuie să poată fi RETRAS — dacă o hârtie se pierde, `revokedAt` închide
 * accesul fără să atingă cererea. Un token derivat ar fi fost valabil pentru totdeauna.
 *
 * `lastUsedAt` și `scanCount` nu sunt statistici de marketing: sunt semnalul că un document de
 * plată e citit de mai multe ori decât are sens, adică singurul mod de a observa că un link a
 * ajuns unde nu trebuia.
 */
import { pgTable, uuid, varchar, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { parRequests } from "./par";

export const parVerifyTokens = pgTable(
  "par_verify_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    /** 16 caractere base32 (80 de biți) — vezi `newVerifyToken()`. Nu e un UUID: se tipărește
     *  sub QR și se tastează de mână când codul e șters de fotocopiator. */
    token: varchar("token", { length: 16 }).notNull(),
    /** Cine a retras linkul și când. Un token retras întoarce 410, nu 404: omul cu hârtia în
     *  mână trebuie să afle că documentul a fost retras, nu că n-a existat niciodată. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    scanCount: integer("scan_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /** Căutarea publică lovește DOAR acest index — o cerere, un rând, fără scan de tabelă. */
    tokenIdx: uniqueIndex("par_verify_tokens_token_idx").on(t.token),
    /** Un singur token activ per cerere: retipărirea refolosește rândul, nu mai adaugă unul.
     *  Altfel fiecare descărcare de PDF ar fi lăsat un link valid în plus, la nesfârșit. */
    parIdx: uniqueIndex("par_verify_tokens_par_idx").on(t.parId),
    tenantIdx: index("par_verify_tokens_tenant_idx").on(t.tenantId),
  })
);

export type ParVerifyToken = typeof parVerifyTokens.$inferSelect;
export type NewParVerifyToken = typeof parVerifyTokens.$inferInsert;
