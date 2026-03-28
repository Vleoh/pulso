-- Add custom sheet code storage for poll backoffice
ALTER TABLE "pulso"."Poll"
ADD COLUMN "customSheetCode" TEXT;
