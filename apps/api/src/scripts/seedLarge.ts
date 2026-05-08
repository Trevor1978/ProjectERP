import { randomUUID } from "node:crypto";
import {
  db,
  sql,
  organization,
  user,
  client,
  project,
  projectMember,
  milestone,
  task,
  taskDependency,
  todo,
  timeEntry,
  procurementRequest,
  procurementRequestLine,
  notification,
  documentLink,
  projectBudget,
  handover,
} from "@project-erp/db";
import { eq } from "drizzle-orm";
import argon2 from "argon2";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

async function main() {
  const clientsPerOrg = envInt("SEED_CLIENTS", 8);
  const projectsPerOrg = envInt("SEED_PROJECTS", 20);
  const milestonesPerProject = envInt("SEED_MILESTONES", 4);
  const tasksPerMilestone = envInt("SEED_TASKS", 8);
  const todosPerTask = envInt("SEED_TODOS", 3);
  const timeEntriesPerTask = envInt("SEED_TIME_ENTRIES", 2);
  const rfqPerProject = envInt("SEED_RFQ", 2);
  const docsPerProject = envInt("SEED_DOCS", 3);
  const extraUsers = envInt("SEED_USERS", 6);

  let orgRow = (await db.select().from(organization).limit(1))[0];
  if (!orgRow) {
    const orgId = randomUUID();
    orgRow = {
      id: orgId,
      name: "Seed Org",
      slug: `seed-org-${Date.now()}`,
      createdAt: new Date(),
    };
    await db.insert(organization).values(orgRow);
  }

  let admin = (
    await db
      .select()
      .from(user)
      .where(eq(user.organizationId, orgRow.id))
      .limit(1)
  )[0];
  if (!admin) {
    const id = randomUUID();
    admin = {
      id,
      organizationId: orgRow.id,
      email: "seed-admin@test.local",
      name: "Seed Admin",
      passwordHash: await argon2.hash("password12"),
      globalRole: "org_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(user).values(admin);
  }
  if (!admin) {
    throw new Error("Failed to resolve or create admin user");
  }

  const users: typeof user.$inferInsert[] = [];
  for (let i = 0; i < extraUsers; i++) {
    users.push({
      id: randomUUID(),
      organizationId: orgRow.id,
      email: `seed-user-${Date.now()}-${i}@test.local`,
      name: `Seed User ${i + 1}`,
      passwordHash: await argon2.hash("password12"),
      globalRole: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (users.length > 0) {
    await db.insert(user).values(users);
  }
  const orgUsers = [
    admin,
    ...users,
    ...(await db.select().from(user).where(eq(user.organizationId, orgRow.id))),
  ];

  const clientRows: (typeof client.$inferInsert)[] = [];
  for (let i = 0; i < clientsPerOrg; i++) {
    clientRows.push({
      id: randomUUID(),
      organizationId: orgRow.id,
      name: `Client ${i + 1}`,
      code: `C${String(i + 1).padStart(3, "0")}`,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await db.insert(client).values(clientRows);

  const statuses = ["draft", "active", "on_hold", "closed"] as const;
  const projectRows: (typeof project.$inferInsert)[] = [];
  for (let i = 0; i < projectsPerOrg; i++) {
    const c = pick(clientRows);
    projectRows.push({
      id: randomUUID(),
      organizationId: orgRow.id,
      clientId: c.id!,
      name: `Project ${i + 1}`,
      code: `P${String(i + 1).padStart(4, "0")}`,
      status: pick([...statuses]),
      startAt: new Date(Date.now() - i * 86_400_000),
      endAt: new Date(Date.now() + (30 + i) * 86_400_000),
      version: 0,
      createdById: admin.id!,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await db.insert(project).values(projectRows);

  const memberships: (typeof projectMember.$inferInsert)[] = [];
  for (const p of projectRows) {
    const sampled = orgUsers.slice(0, Math.min(4, orgUsers.length));
    sampled.forEach((u, idx) => {
      memberships.push({
        id: randomUUID(),
        projectId: p.id!,
        userId: u.id!,
        role: idx === 0 ? "admin" : idx === 1 ? "pm" : "member",
        createdAt: new Date(),
      });
    });
  }
  if (memberships.length > 0) {
    await db.insert(projectMember).values(memberships).onConflictDoNothing();
  }

  const milestoneRows: (typeof milestone.$inferInsert)[] = [];
  for (const p of projectRows) {
    for (let i = 0; i < milestonesPerProject; i++) {
      milestoneRows.push({
        id: randomUUID(),
        projectId: p.id!,
        name: `M${i + 1} - ${p.name}`,
        startAt: new Date(Date.now() + i * 7 * 86_400_000),
        endAt: new Date(Date.now() + (i + 1) * 7 * 86_400_000),
        orderIndex: i,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  await db.insert(milestone).values(milestoneRows);

  const taskRows: (typeof task.$inferInsert)[] = [];
  for (const m of milestoneRows) {
    for (let i = 0; i < tasksPerMilestone; i++) {
      const assignee = pick(orgUsers);
      taskRows.push({
        id: randomUUID(),
        projectId: m.projectId!,
        milestoneId: m.id!,
        title: `${m.name} / Task ${i + 1}`,
        description: "Seeded task for load testing UI",
        startAt: new Date(Date.now() + i * 86_400_000),
        endAt: new Date(Date.now() + (i + 2) * 86_400_000),
        estHours: 4 + (i % 5),
        actualHours: (i % 3) * 2,
        percentComplete: (i % 5) * 20,
        useDerivedPercent: true,
        orderIndex: i,
        assigneeId: assignee.id!,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  await db.insert(task).values(taskRows);

  const deps: (typeof taskDependency.$inferInsert)[] = [];
  for (let i = 1; i < taskRows.length; i++) {
    if (Math.random() < 0.35) {
      deps.push({
        id: randomUUID(),
        taskId: taskRows[i]!.id!,
        predecessorTaskId: taskRows[i - 1]!.id!,
        type: "FS",
      });
    }
  }
  if (deps.length > 0) {
    await db.insert(taskDependency).values(deps).onConflictDoNothing();
  }

  const todoRows: (typeof todo.$inferInsert)[] = [];
  const todoStatuses = ["backlog", "in_progress", "blocked", "done"] as const;
  for (const t of taskRows) {
    for (let i = 0; i < todosPerTask; i++) {
      todoRows.push({
        id: randomUUID(),
        taskId: t.id!,
        title: `${t.title} - Todo ${i + 1}`,
        status: pick([...todoStatuses]),
        priority: "normal",
        orderIndex: i,
        assigneeId: pick(orgUsers).id!,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  await db.insert(todo).values(todoRows);

  const teRows: (typeof timeEntry.$inferInsert)[] = [];
  for (const t of taskRows) {
    for (let i = 0; i < timeEntriesPerTask; i++) {
      teRows.push({
        id: randomUUID(),
        userId: pick(orgUsers).id!,
        taskId: t.id!,
        durationMinutes: 30 + (i % 5) * 15,
        note: "Seeded time entry",
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  await db.insert(timeEntry).values(teRows);

  const rfqRows: (typeof procurementRequest.$inferInsert)[] = [];
  for (const p of projectRows) {
    for (let i = 0; i < rfqPerProject; i++) {
      rfqRows.push({
        id: randomUUID(),
        organizationId: orgRow.id,
        supplierId: null,
        title: `${p.name} RFQ ${i + 1}`,
        status: "draft",
        fullyReceivedOverride: false,
        sapPoNumber: null,
        version: 0,
        createdById: admin.id!,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  await db.insert(procurementRequest).values(rfqRows);

  const rfqLines: (typeof procurementRequestLine.$inferInsert)[] = [];
  for (const r of rfqRows) {
    for (let i = 0; i < 3; i++) {
      rfqLines.push({
        id: randomUUID(),
        procurementId: r.id!,
        projectId: pick(projectRows).id!,
        partNumber: `PN-${String(i + 1).padStart(4, "0")}`,
        description: `Item ${i + 1}`,
        quantity: String(1 + i),
        unit: "ea",
        estUnitPrice: 100 + i * 25,
        orderIndex: i,
        receivedQty: 0,
        version: 0,
      });
    }
  }
  await db.insert(procurementRequestLine).values(rfqLines);

  const budgets: (typeof projectBudget.$inferInsert)[] = projectRows.map((p) => ({
    id: randomUUID(),
    projectId: p.id!,
    labour: 10_000,
    material: 7_500,
    other: 2_000,
    currency: "USD",
    version: 0,
    updatedAt: new Date(),
  }));
  await db.insert(projectBudget).values(budgets).onConflictDoNothing();

  const handovers: (typeof handover.$inferInsert)[] = projectRows.map((p) => ({
    id: randomUUID(),
    projectId: p.id!,
    asBuilt: "As-built docs seeded",
    spares: "Standard spares kit",
    supportNotes: "Support contract included",
    version: 0,
    updatedAt: new Date(),
  }));
  await db.insert(handover).values(handovers).onConflictDoNothing();

  const docs: (typeof documentLink.$inferInsert)[] = [];
  for (const p of projectRows) {
    for (let i = 0; i < docsPerProject; i++) {
      docs.push({
        id: randomUUID(),
        projectId: p.id!,
        kind: i % 2 ? "drawing" : "other",
        label: `Doc ${i + 1} for ${p.name}`,
        url: `https://example.com/docs/${p.code}-${i + 1}.pdf`,
        version: 0,
        createdById: admin.id!,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  await db.insert(documentLink).values(docs);

  const notifs: (typeof notification.$inferInsert)[] = [];
  for (const u of orgUsers.slice(0, Math.min(10, orgUsers.length))) {
    for (let i = 0; i < 10; i++) {
      notifs.push({
        id: randomUUID(),
        userId: u.id!,
        kind: "comment",
        title: `Seed notification ${i + 1}`,
        body: "This is seeded notification data",
        dataJson: "{}",
        createdAt: new Date(),
      });
    }
  }
  await db.insert(notification).values(notifs);

  console.log("Large seed complete:");
  console.log(`- org: ${orgRow.name} (${orgRow.id})`);
  console.log(`- clients created: ${clientRows.length}`);
  console.log(`- projects created: ${projectRows.length}`);
  console.log(`- milestones created: ${milestoneRows.length}`);
  console.log(`- tasks created: ${taskRows.length}`);
  console.log(`- dependencies created: ${deps.length}`);
  console.log(`- todos created: ${todoRows.length}`);
  console.log(`- time entries created: ${teRows.length}`);
  console.log(`- RFQs created: ${rfqRows.length}`);
  console.log(`- RFQ lines created: ${rfqLines.length}`);
  console.log(`- docs created: ${docs.length}`);
  console.log(`- notifications created: ${notifs.length}`);

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error(err);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
