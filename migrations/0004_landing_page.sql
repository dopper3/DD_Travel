-- Per-user landing page preference: which page opens on a fresh app load.
-- AlterTable
ALTER TABLE "user" ADD COLUMN "landing_page" TEXT NOT NULL DEFAULT 'map';
