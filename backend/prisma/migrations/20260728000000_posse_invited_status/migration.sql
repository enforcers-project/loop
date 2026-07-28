-- Add an 'invited' state to posse_member_status. Distinguishes a member-issued
-- invite (the invitee accepts/declines) from a join request (the captain
-- approves). Both were previously conflated: an invite added the person as
-- 'active' immediately.
--
-- Postgres runs ALTER TYPE ... ADD VALUE outside a transaction. Prisma executes
-- each statement in a migration separately (no wrapping BEGIN), and IF NOT
-- EXISTS makes the add idempotent so a re-run can't fail with "already exists".
ALTER TYPE "posse_member_status" ADD VALUE IF NOT EXISTS 'invited';
