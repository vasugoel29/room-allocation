#!/usr/bin/env bash
# Usage: load/run.sh <smoke|peak|stress|spike|contention|abuse|soak> [--no-seed] [-- extra k6 args]
# Seeds roomdb_load_test, boots a dedicated backend on :4200 (rate limiting ON, like prod),
# runs the k6 scenario in Docker, stores the summary in load/results/, then checks booking integrity.
set -euo pipefail
cd "$(dirname "$0")/.."
SCENARIO="${1:?scenario name required}"; shift
SEED=1
if [[ "${1:-}" == "--no-seed" ]]; then SEED=0; shift; fi
[[ "${1:-}" == "--" ]] && shift

DB_URL="postgresql://roomuser:roompass@localhost:5432/roomdb_load_test"
PORT=4200
mkdir -p load/results
STAMP="$(date +%Y%m%d-%H%M%S)"

[[ $SEED == 1 ]] && node load/seed.mjs

if ss -ltn | grep -q ":$PORT "; then echo "port $PORT already in use — stop that process first"; exit 1; fi
( cd backend && exec env NODE_ENV=e2e PORT=$PORT DATABASE_URL="$DB_URL" JWT_SECRET=load_jwt_secret_do_not_use_elsewhere \
    CORS_ORIGIN=http://localhost:5180 SMTP_USER= SMTP_PASS= node src/server.js > "../load/results/$SCENARIO-$STAMP.server.log" 2>&1 ) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/health" >/dev/null && break; sleep 1; done

set +e
docker run --rm --add-host=host.docker.internal:host-gateway -u "$(id -u):$(id -g)" -v "$PWD/load:/load" -w /load \
  -e BASE_URL="http://${K6_TARGET_HOST:-host.docker.internal}:$PORT/api" grafana/k6:1.3.0 run \
  --summary-export "/load/results/$SCENARIO-$STAMP.json" "$@" "scenarios/$SCENARIO.js"
K6_EXIT=$?
set -e

echo "--- booking integrity (overlapping ACTIVE bookings in the same room; must be 0)"
docker exec -i room-allocation-db-1 psql -U roomuser -d roomdb_load_test -tA -c "
  SELECT count(*) FROM bookings a JOIN bookings b
    ON a.room_id = b.room_id AND a.id < b.id
   AND a.status = 'ACTIVE' AND b.status = 'ACTIVE'
   AND tstzrange(a.start_time, a.end_time) && tstzrange(b.start_time, b.end_time);"
echo "--- server 5xx / errors logged:"
grep -ciE '"level":"ERROR"|Global Error Handler' "load/results/$SCENARIO-$STAMP.server.log" || true
exit $K6_EXIT
