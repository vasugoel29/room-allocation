#!/usr/bin/env bash
set -euo pipefail

# Usage: ./migrate_to_supabase.sh "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

TARGET_URL="${1:-${SUPABASE_DATABASE_URL:-}}"

if [ -z "$TARGET_URL" ]; then
  echo "Error: Target Supabase database URL is required."
  echo "Usage: $0 <supabase_database_url>"
  echo "Or set SUPABASE_DATABASE_URL in your environment."
  exit 1
fi

echo "==> Testing target Supabase database connection..."
psql "$TARGET_URL" -c "SELECT version();" > /dev/null
echo "✓ Connected to Supabase successfully."

echo "==> Ensuring required Postgres extensions (btree_gist)..."
psql "$TARGET_URL" -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"

echo "==> Streaming clean local replica 'roomdb' to Supabase..."
docker exec room-allocation-db-1 pg_dump -U roomuser -d roomdb \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | psql "$TARGET_URL"

echo "==> Verifying table row counts on Supabase..."
psql "$TARGET_URL" -c "
SELECT 'users' as table_name, count(*) as count FROM users
UNION ALL SELECT 'rooms', count(*) FROM rooms
UNION ALL SELECT 'faculties', count(*) FROM faculties
UNION ALL SELECT 'bookings', count(*) FROM bookings
UNION ALL SELECT 'room_availability', count(*) FROM room_availability
UNION ALL SELECT 'user_access', count(*) FROM user_access;
"

echo "✓ Migration to Supabase completed successfully!"
