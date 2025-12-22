-- Migration: Add autoRetaliate column to characters table
-- Description: Adds auto-retaliate toggle persistence for OSRS-style combat
-- Created: 2025-12-17
-- Issue: #321

-- Add auto-retaliate column to characters table (idempotent)
-- Default 1 = ON (OSRS default behavior - players fight back when attacked)
-- 0 = OFF (player won't automatically retaliate)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS "autoRetaliate" integer DEFAULT 1 NOT NULL;

-- Create index for quick lookups (idempotent)
CREATE INDEX IF NOT EXISTS idx_characters_auto_retaliate ON characters("autoRetaliate");
