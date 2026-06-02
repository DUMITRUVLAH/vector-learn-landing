CREATE TABLE IF NOT EXISTS "timetable_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "teacher_id" uuid,
  "room_id" uuid,
  "day_of_week" integer NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "notes" varchar(200),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "timetable_slots_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "timetable_slots_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "school_classes"("id") ON DELETE CASCADE,
  CONSTRAINT "timetable_slots_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "school_subjects"("id") ON DELETE CASCADE,
  CONSTRAINT "timetable_slots_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL,
  CONSTRAINT "timetable_slots_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_slots_tenant_class_idx" ON "timetable_slots" ("tenant_id", "class_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_slots_tenant_teacher_day_idx" ON "timetable_slots" ("tenant_id", "teacher_id", "day_of_week");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_slots_tenant_room_day_idx" ON "timetable_slots" ("tenant_id", "room_id", "day_of_week");
