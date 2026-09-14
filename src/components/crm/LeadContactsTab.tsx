/**
 * CRM Faza 9 — fila „Contacte" din fișa leadului.
 *
 * Portare din crm-vector (ContactsTab). Pe un lead B2B vorbești cu mai mulți oameni: decidentul,
 * contabila, tehnicul. Până acum toți încăpeau într-un singur câmp „telefon" — adică nu încăpeau.
 *
 * Principalul e marcat vizibil și stă primul: e omul pe care îl suni dacă suni unul singur.
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Star, Phone, Mail } from "lucide-react";
import { Badge, Button, Input, Label } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  listCrmLeadContacts,
  createCrmLeadContact,
  updateCrmLeadContact,
  deleteCrmLeadContact,
  type CrmLeadContact,
} from "@/lib/api/crm";

export interface LeadContactsTabProps {
  leadId: string;
  onToast: (toast: { kind: "success" | "error"; message: string }) => void;
}

export function LeadContactsTab({ leadId, onToast }: LeadContactsTabProps) {
  const [contacts, setContacts] = useState<CrmLeadContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCrmLeadContacts(leadId)
      .then((res) => {
        if (!cancelled) setContacts(res.items);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function addContact() {
    if (name.trim().length < 2) return;
    setAdding(true);
    try {
      const created = await createCrmLeadContact({
        leadId,
        fullName: name.trim(),
        role: role.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        // Primul contact devine principalul: un lead cu un singur om de contact nu trebuie să
        // ceară un click în plus ca să spună cine e „principalul".
        isPrimary: contacts.length === 0,
      });
      setContacts((prev) => sortContacts([...prev, created]));
      setName("");
      setRole("");
      setPhone("");
      setEmail("");
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut adăuga contactul." });
    } finally {
      setAdding(false);
    }
  }

  async function makePrimary(contact: CrmLeadContact) {
    setBusyId(contact.id);
    try {
      await updateCrmLeadContact(contact.id, { isPrimary: true });
      // Serverul îi scoate pe ceilalți; oglindim local, ca lista să nu arate doi „principali".
      setContacts((prev) =>
        sortContacts(prev.map((ct) => ({ ...ct, isPrimary: ct.id === contact.id ? 1 : 0 })))
      );
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut schimba contactul principal." });
    } finally {
      setBusyId(null);
    }
  }

  async function removeContact(contact: CrmLeadContact) {
    if (!confirm(`Ștergi contactul „${contact.fullName}”?`)) return;
    setBusyId(contact.id);
    try {
      await deleteCrmLeadContact(contact.id);
      setContacts((prev) => prev.filter((ct) => ct.id !== contact.id));
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge contactul." });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă contactele..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Niciun contact încă. Adaugă oamenii cu care vorbești la această firmă.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((contact) => {
            const busy = busyId === contact.id;
            const primary = contact.isPrimary === 1;
            return (
              <li
                key={contact.id}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-2.5",
                  primary ? "border-primary/40 bg-primary/5" : "border-border"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">{contact.fullName}</p>
                    {primary && <Badge variant="secondary">principal</Badge>}
                  </div>
                  {contact.role && <p className="text-xs text-muted-foreground">{contact.role}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    {contact.phone && (
                      // `tel:`/`mailto:` cer navigare reală de browser — un `<a>` simplu, nu
                      // `Button href`, care ar trece prin router-ul intern.
                      <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 hover:underline">
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:underline">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        {contact.email}
                      </a>
                    )}
                  </div>
                </div>
                {!primary && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Fă-l principal pe ${contact.fullName}`}
                    onClick={() => void makePrimary(contact)}
                    disabled={busy}
                  >
                    <Star className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Șterge contactul ${contact.fullName}`}
                  onClick={() => void removeContact(contact)}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-contact-name" required>
              Nume
            </Label>
            <Input id="crm-contact-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-contact-role">Rol</Label>
            <Input
              id="crm-contact-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="ex: Director, Contabil"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-contact-phone">Telefon</Label>
            <Input id="crm-contact-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-contact-email">Email</Label>
            <Input id="crm-contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <Button className="w-fit" onClick={() => void addContact()} disabled={name.trim().length < 2 || adding}>
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          Adaugă contact
        </Button>
      </div>
    </div>
  );
}

/** Principalul primul, apoi în ordinea adăugării — aceeași ordine ca pe server. */
function sortContacts(list: CrmLeadContact[]): CrmLeadContact[] {
  return [...list].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return b.isPrimary - a.isPrimary;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}
