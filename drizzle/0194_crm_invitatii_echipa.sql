-- CRM: invitații în echipa de vânzări, pe același flux ca invitațiile PAR (link + parolă/Google).
-- `module` spune ce deschide invitația; `workspace_role` e rolul primit în CRM; `par_role` devine
-- opțional fiindcă o invitație CRM nu dă niciun rol PAR.
ALTER TABLE "par_invites" ADD COLUMN IF NOT EXISTS "module" varchar(16) DEFAULT 'par' NOT NULL;
--> statement-breakpoint
ALTER TABLE "par_invites" ADD COLUMN IF NOT EXISTS "workspace_role" varchar(20);
--> statement-breakpoint
ALTER TABLE "par_invites" ALTER COLUMN "par_role" DROP NOT NULL;
