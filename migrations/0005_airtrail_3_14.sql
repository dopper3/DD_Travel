-- D1 port of the upstream AirTrail Postgres migrations between v3.12.0 and
-- v3.14.x:
--   20260809120000_add_rbac
--   20260903120000_add_api_credentials
--   20261029181527_add_calendar_feed
--   20261102120000_public_share_flight_selection
--
-- SQLite differences from the Postgres originals:
--   * timestamps are ISO-8601 TEXT, booleans are INTEGER 0/1
--   * TEXT[] columns (scopes) are JSON array TEXT
--   * the CHECK constraints upstream adds to "user" are omitted, because
--     SQLite cannot add constraints to an existing table and rebuilding
--     "user" would risk cascading deletes; the app enforces them.

-- ---------------------------------------------------------------- RBAC ----
CREATE TABLE "access_role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX "access_role_name_ci_key" ON "access_role" (LOWER("name"));

CREATE TABLE "access_role_permission" (
    "role_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    PRIMARY KEY ("role_id", "permission"),
    CONSTRAINT "access_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "access_role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "authorization_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "default_role_id" TEXT NOT NULL,
    "oauth_role_mapping_mode" TEXT NOT NULL DEFAULT 'off',
    CONSTRAINT "authorization_settings_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "authorization_settings_oauth_role_mapping_mode_check" CHECK ("oauth_role_mapping_mode" IN ('off', 'on_create', 'on_login')),
    CONSTRAINT "authorization_settings_default_role_id_key" UNIQUE ("default_role_id"),
    CONSTRAINT "authorization_settings_default_role_id_fkey" FOREIGN KEY ("default_role_id") REFERENCES "access_role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "oauth_role_mapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "priority" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "claim_source" TEXT NOT NULL,
    "claim_path" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "claim_value" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    CONSTRAINT "oauth_role_mapping_claim_source_check" CHECK ("claim_source" IN ('userinfo', 'id_token')),
    CONSTRAINT "oauth_role_mapping_operator_check" CHECK ("operator" IN ('equals', 'contains')),
    CONSTRAINT "oauth_role_mapping_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "access_role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "oauth_role_mapping_priority_idx" ON "oauth_role_mapping"("priority");

INSERT INTO "access_role" ("id", "name", "description") VALUES
  ('role-user', 'User', 'Manage personal flights and account data.'),
  ('role-administrator', 'Administrator', 'Manage users, flights, reference data, and instance settings.');

INSERT INTO "access_role_permission" ("role_id", "permission") VALUES
  ('role-user', 'flight.read.own'),
  ('role-user', 'flight.create.own'),
  ('role-user', 'flight.update.own'),
  ('role-user', 'flight.delete.own'),
  ('role-user', 'flight.import.own'),
  ('role-user', 'flight.export.own'),
  ('role-user', 'flight.passengers.manage.own'),
  ('role-user', 'flight.share.own'),
  ('role-user', 'users.directory.read'),
  ('role-administrator', 'flight.read.any'),
  ('role-administrator', 'flight.create.any'),
  ('role-administrator', 'flight.update.any'),
  ('role-administrator', 'flight.delete.any'),
  ('role-administrator', 'flight.import.any'),
  ('role-administrator', 'flight.export.any'),
  ('role-administrator', 'flight.passengers.manage.any'),
  ('role-administrator', 'flight.share.own'),
  ('role-administrator', 'users.directory.read'),
  ('role-administrator', 'users.create'),
  ('role-administrator', 'users.update'),
  ('role-administrator', 'users.delete'),
  ('role-administrator', 'users.roles.assign'),
  ('role-administrator', 'data.airports.manage'),
  ('role-administrator', 'data.aircraft.manage'),
  ('role-administrator', 'data.airlines.manage'),
  ('role-administrator', 'custom_fields.manage'),
  ('role-administrator', 'instance.oauth.manage'),
  ('role-administrator', 'instance.integrations.manage'),
  ('role-administrator', 'instance.map.manage'),
  ('role-administrator', 'instance.release.check');

ALTER TABLE "user" ADD COLUMN "role_id" TEXT REFERENCES "access_role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user" ADD COLUMN "is_owner" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN "role_assignment_source" TEXT NOT NULL DEFAULT 'local';

-- Very old installs could create more than one legacy owner. Preserve one
-- deterministic protected owner and migrate the remainder to Administrator.
UPDATE "user" SET "role_id" = 'role-administrator' WHERE "role" = 'owner';
UPDATE "user"
SET "is_owner" = 1, "role_id" = NULL
WHERE "id" = (
  SELECT "id" FROM "user" WHERE "role" = 'owner' ORDER BY "id" LIMIT 1
);
UPDATE "user" SET "role_id" = 'role-administrator' WHERE "role" = 'admin';
UPDATE "user" SET "role_id" = 'role-user' WHERE "role" = 'user';

CREATE UNIQUE INDEX "user_single_owner_key" ON "user" ("is_owner") WHERE "is_owner" = 1;

ALTER TABLE "user" DROP COLUMN "role";

INSERT INTO "authorization_settings" ("id", "default_role_id")
VALUES (1, 'role-user');

-- ----------------------------------------------------- API credentials ----
-- New keys always write their scopes explicitly; the '[]' default only
-- satisfies SQLite's ADD COLUMN rule and grants nothing. Keys that predate
-- scoping are backfilled with every scope, as upstream does.
ALTER TABLE "api_key" ADD COLUMN "scopes" TEXT NOT NULL DEFAULT '[]';

UPDATE "api_key" SET "scopes" = '["profile.read","preferences.write","flight.read.own","flight.read.any","flight.create.own","flight.create.any","flight.update.own","flight.update.any","flight.delete.own","flight.delete.any","flight.export.own","flight.export.any","flight.passengers.manage.own","flight.passengers.manage.any","flight.share.own","users.directory.read","users.create","users.update","users.delete","users.roles.assign","data.airports.manage","data.airlines.manage","data.aircraft.manage","custom_fields.read","custom_fields.manage","roles.manage","reference_data.read","stats.read","tracks.read","tracks.write","visited_countries.read","visited_countries.write","shares.read","shares.write","weather.read"]';

CREATE TABLE "oauth_client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "client_secret_hash" TEXT,
    "token_endpoint_auth_method" TEXT NOT NULL DEFAULT 'none',
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CONSTRAINT "oauth_client_auth_method_check" CHECK ("token_endpoint_auth_method" IN ('none', 'client_secret_post'))
);

CREATE TABLE "oauth_client_redirect_uri" (
    "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("id") ON DELETE CASCADE,
    "redirect_uri" TEXT NOT NULL,
    PRIMARY KEY ("client_id", "redirect_uri")
);

CREATE TABLE "oauth_authorization_request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("id") ON DELETE CASCADE,
    "user_id" TEXT REFERENCES "user" ("id") ON DELETE CASCADE,
    "redirect_uri" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "state" TEXT,
    "code_challenge" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX "oauth_authorization_request_expires_at_idx" ON "oauth_authorization_request"("expires_at");

CREATE TABLE "oauth_grant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "resource" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE ("client_id", "user_id", "resource")
);

CREATE TABLE "oauth_authorization_code" (
    "code_hash" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "grant_id" TEXT NOT NULL REFERENCES "oauth_grant" ("id") ON DELETE CASCADE,
    "redirect_uri" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "used_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX "oauth_authorization_code_expires_at_idx" ON "oauth_authorization_code"("expires_at");

CREATE TABLE "oauth_access_token" (
    "token_hash" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "grant_id" TEXT NOT NULL REFERENCES "oauth_grant" ("id") ON DELETE CASCADE,
    "refresh_family_id" TEXT,
    "scopes" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "revoked_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX "oauth_access_token_expires_at_idx" ON "oauth_access_token"("expires_at");
CREATE INDEX "oauth_access_token_refresh_family_id_idx" ON "oauth_access_token"("refresh_family_id");

CREATE TABLE "oauth_refresh_token" (
    "token_hash" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "grant_id" TEXT NOT NULL REFERENCES "oauth_grant" ("id") ON DELETE CASCADE,
    "family_id" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "used_at" TEXT,
    "revoked_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX "oauth_refresh_token_family_id_idx" ON "oauth_refresh_token"("family_id");
CREATE INDEX "oauth_refresh_token_expires_at_idx" ON "oauth_refresh_token"("expires_at");

-- ------------------------------------------- per-user flight calendar feed ----
CREATE TABLE "calendar_feed" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "reminder_offset_minutes" INTEGER,
    "show_emoji" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "last_fetched" TEXT,
    CONSTRAINT "calendar_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "calendar_feed_user_id_key" ON "calendar_feed"("user_id");
CREATE UNIQUE INDEX "calendar_feed_token_key" ON "calendar_feed"("token");

-- ---------------------------------------------- share flight selection ----
ALTER TABLE "public_share" ADD COLUMN "flight_selection" TEXT NOT NULL DEFAULT 'all';

-- Existing date-filtered shares become the equivalent explicit mode
UPDATE "public_share" SET "flight_selection" = 'custom' WHERE "date_from" IS NOT NULL OR "date_to" IS NOT NULL;
