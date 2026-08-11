-- Hotel stays. lat/lon are nullable so email imports survive a failed
-- geocode; the UI prompts the user to place them manually.
-- CreateTable
CREATE TABLE "stay" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "lat" REAL,
    "lon" REAL,
    "check_in" TEXT NOT NULL,
    "check_out" TEXT NOT NULL,
    "confirmation_code" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CONSTRAINT "stay_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "stay_user_id_idx" ON "stay"("user_id");

-- CreateIndex
CREATE INDEX "stay_user_id_name_check_in_idx" ON "stay"("user_id", "name", "check_in");
