import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Company work sites. QR attendance can be tied to one active branch so
 * attendance is attributed to the correct work location.
 */
export const companyBranchesTable = pgTable(
  "company_branches",
  {
    id: serial("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radiusMeters: integer("radius_meters").notNull().default(150),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("company_branches_company_name_unique").on(
      table.companyId,
      table.name,
    ),
  ],
);

export const insertCompanyBranchSchema = createInsertSchema(
  companyBranchesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCompanyBranch = z.infer<typeof insertCompanyBranchSchema>;
export type CompanyBranch = typeof companyBranchesTable.$inferSelect;