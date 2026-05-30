import "dotenv/config";
import { db, closeDb } from "./client";
import { tenants, users, students, teachers, courses, lessons, branches } from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/password";

const DEMO_SLUG = "demo-lingua-school";
const DEMO_PASSWORD = "demo123456";

async function seed() {
  console.log("🌱 Seeding demo tenant…");

  // Real bcrypt hash so seeded accounts can log in on EVERY environment —
  // local, preview, and Vercel production. Previously these rows stored a
  // "$placeholder$" sentinel that only the dev-only /__dev__/setup-demo-password
  // endpoint could fix; that endpoint is blocked in production, so prod logins
  // failed with invalid_credentials. Hashing here removes that prod dependency.
  const demoPasswordHash = await hashPassword(DEMO_PASSWORD);

  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.slug, DEMO_SLUG),
  });

  if (existing) {
    console.log(`⚠️  Demo tenant already exists (${existing.id}). Skipping.`);
    return;
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Demo Lingua School",
      slug: DEMO_SLUG,
      plan: "growth",
    })
    .returning();

  console.log(`✅ Tenant created: ${tenant.name}`);

  // BRANCH-701: Create default branch for the tenant
  const [defaultBranch] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      name: "Sediul principal",
      address: "Strada Exemplu 1, București",
      status: "active",
    })
    .returning();

  const [admin] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: "admin@demo.vectorlearn.io",
      passwordHash: demoPasswordHash,
      name: "Andreea Mitran",
      role: "admin",
    })
    .returning();

  const teacherUsers = await db
    .insert(users)
    .values([
      { tenantId: tenant.id, email: "ana@demo.vectorlearn.io", passwordHash: demoPasswordHash, name: "Ana Marinescu", role: "teacher" },
      { tenantId: tenant.id, email: "radu@demo.vectorlearn.io", passwordHash: demoPasswordHash, name: "Radu Constantin", role: "teacher" },
      { tenantId: tenant.id, email: "elena@demo.vectorlearn.io", passwordHash: demoPasswordHash, name: "Elena Vasilescu", role: "teacher" },
    ])
    .returning();

  const teacherRows = await db
    .insert(teachers)
    .values(
      teacherUsers.map((u, i) => ({
        tenantId: tenant.id,
        userId: u.id,
        hourlyRateCents: [3500, 4500, 4000][i],
        commissionPct: [45, 50, 45][i],
        branchId: defaultBranch.id, // BRANCH-701
      }))
    )
    .returning();

  console.log(`✅ ${teacherUsers.length} teachers created`);

  const studentNames = [
    "Maria Popescu", "Andrei Ionescu", "Elena Vasilescu", "Mihai Stoica",
    "Ana Dumitrescu", "Radu Petrescu", "Cristina Mitran", "Sergiu Popa",
    "Ioana Răducanu", "Vlad Anghel", "Diana Marin", "Alexandru Tudor",
    "Sofia Negoiță", "Tudor Cristea", "Bianca Roșu", "Matei Andrei",
    "Iulia Pavel", "Cosmin Mihai", "Larisa Dobre", "Eric Cristescu",
  ];

  const studentRows = await db
    .insert(students)
    .values(
      studentNames.map((name, i) => ({
        tenantId: tenant.id,
        fullName: name,
        phone: `+4072${String(1000000 + i).padStart(7, "0")}`,
        email: `${name.toLowerCase().replace(/\s+/g, ".").replace(/ț/g, "t").replace(/ă/g, "a").replace(/î/g, "i").replace(/ș/g, "s").replace(/â/g, "a")}@example.com`,
        parentPhone: `+4072${String(2000000 + i).padStart(7, "0")}`,
        parentEmail: `parent.${i}@example.com`,
        status: i % 8 === 0 ? "trial" : i % 12 === 0 ? "paused" : "active",
        branchId: defaultBranch.id, // BRANCH-701: assign to default branch
      }))
    )
    .returning();

  console.log(`✅ ${studentRows.length} students created`);

  const [engB2, pythonAv, pianMid] = await db
    .insert(courses)
    .values([
      { tenantId: tenant.id, name: "Engleză B2", description: "Curs intermediar-avansat, pregătire Cambridge B2", level: "B2", defaultPriceCents: 28000, durationMinutes: 90, branchId: defaultBranch.id },
      { tenantId: tenant.id, name: "Python avansat", description: "Web scraping, async, Django", level: "advanced", defaultPriceCents: 42000, durationMinutes: 120, branchId: defaultBranch.id },
      { tenantId: tenant.id, name: "Pian — intermediar", description: "Grade 4-5 ABRSM", level: "intermediate", defaultPriceCents: 60000, durationMinutes: 60, branchId: defaultBranch.id },
    ])
    .returning();

  const now = new Date();
  const lessonRows = await db
    .insert(lessons)
    .values([
      { tenantId: tenant.id, courseId: engB2.id, teacherId: teacherRows[0].id, scheduledAt: new Date(now.getTime() + 24 * 3600 * 1000), durationMinutes: 90, status: "scheduled", branchId: defaultBranch.id },
      { tenantId: tenant.id, courseId: pythonAv.id, teacherId: teacherRows[1].id, scheduledAt: new Date(now.getTime() + 48 * 3600 * 1000), durationMinutes: 120, status: "scheduled", branchId: defaultBranch.id },
      { tenantId: tenant.id, courseId: pianMid.id, teacherId: teacherRows[2].id, scheduledAt: new Date(now.getTime() + 72 * 3600 * 1000), durationMinutes: 60, status: "scheduled", branchId: defaultBranch.id },
      { tenantId: tenant.id, courseId: engB2.id, teacherId: teacherRows[0].id, scheduledAt: new Date(now.getTime() - 24 * 3600 * 1000), durationMinutes: 90, status: "completed", branchId: defaultBranch.id },
      { tenantId: tenant.id, courseId: pythonAv.id, teacherId: teacherRows[1].id, scheduledAt: new Date(now.getTime() - 48 * 3600 * 1000), durationMinutes: 120, status: "completed", branchId: defaultBranch.id },
    ])
    .returning();

  console.log(`✅ ${lessonRows.length} lessons created`);
  console.log(`\n📌 Demo credentials:`);
  console.log(`   email: ${admin.email}`);
  console.log(`   password: ${DEMO_PASSWORD}`);
  console.log(`   tenant slug: ${tenant.slug}`);
  console.log(`   tenant id: ${tenant.id}`);
}

seed()
  .then(async () => {
    await closeDb();
    console.log("\n🎉 Seed complete.");
  })
  .catch(async (err) => {
    console.error("❌ Seed failed:", err);
    await closeDb();
    process.exit(1);
  });
