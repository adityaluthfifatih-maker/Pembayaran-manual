import {
  pgTable,
  serial,
  bigint,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Persisted chat messages exchanged between a specific worker and the employer
 * for a given gig.  The combination (job_id, worker_id) identifies one
 * conversation — a gig with multiple applicants has a separate thread per
 * worker.  Messages are returned to both parties on history load and fanned out
 * via WebSocket only to the two participants so no other connected client can
 * observe them.
 *
 * `senderRole` is stored as the DB role string ("pekerja" | "perusahaan")
 * and mapped to the UI discriminator ("worker" | "company") on the client.
 *
 * Attachment fields (optional):
 *   attachment_url  — server-relative path to the uploaded file, e.g. /api/uploads/chat/abc.jpg
 *   attachment_type — MIME type string, e.g. "image/jpeg" or "application/pdf"
 *   file_size       — byte size of the original file
 */
export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  jobId: bigint("job_id", { mode: "number" }).notNull(),
  /** The worker side of the conversation — scopes messages to one thread. */
  workerId: text("worker_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderRole: text("sender_role").notNull(), // "pekerja" | "perusahaan"
  text: text("text").notNull().default(""),
  /** Optional — path to uploaded attachment served via /api/uploads/chat/:filename */
  attachmentUrl: text("attachment_url"),
  /** MIME type of the attachment, e.g. "image/jpeg" | "application/pdf" */
  attachmentType: text("attachment_type"),
  /** File size in bytes */
  fileSize: integer("file_size"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(
  chatMessagesTable,
).omit({ id: true, sentAt: true });

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
