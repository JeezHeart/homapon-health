-- Migration: Add scheduled_time to appointments
-- Run this in the Supabase SQL Editor:
alter table appointments add column if not exists scheduled_time text;
