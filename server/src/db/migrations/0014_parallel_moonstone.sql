ALTER TABLE "conventions" ALTER COLUMN "evidence_path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "evidence_snippet" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_evidence_range" CHECK ("conventions"."evidence_line_start" > 0 AND "conventions"."evidence_line_end" >= "conventions"."evidence_line_start");