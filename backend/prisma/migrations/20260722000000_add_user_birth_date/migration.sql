-- Age gate: capture the user's date of birth in onboarding so we can compute
-- age at read-time and hide age-gated events (age_min) accordingly.
ALTER TABLE "users" ADD COLUMN "birth_date" DATE;
