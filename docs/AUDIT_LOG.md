# Audit Log System

The audit log system records every create, update, and delete operation across all entities in ProjectERP.

## Database Schema

The `audit_log` table stores:
- `id`: Unique identifier
- `organization_id`: Organization the change belongs to
- `actor_id`: User who made the change (nullable for system changes)
- `action`: Type of operation
- `entity_type`: Type of entity modified
- `entity_id`: ID of the entity
- `entity_label`: Human-readable label (e.g., project name)
- `diff_json`: JSON containing the changes
- `created_at`: Timestamp of the change (with timezone)

## Using Audit Logging in API Routes

The existing `writeAudit` function in `apps/api/src/lib/audit.ts` is already available and ready to use.

Import it in your route files:

```typescript
import { writeAudit } from "../lib/audit.js";
```

### Logging a Create Operation

```typescript
app.post("/projects", async (c) => {
  const actor = c.get("auth") as AuthUser;
  const body = await c.req.json();
  const validated = projectCreate.parse(body);
  
  const [proj] = await db
    .insert(project)
    .values({
      ...validated,
      organizationId: actor.organizationId,
    })
    .returning();

  // Log the creation
  await writeAudit(actor, "create", "project", proj.id, { created: proj });

  return c.json({ project: proj });
});
```

### Logging an Update Operation

```typescript
app.patch("/projects/:id", async (c) => {
  const actor = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = projectPatch.parse(body);

  // Get current state BEFORE updating
  const [before] = await db
    .select()
    .from(project)
    .where(eq(project.id, id));

  if (!before) {
    return c.json({ error: "Not found" }, 404);
  }

  const [after] = await db
    .update(project)
    .set({ ...validated, version: before.version + 1 })
    .where(eq(project.id, id))
    .returning();

  // Log with before/after
  await writeAudit(actor, "update", "project", id, { before, after });

  return c.json({ project: after });
});
```

### Logging a Delete Operation

```typescript
app.delete("/projects/:id", async (c) => {
  const actor = c.get("auth") as AuthUser;
  const id = c.req.param("id");

  // Get current state BEFORE deleting
  const [proj] = await db
    .select()
    .from(project)
    .where(eq(project.id, id));

  if (!proj) {
    return c.json({ error: "Not found" }, 404);
  }

  await db.delete(project).where(eq(project.id, id));

  // Log the deletion
  await writeAudit(actor, "delete", "project", id, { deleted: proj });

  return c.json({ success: true });
});
```

## Entity Types

Standard entity types to use:
- `client` - Customers
- `supplier` - Suppliers
- `project` - Projects
- `milestone` - Milestones
- `task` - Tasks
- `todo` - Todos
- `time_entry` - Time Entries
- `procurement` - Purchasing
- `procurement_line` - Purchasing Lines
- `asset` - Machines
- `service_log` - Service History
- `project_note` - A4 Notes
- `organization` - Organization Settings
- `user` - Users
- `organization_profile` - Organization Profile

## Frontend Usage

### AuditHistory Component

Show history for a specific entity on detail pages:

```tsx
import { AuditHistory } from "../components/AuditHistory";

// In your detail page component:
<AuditHistory entityType="project" entityId={projectId} />
```

The component displays:
- Timeline of all changes
- User who made each change
- Timestamps in local timezone
- Field-level before/after values
- Mobile-friendly layout

### Org-Wide History Page

Available at `/workspace/history` - shows all audit entries with filters for:
- Entity type (customers, projects, todos, etc.)
- Action type (create/update/delete)
- Date range
- Pagination (50 per page)

## API Endpoints

### GET /api/audit/history

Fetch organization-wide audit history with filters.

Query parameters:
- `entityType`: Filter by entity type
- `entityId`: Filter by specific entity ID
- `userId`: Filter by user who made changes
- `action`: Filter by action type
- `startDate`: Filter from date (ISO format)
- `endDate`: Filter to date (ISO format)
- `limit`: Max results (default 100)
- `offset`: Pagination offset

Example:
```
GET /api/audit/history?entityType=project&action=update&limit=50&offset=0
```

### GET /api/audit/entity/:entityType/:entityId

Fetch complete audit history for a specific entity.

Example:
```
GET /api/audit/entity/project/abc-123-def
```

Returns all changes for that specific project.

## Migration

Run the migration to add indexes and entity_label column:

```bash
cd packages/db
npm run db:migrate
```

Migration file: `0017_audit_log.sql`

## Best Practices

1. **Log at the API level**: Always log in your API routes, not database triggers
2. **Capture before state**: For updates/deletes, fetch current state first
3. **Use entity labels**: Provide human-readable labels (names, titles) for better UX
4. **Don't log sensitive data**: Skip passwords, tokens, secrets
5. **Be consistent**: Use the standard entity type names listed above
6. **Log system actions**: Pass `null` for actorId in automated/system changes

## Testing

After implementing audit logging in a route:

1. Create/update/delete an entity
2. Visit `/workspace/history` to see the changes
3. Or view entity-specific history using the `<AuditHistory />` component
4. Verify timestamps display in your local timezone
5. Check field-level changes show correct before/after values
