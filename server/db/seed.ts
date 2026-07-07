import "dotenv/config";
import { db, closeDb } from "./client";
import { tenants, users, students, teachers, courses, branches, leads } from "./schema";
import {
  parMembers,
  parSettings,
  parDepartments,
  parProjects,
  parBudgetCodes,
  parDoaMatrix,
} from "./schema/par";
import {
  boardProducts,
  boards,
  boardLists,
  tasks,
  boardTaskTemplates,
  boardTaskTemplateItems,
} from "./schema/taskboard";
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

  // NOTE: the `lessons` CRM table was removed from the schema during the CRM split;
  // the seed no longer creates lesson rows (courses above are enough for demo).
  void [engB2, pythonAv, pianMid];

  // UX-704: Seed realistic CRM leads spread across pipeline stages so the demo looks alive.
  const norm = (p: string) => p.replace(/\D/g, "").slice(-9);
  const leadRows = await db
    .insert(leads)
    .values([
      { tenantId: tenant.id, fullName: "Andrei Munteanu", phone: "+373 79 112 233", phoneNormalized: norm("79112233"), email: "andrei.m@gmail.com", interestCourse: "Engleză B2", stage: "new", source: "facebook_ad", valueCents: 28000, utmCampaign: "spring26-eng" },
      { tenantId: tenant.id, fullName: "Cristina Rusu", phone: "+373 68 445 566", phoneNormalized: norm("68445566"), email: "cristina.rusu@gmail.com", interestCourse: "Python avansat", stage: "new", source: "webform", valueCents: 42000 },
      { tenantId: tenant.id, fullName: "Mihai Ceban", phone: "+373 60 778 899", phoneNormalized: norm("60778899"), email: "mihai.ceban@mail.md", interestCourse: "Engleză B2", stage: "contacted", source: "google_ads", valueCents: 28000, utmCampaign: "search-eng" },
      { tenantId: tenant.id, fullName: "Elena Popescu", phone: "+373 79 334 455", phoneNormalized: norm("79334455"), email: "elena.p@gmail.com", interestCourse: "Pian — intermediar", stage: "contacted", source: "referral", valueCents: 60000 },
      { tenantId: tenant.id, fullName: "Victor Țurcanu", phone: "+373 69 221 100", phoneNormalized: norm("69221100"), email: "victor.t@gmail.com", interestCourse: "Python avansat", stage: "trial", source: "instagram", valueCents: 42000 },
      { tenantId: tenant.id, fullName: "Daniela Cojocaru", phone: "+373 78 556 677", phoneNormalized: norm("78556677"), email: "daniela.c@mail.md", interestCourse: "Engleză B2", stage: "trial", source: "facebook_ad", valueCents: 28000, utmCampaign: "spring26-eng" },
      { tenantId: tenant.id, fullName: "S.R.L. TechMinds", phone: "+373 22 887 766", phoneNormalized: norm("22887766"), email: "office@techminds.md", interestCourse: "Python avansat (corporate)", stage: "trial", source: "manual", valueCents: 210000, company: "S.R.L. TechMinds", dealName: "Training Python echipă TechMinds (5 pers.)" },
      { tenantId: tenant.id, fullName: "Ana Gríu", phone: "+373 60 998 877", phoneNormalized: norm("60998877"), email: "ana.griu@gmail.com", interestCourse: "Pian — intermediar", stage: "lost", source: "phone_in", valueCents: 60000, lostReason: "Preț prea mare" },
      { tenantId: tenant.id, fullName: "Sergiu Balan", phone: "+373 79 010 020", phoneNormalized: norm("79010020"), email: "sergiu.b@gmail.com", interestCourse: "Engleză B2", stage: "lost", source: "webform", valueCents: 28000, lostReason: "S-a înscris în altă parte" },
    ])
    .returning();
  console.log(`✅ ${leadRows.length} leads created`);

  // ── PAR-001: Seed NGO demo tenant for Payment Action Request module ──────────
  const PAR_SLUG = "demo-atic-ngo";
  const existingPar = await db.query.tenants.findFirst({ where: eq(tenants.slug, PAR_SLUG) });
  if (!existingPar) {
    const [parTenant] = await db
      .insert(tenants)
      // appKind "business" is required for /api/business/auth/login — PAR lives in the Business
      // Suite (/business/par/*). Without it the demo PAR admin is rejected with "no Business access".
      .values({ name: "ATIC — Digital Safeguard", slug: PAR_SLUG, plan: "growth", appKind: "business" })
      .returning();

    // 4 users covering all PAR roles
    const [parAdmin, parApprover, parFinance, parRequestor] = await db
      .insert(users)
      .values([
        { tenantId: parTenant.id, email: "admin@atic.demo.io", passwordHash: demoPasswordHash, name: "Irina Oriol", role: "admin" },
        { tenantId: parTenant.id, email: "approver@atic.demo.io", passwordHash: demoPasswordHash, name: "Ana Chirita", role: "teacher" },
        { tenantId: parTenant.id, email: "finance@atic.demo.io", passwordHash: demoPasswordHash, name: "Mihai Botnaru", role: "teacher" },
        { tenantId: parTenant.id, email: "requestor@atic.demo.io", passwordHash: demoPasswordHash, name: "Sirbu Cristina", role: "teacher" },
      ])
      .returning();

    // PAR role assignments
    await db.insert(parMembers).values([
      { tenantId: parTenant.id, userId: parAdmin.id, role: "par_admin" },
      { tenantId: parTenant.id, userId: parApprover.id, role: "approver", approvalLimitCents: 10000000 },
      { tenantId: parTenant.id, userId: parFinance.id, role: "finance" },
      { tenantId: parTenant.id, userId: parRequestor.id, role: "requestor" },
    ]);

    // PAR settings
    const [parSettingsRow] = await db
      .insert(parSettings)
      .values({
        tenantId: parTenant.id,
        microPurchaseThresholdCents: 500000, // 5,000 MDL
        defaultCurrency: "MDL",
        orgLegalName: "Asociația pentru Tehnologie și Internet din Moldova",
        requestNoPrefix: "PAR",
      })
      .returning();

    // Departments
    const [deptAtic] = await db
      .insert(parDepartments)
      .values([
        { tenantId: parTenant.id, name: "ATIC" },
        { tenantId: parTenant.id, name: "Finance" },
        { tenantId: parTenant.id, name: "Procurement" },
      ])
      .returning();

    // Projects
    await db.insert(parProjects).values([
      { tenantId: parTenant.id, name: "Digital Safeguard", donor: "USAID" },
      { tenantId: parTenant.id, name: "CyberSkills Moldova", donor: "EU Delegation" },
    ]);

    // Budget codes
    await db.insert(parBudgetCodes).values([
      { tenantId: parTenant.id, code: "M13", name: "Procurement — Monthly budget" },
      { tenantId: parTenant.id, code: "DS-2026-OPS", name: "Digital Safeguard Operations 2026" },
      { tenantId: parTenant.id, code: "DS-2026-PROG", name: "Digital Safeguard Program 2026" },
    ]);

    // Default DOA matrix (CORE §3):
    //   Band ≤ micro-purchase (5000 MDL) → 1 step: DOA Holder / Supervisor
    //   > micro-purchase, ≤ 100,000 MDL → 2 steps: DOA Holder + Executive Director
    //   > 100,000 MDL → 3 steps: DOA Holder + Finance Director + Executive Director
    await db.insert(parDoaMatrix).values([
      // Band 1: up to micro-purchase threshold
      { tenantId: parTenant.id, minAmountCents: 0, maxAmountCents: 500000, step: 1, approverRoleLabel: "DOA Holder / Supervisor", approverParRole: "approver" },
      // Band 2: above micro-purchase up to 100k
      { tenantId: parTenant.id, minAmountCents: 500001, maxAmountCents: 10000000, step: 1, approverRoleLabel: "DOA Holder / Supervisor", approverParRole: "approver" },
      { tenantId: parTenant.id, minAmountCents: 500001, maxAmountCents: 10000000, step: 2, approverRoleLabel: "Executive Director", approverUserId: parAdmin.id },
      // Band 3: above 100k
      { tenantId: parTenant.id, minAmountCents: 10000001, maxAmountCents: null, step: 1, approverRoleLabel: "DOA Holder / Supervisor", approverParRole: "approver" },
      { tenantId: parTenant.id, minAmountCents: 10000001, maxAmountCents: null, step: 2, approverRoleLabel: "Finance / Program Director", approverUserId: parFinance.id },
      { tenantId: parTenant.id, minAmountCents: 10000001, maxAmountCents: null, step: 3, approverRoleLabel: "Executive Director", approverUserId: parAdmin.id },
    ]);

    // ── TB-001: TaskBoard demo — produs + board + liste + taskuri + șablon ──────
    // Pe tenantul business (TaskBoard trăiește sub /business/board/*). Fără courseId:
    // cursurile seedate aparțin tenantului learn — un FK cross-tenant ar fi greșit.
    const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
    const inDays = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return fmtDate(d);
    };
    const [tbProduct] = await db
      .insert(boardProducts)
      .values({
        tenantId: parTenant.id,
        name: "Curs Cybersecurity — ediția toamnă",
        kind: "course",
        startDate: inDays(30),
        endDate: inDays(120),
        colorToken: "primary",
      })
      .returning();

    const [tbBoard] = await db
      .insert(boards)
      .values({
        tenantId: parTenant.id,
        productId: tbProduct.id,
        name: "Lansare Cybersecurity toamnă",
        description: "Planificarea lansării ediției de toamnă",
      })
      .returning();

    const [tbBacklog, tbInLucru, tbReview, tbGata] = await db
      .insert(boardLists)
      .values([
        { tenantId: parTenant.id, boardId: tbBoard.id, name: "Backlog", position: 1024 },
        { tenantId: parTenant.id, boardId: tbBoard.id, name: "În lucru", position: 2048 },
        { tenantId: parTenant.id, boardId: tbBoard.id, name: "Review", position: 3072 },
        { tenantId: parTenant.id, boardId: tbBoard.id, name: "Gata", position: 4096, isDoneList: true },
      ])
      .returning();

    await db.insert(tasks).values([
      // Plan-first: 2 taskuri fără listă (backlog de planificare), din care 1 cu termen (Calendar demo)
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, title: "Definește oferta early-bird", position: 1024 },
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, title: "Confirmă trainerii invitați", dueDate: inDays(10), position: 2048 },
      // Distribuite pe coloane
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, listId: tbBacklog.id, title: "Landing page ediția toamnă", assigneeRole: "marketing", dueDate: inDays(14), position: 1024 },
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, listId: tbBacklog.id, title: "Setează campania Meta Ads", assigneeRole: "marketing", dueDate: inDays(16), priority: "high", position: 2048 },
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, listId: tbInLucru.id, title: "Programa detaliată pe module", assigneeRole: "content", status: "in_progress", assigneeUserId: parRequestor.id, dueDate: inDays(7), position: 1024 },
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, listId: tbInLucru.id, title: "Contract sală + echipamente", assigneeRole: "ops", status: "in_progress", dueDate: inDays(21), position: 2048 },
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, listId: tbReview.id, title: "Email de anunț către absolvenți", assigneeRole: "marketing", status: "in_progress", assigneeUserId: parAdmin.id, dueDate: inDays(5), position: 1024 },
      { tenantId: parTenant.id, boardId: tbBoard.id, productId: tbProduct.id, listId: tbGata.id, title: "Buget aprobat pentru ediție", status: "done", completedAt: new Date(), position: 1024 },
    ]);

    const [tbTemplate] = await db
      .insert(boardTaskTemplates)
      .values({
        tenantId: parTenant.id,
        name: "Lansare curs standard",
        description: "Setul standard de taskuri pentru lansarea unei ediții de curs",
        productKind: "course",
      })
      .returning();

    await db.insert(boardTaskTemplateItems).values([
      { tenantId: parTenant.id, templateId: tbTemplate.id, title: "Anunț public + landing page", assigneeRole: "marketing", offsetAnchor: "start", offsetDays: -30, defaultListName: "Backlog", position: 1024 },
      { tenantId: parTenant.id, templateId: tbTemplate.id, title: "Campanie ads pornită", assigneeRole: "marketing", offsetAnchor: "start", offsetDays: -14, defaultListName: "Backlog", defaultPriority: "high", position: 2048 },
      { tenantId: parTenant.id, templateId: tbTemplate.id, title: "Confirmări participanți + facturi", assigneeRole: "sales", offsetAnchor: "start", offsetDays: -7, defaultListName: "Backlog", position: 3072 },
      { tenantId: parTenant.id, templateId: tbTemplate.id, title: "Kit de bun venit trimis", assigneeRole: "ops", offsetAnchor: "start", offsetDays: -1, defaultListName: "Backlog", position: 4096 },
      { tenantId: parTenant.id, templateId: tbTemplate.id, title: "Feedback inițial colectat", assigneeRole: "content", offsetAnchor: "start", offsetDays: 7, defaultListName: "Backlog", position: 5120 },
    ]);
    void tbReview;
    console.log(`✅ TaskBoard demo: 1 produs, 1 board, 4 liste, 8 taskuri, 1 șablon (5 iteme)`);

    console.log(`✅ PAR demo tenant created: ATIC — Digital Safeguard`);
    console.log(`   PAR admin: ${parAdmin.email}`);
    console.log(`   PAR approver: ${parApprover.email}`);
    console.log(`   PAR finance: ${parFinance.email}`);
    console.log(`   PAR requestor: ${parRequestor.email}`);
    console.log(`   Micro-purchase threshold: ${parSettingsRow.microPurchaseThresholdCents / 100} MDL`);
    console.log(`   DOA matrix: ${deptAtic ? 6 : 0} rules seeded`);
  } else {
    console.log(`⚠️  PAR demo tenant already exists (${existingPar.id}). Skipping.`);
  }

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
