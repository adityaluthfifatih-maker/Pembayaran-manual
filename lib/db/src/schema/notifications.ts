import { pgTable, serial, bigint, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Simple polling-based notifications (no realtime transport). Used as a
 * reliable fallback/replacement for the WS `application_new` push: every
 * event that should alert a user also gets a row here, so the dashboard bell
 * always has something to fetch even if the WebSocket connection dropped or
 * never registered under the right user.
 */
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  /** The user who should see this notification (e.g. the employer). */
  userId: text("user_id").notNull(),
  /** Human-readable message, e.g. "Budi baru saja melamar lowongan Barista". */
  message: text("message").notNull(),
  /** "application" | future kinds — lets the client route a click. */
  type: text("type").notNull().default("application"),
  /** Optional related job id, for deep-linking the dashboard. */
  jobId: bigint("job_id", { mode: "number" }),
  /** Optional related application row id. */
  applicationId: bigint("application_id", { mode: "number" }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(
  notificationsTable,
).omit({ id: true, isRead: true, createdAt: true });

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type NotificationRow = typeof notificationsTable.$inferSelect;
