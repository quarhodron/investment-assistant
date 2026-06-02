-- Drop analysis_type column and its associated constraint and index from analyses.
-- company_id IS NULL vs IS NOT NULL is the sole discriminator going forward.

ALTER TABLE analyses DROP CONSTRAINT analyses_type_company_check;

DROP INDEX analyses_user_type_created_idx;

ALTER TABLE analyses DROP COLUMN analysis_type;
