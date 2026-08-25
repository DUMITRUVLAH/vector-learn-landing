-- PAR — anexele standard din formular ca tipuri de document de sine stătătoare:
-- listă de participanți, raport narativ, livrabile. Plus `kind_other`, unde utilizatorul
-- scrie ce document a atașat când alege „Altul" (altfel dosarul rămâne cu „Alt document").
-- ALTER TYPE … ADD VALUE e permis într-o tranzacție pe PG12+ atâta timp cât valoarea nouă
-- nu e folosită în aceeași tranzacție — aici doar se adaugă.
ALTER TYPE "public"."par_attachment_kind" ADD VALUE IF NOT EXISTS 'participants_list';
--> statement-breakpoint
ALTER TYPE "public"."par_attachment_kind" ADD VALUE IF NOT EXISTS 'narrative_report';
--> statement-breakpoint
ALTER TYPE "public"."par_attachment_kind" ADD VALUE IF NOT EXISTS 'deliverables';
--> statement-breakpoint
ALTER TABLE "par_attachments" ADD COLUMN IF NOT EXISTS "kind_other" varchar(200);
