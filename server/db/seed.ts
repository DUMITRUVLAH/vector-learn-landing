import "dotenv/config";
import { db, closeDb } from "./client";
import { tenants, users, students, teachers, courses, lessons, branches, leads } from "./schema";
import { finPayments } from "./schema/finCash";
import { finInvoices } from "./schema/finInvoices";
import { finParties } from "./schema/finParties";
import {
  itparkEngagements,
  itparkMonthly,
  itparkSettings,
} from "./schema/itpark";
import {
  parMembers,
  parSettings,
  parDepartments,
  parProjects,
  parBudgetCodes,
  parDoaMatrix,
} from "./schema/par";
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
      .values({ name: "ATIC — Digital Safeguard", slug: PAR_SLUG, plan: "growth" })
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

  // ── SPLIT-001: Seed Business Suite demo tenant ────────────────────────────
  const BUSINESS_SLUG = "demo-business-suite";
  const existingBusiness = await db.query.tenants.findFirst({ where: eq(tenants.slug, BUSINESS_SLUG) });
  if (!existingBusiness) {
    const [businessTenant] = await db
      .insert(tenants)
      .values({
        name: "Demo Business Suite",
        slug: BUSINESS_SLUG,
        plan: "growth",
        appKind: "business",
      })
      .returning();

    const [businessAdmin] = await db
      .insert(users)
      .values({
        tenantId: businessTenant.id,
        email: "admin@demo.business.io",
        passwordHash: demoPasswordHash,
        name: "Business Admin",
        role: "admin",
      })
      .returning();

    // ── FinDesk demo data so Business screens aren't empty on a fresh DB ──────
    // (Previously the seed created only the tenant + admin; every FinDesk/ITPark
    //  screen showed []. This populates parties → invoices → payments → an ITPark
    //  engagement with monthly compliance rows the dashboard reads.)
    const bt = businessTenant.id;

    const seededParties = await db
      .insert(finParties)
      .values([
        { tenantId: bt, kind: "client", name: "S.R.L. TechWave", country: "MD", idno: "1009600012345", vatCode: "0301234", email: "office@techwave.md", city: "Chișinău" },
        { tenantId: bt, kind: "client", name: "Î.I. Andrei Codru", country: "MD", idno: "1014600054321", email: "andrei@codru.md", city: "Bălți" },
        { tenantId: bt, kind: "supplier", name: "Orange Moldova S.A.", country: "MD", idno: "1002600045678", vatCode: "0204567", email: "facturi@orange.md", city: "Chișinău" },
        { tenantId: bt, kind: "supplier", name: "Premier Energy S.R.L.", country: "MD", idno: "1003600098765", email: "billing@premierenergy.md", city: "Chișinău" },
        { tenantId: bt, kind: "both", name: "S.R.L. NordContab", country: "MD", idno: "1011600011223", email: "contact@nordcontab.md", city: "Soroca" },
        { tenantId: bt, kind: "client", name: "ICS Global Soft S.R.L.", country: "MD", idno: "1018600033445", vatCode: "0309988", email: "ap@globalsoft.md", city: "Chișinău" },
      ])
      .returning();

    const year = new Date().getFullYear();
    const clients = seededParties.filter((p) => p.kind === "client");
    const seededInvoices = await db
      .insert(finInvoices)
      .values([
        { tenantId: bt, partyId: clients[0].id, series: "FIN", number: 1, invoiceNumber: `FIN-${year}-0001`, status: "paid", currency: "MDL", issuedAt: new Date(`${year}-01-15`), totalCents: 4800000, vatTotalCents: 800000 },
        { tenantId: bt, partyId: clients[0].id, series: "FIN", number: 2, invoiceNumber: `FIN-${year}-0002`, status: "issued", currency: "MDL", issuedAt: new Date(`${year}-02-12`), totalCents: 3600000, vatTotalCents: 600000 },
        { tenantId: bt, partyId: clients[1].id, series: "FIN", number: 3, invoiceNumber: `FIN-${year}-0003`, status: "overdue", currency: "MDL", issuedAt: new Date(`${year}-02-20`), totalCents: 1500000, vatTotalCents: 250000 },
        { tenantId: bt, partyId: clients[2].id, series: "FIN", number: 4, invoiceNumber: `FIN-${year}-0004`, status: "paid", currency: "MDL", issuedAt: new Date(`${year}-03-03`), totalCents: 9000000, vatTotalCents: 1500000 },
        { tenantId: bt, partyId: clients[1].id, series: "FIN", number: 5, invoiceNumber: `FIN-${year}-0005`, status: "draft", currency: "MDL", issuedAt: new Date(`${year}-03-18`), totalCents: 2400000, vatTotalCents: 400000 },
      ])
      .returning();

    await db.insert(finPayments).values([
      { tenantId: bt, partyId: clients[0].id, receivedDate: `${year}-01-20`, amountCents: 4800000, currency: "MDL", accountLabel: "MAIB MDL", allocatedCents: 4800000, notes: `Achitare ${seededInvoices[0].invoiceNumber}` },
      { tenantId: bt, partyId: clients[2].id, receivedDate: `${year}-03-08`, amountCents: 9000000, currency: "MDL", accountLabel: "MAIB MDL", allocatedCents: 9000000, notes: `Achitare ${seededInvoices[3].invoiceNumber}` },
      { tenantId: bt, partyId: clients[1].id, receivedDate: `${year}-03-22`, amountCents: 500000, currency: "MDL", accountLabel: "Victoriabank MDL", allocatedCents: 0, notes: "Avans parțial — nealocat" },
    ]);

    // ITPark: settings + one resident engagement with monthly compliance share.
    await db.insert(itparkSettings).values({
      tenantId: bt,
      eligibilityThresholdPct: "70.00",
      toleranceMonths: 2,
      defaultCurrency: "MDL",
    });

    const [engagement] = await db
      .insert(itparkEngagements)
      .values({
        tenantId: bt,
        residentName: "ICS Global Soft S.R.L.",
        idno: "1018600033445",
        vatPayer: true,
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
        reportingYear: year,
        status: "in_progress",
        subcontractorCostsCents: 0,
        adjustedRevenueCents: 120_000_000,
      })
      .returning();

    // Three months of cumulative eligible share, trending above the 70% threshold.
    await db.insert(itparkMonthly).values([
      { tenantId: bt, engagementId: engagement.id, month: 1, eligibleCents: 7_000_000, totalCents: 10_000_000, cumulativeEligibleCents: 7_000_000, cumulativeTotalCents: 10_000_000, monthlySharePct: "70.00" },
      { tenantId: bt, engagementId: engagement.id, month: 2, eligibleCents: 8_500_000, totalCents: 11_000_000, cumulativeEligibleCents: 15_500_000, cumulativeTotalCents: 21_000_000, monthlySharePct: "73.81" },
      { tenantId: bt, engagementId: engagement.id, month: 3, eligibleCents: 9_000_000, totalCents: 12_000_000, cumulativeEligibleCents: 24_500_000, cumulativeTotalCents: 33_000_000, monthlySharePct: "74.24" },
    ]);

    console.log(`✅ Business Suite demo tenant created: ${businessTenant.name}`);
    console.log(`   Business admin: ${businessAdmin.email}`);
    console.log(`   FinDesk demo: ${seededParties.length} parties, ${seededInvoices.length} invoices, 3 payments, 1 ITPark engagement`);
  } else {
    console.log(`⚠️  Business Suite demo tenant already exists (${existingBusiness.id}). Skipping.`);
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
