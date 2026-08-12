-- Generic calendar events (manual or emailed to event@). start_time NULL
-- means all-day; end_date/end_time are optional (single-day / no explicit
-- end). lat/lon are nullable; location is free text.
-- CreateTable
CREATE TABLE "event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "lat" REAL,
    "lon" REAL,
    "start_date" TEXT NOT NULL,
    "start_time" TEXT,
    "end_date" TEXT,
    "end_time" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CONSTRAINT "event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "event_user_id_idx" ON "event"("user_id");

-- CreateIndex
CREATE INDEX "event_user_id_title_start_date_idx" ON "event"("user_id", "title", "start_date");
