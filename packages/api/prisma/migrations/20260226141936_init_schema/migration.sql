-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('APP_STORE', 'REDDIT');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawFeedback" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyzedInsight" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "tags" TEXT[],
    "urgencyScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyzedInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyzedInsight_feedbackId_key" ON "AnalyzedInsight"("feedbackId");

-- AddForeignKey
ALTER TABLE "RawFeedback" ADD CONSTRAINT "RawFeedback_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyzedInsight" ADD CONSTRAINT "AnalyzedInsight_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "RawFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
