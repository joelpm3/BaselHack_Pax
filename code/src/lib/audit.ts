import "server-only";
import { db, schema } from "@/lib/db";
import type { ActorType } from "@/lib/domain/taxonomy";

export function audit(entry: {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
}): void {
  db.insert(schema.auditLog).values(entry).run();
}
