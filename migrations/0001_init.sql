-- D1/SQLite schema for DD_Travel, ported from the Prisma Postgres schema.
--
-- Type conventions (see src/lib/db/d1.ts for the runtime conversion layer):
-- - timestamps: TEXT, ISO-8601 UTC ("2026-08-08T12:34:56.789Z")
--   EXCEPT session.expires_at: INTEGER unix seconds (Lucia D1Adapter format)
-- - booleans: INTEGER 0/1
-- - json: TEXT

-- CreateTable
CREATE TABLE "app_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "config" TEXT NOT NULL DEFAULT '{}'
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL,
    "oauth_id" TEXT,
    "distance_unit" TEXT NOT NULL DEFAULT 'km',
    "wind_speed_unit" TEXT NOT NULL DEFAULT 'kt',
    "temperature_unit" TEXT NOT NULL DEFAULT 'c',
    "pressure_unit" TEXT NOT NULL DEFAULT 'hpa',
    "time_format" TEXT NOT NULL DEFAULT 'auto',
    "date_format" TEXT NOT NULL DEFAULT 'auto',
    "week_starts_on" TEXT NOT NULL DEFAULT 'auto',
    "flight_time_display" TEXT NOT NULL DEFAULT 'airport'
);

-- CreateTable
CREATE TABLE "oauth_link_token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "oauth_sub" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CONSTRAINT "oauth_link_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "airport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "icao" TEXT NOT NULL,
    "iata" TEXT,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "tz" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "municipality" TEXT,
    "type" TEXT NOT NULL,
    "continent" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "custom" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "aircraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icao" TEXT,
    "source_id" TEXT
);

-- CreateTable
CREATE TABLE "airline" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icao" TEXT,
    "iata" TEXT,
    "icon_path" TEXT,
    "source_id" TEXT
);

-- CreateTable
CREATE TABLE "flight" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "date_precision" TEXT NOT NULL DEFAULT 'day',
    "departure" TEXT,
    "arrival" TEXT,
    "departure_scheduled" TEXT,
    "arrival_scheduled" TEXT,
    "takeoff_scheduled" TEXT,
    "takeoff_actual" TEXT,
    "landing_scheduled" TEXT,
    "landing_actual" TEXT,
    "duration" INTEGER,
    "departure_terminal" TEXT,
    "departure_gate" TEXT,
    "arrival_terminal" TEXT,
    "arrival_gate" TEXT,
    "flight_number" TEXT,
    "aircraft_reg" TEXT,
    "note" TEXT,
    "from_id" INTEGER,
    "to_id" INTEGER,
    "aircraft_id" INTEGER,
    "airline_id" INTEGER,
    CONSTRAINT "flight_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "airport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "flight_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "airport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "flight_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "aircraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "flight_airline_id_fkey" FOREIGN KEY ("airline_id") REFERENCES "airline" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "flight_track" (
    "flight_id" INTEGER NOT NULL PRIMARY KEY,
    "track" TEXT NOT NULL,
    "source_format" TEXT NOT NULL,
    "source_name" TEXT,
    "point_count" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CONSTRAINT "flight_track_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "flight_passenger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "flight_id" INTEGER NOT NULL,
    "user_id" TEXT,
    "guest_name" TEXT,
    "seat" TEXT,
    "seat_number" TEXT,
    "seat_class" TEXT,
    "flight_reason" TEXT,
    CONSTRAINT "flight_passenger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "flight_passenger_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visited_country" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "visited_country_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
-- expires_at is INTEGER unix seconds: that is what Lucia's D1Adapter reads
-- and writes, and nothing else touches this table.
CREATE TABLE "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expires_at" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "last_used" TEXT,
    CONSTRAINT "api_key_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "public_share" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "expires_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "show_map" INTEGER NOT NULL DEFAULT 1,
    "show_stats" INTEGER NOT NULL DEFAULT 0,
    "show_flight_list" INTEGER NOT NULL DEFAULT 0,
    "date_from" TEXT,
    "date_to" TEXT,
    "show_flight_numbers" INTEGER NOT NULL DEFAULT 1,
    "show_airlines" INTEGER NOT NULL DEFAULT 1,
    "show_aircraft" INTEGER NOT NULL DEFAULT 0,
    "show_times" INTEGER NOT NULL DEFAULT 0,
    "show_tracks" INTEGER NOT NULL DEFAULT 0,
    "show_dates" INTEGER NOT NULL DEFAULT 1,
    "show_seat" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "public_share_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "custom_field_definition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entity_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "field_type" TEXT NOT NULL,
    "required" INTEGER NOT NULL DEFAULT 0,
    "active" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "default_value" TEXT,
    "options" TEXT,
    "validation_json" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- CreateTable
CREATE TABLE "custom_field_value" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "field_id" INTEGER NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CONSTRAINT "custom_field_value_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "custom_field_definition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");
CREATE UNIQUE INDEX "user_oauth_id_key" ON "user"("oauth_id");
CREATE UNIQUE INDEX "oauth_link_token_token_key" ON "oauth_link_token"("token");
CREATE UNIQUE INDEX "oauth_link_token_user_id_key" ON "oauth_link_token"("user_id");
CREATE INDEX "oauth_link_token_token_idx" ON "oauth_link_token"("token");
CREATE INDEX "aircraft_source_id_idx" ON "aircraft"("source_id");
CREATE INDEX "airline_source_id_idx" ON "airline"("source_id");
CREATE INDEX "flight_from_id_idx" ON "flight"("from_id");
CREATE INDEX "flight_to_id_idx" ON "flight"("to_id");
CREATE UNIQUE INDEX "flight_passenger_user_id_flight_id_key" ON "flight_passenger"("flight_id", "user_id");
CREATE UNIQUE INDEX "flight_passenger_flight_id_guest_name_key" ON "flight_passenger"("flight_id", "guest_name");
CREATE UNIQUE INDEX "visited_country_code_user_id_key" ON "visited_country"("code", "user_id");
CREATE UNIQUE INDEX "public_share_slug_key" ON "public_share"("slug");
CREATE INDEX "public_share_slug_idx" ON "public_share"("slug");
CREATE INDEX "public_share_user_id_idx" ON "public_share"("user_id");
CREATE INDEX "custom_field_definition_entity_type_active_order_idx" ON "custom_field_definition"("entity_type", "active", "order");
CREATE UNIQUE INDEX "custom_field_definition_entity_type_key_key" ON "custom_field_definition"("entity_type", "key");
CREATE INDEX "custom_field_value_entity_type_entity_id_idx" ON "custom_field_value"("entity_type", "entity_id");
CREATE UNIQUE INDEX "custom_field_value_field_id_entity_type_entity_id_key" ON "custom_field_value"("field_id", "entity_type", "entity_id");
