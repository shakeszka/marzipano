-- Add JSONB settings column to tours
ALTER TABLE tours
  ADD COLUMN settings JSONB DEFAULT '{}'::jsonb;
