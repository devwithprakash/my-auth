import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userTable = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  first_name: varchar("first_name", { length: 25 }),
  last_name: varchar("last_name", { length: 25 }),

  profileImageURL: text("profile_image_url"),

  email: varchar("email", { length: 322 }).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),

  password: varchar("password", { length: 66 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

export const clientTable = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: varchar("name", { length: 100 }),
  email: varchar("email", { length: 322 }).notNull(),

  clientId: varchar("client_id", { length: 64 }).notNull().unique(),

  clientSecret: varchar("client_secret", { length: 255 }).notNull(),

  appUrl: varchar("app_url", { length: 255 }).notNull(),

  redirectUri: varchar("redirect_uri", { length: 255 }).notNull(),

  grantTypes: varchar("grant_types", { length: 100 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

export const authTable = pgTable("auth_codes", {
  id: uuid("id").primaryKey().defaultRandom(),

  code: varchar("code", { length: 128 }).notNull().unique(),

  clientId: varchar("client_id", { length: 64 })
    .notNull()
    .references(() => clientTable.clientId, { onDelete: "cascade" }),

  userId: uuid("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
    
  redirectUri: varchar("redirect_uri", { length: 255 }).notNull(),

  expiresAt: timestamp("expires_at")
    .notNull()
    .$defaultFn(() => new Date(Date.now() + 60 * 1000)),

  used: boolean("used").default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
