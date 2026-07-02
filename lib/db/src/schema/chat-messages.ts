import {
  pgTable,
  serial,
  bigint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Persisted chat messages exchanged between a worker and an employer for a
 * specific gig. Messages are stored here so both parties see the full history
 * when they reopen the chat modal, and fanned out via WebSocket so each
 * message appears on both screens instantly.
 *
 * `senderRole` is stored as the DB role string ("pekerja" | "perusahaan")
 * and mapped to the UI discriminator ("worker" | "company") on the client.
 */
export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  jobId: bigint("job_id", { mode: "number" }).notNull(),
  senderId: text("sender_id").notNull(),
  senderRole: text("sender_role").notNull(), // "pekerja" | "perusahaan"
  text: text("text").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(
  chatMessagesTable,
).omit({ id: true, sentAt: true });

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
