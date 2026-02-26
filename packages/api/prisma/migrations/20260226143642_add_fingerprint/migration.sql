/*
  Warnings:

  - A unique constraint covering the columns `[fingerprint]` on the table `RawFeedback` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fingerprint` to the `RawFeedback` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RawFeedback" ADD COLUMN     "fingerprint" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RawFeedback_fingerprint_key" ON "RawFeedback"("fingerprint");
