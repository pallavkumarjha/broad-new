"""
Bootstrap a fresh production MongoDB database.

What this does:
  1. Connects to the MONGO_URL / DB_NAME from your loaded env (should be
     `.env.production` — see `.env.production.example`).
  2. Refuses to run against a DB name that looks non-prod, unless you pass
     --force. Guards against accidentally nuking dev data.
  3. Calls server.py's startup seeder by importing it — so indexes and the
     admin user are created via the SAME code path production uses on boot.
     No duplication of seed logic.
  4. Prints a summary of what exists (users, trips, indexes).

Usage:
  # Fill in .env.production first (copy from .env.production.example), then:
  cd backend
  set -a; source .env.production; set +a
  python scripts/bootstrap_prod.py

  # To dry-run against a non-prod-named DB:
  python scripts/bootstrap_prod.py --force

Safety:
  - Never destructive. Uses the same idempotent seed the server runs at boot.
  - If the admin already exists, only the heal-path (name reset) may update it.
  - Refresh-token and trip-request indexes are created if missing.
"""
from __future__ import annotations
import argparse
import asyncio
import os
import sys
from pathlib import Path

# Make the backend package importable when invoked as `python scripts/bootstrap_prod.py`.
HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))


async def main(force: bool) -> int:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "")
    admin_email = os.environ.get("ADMIN_EMAIL", "")

    if not mongo_url:
        print("ERROR: MONGO_URL not set. Source your .env.production first.", file=sys.stderr)
        return 2
    if not db_name:
        print("ERROR: DB_NAME not set.", file=sys.stderr)
        return 2
    if not os.environ.get("ADMIN_PASSWORD"):
        print("ERROR: ADMIN_PASSWORD not set.", file=sys.stderr)
        return 2

    # Guard: refuse to run against a DB name that clearly isn't prod.
    looks_prod = db_name.endswith("_prod") or db_name == "broad_prod"
    if not looks_prod and not force:
        print(
            f"REFUSING to bootstrap: DB_NAME='{db_name}' does not look like a prod "
            f"database (expected suffix '_prod'). Pass --force to override.",
            file=sys.stderr,
        )
        return 3

    print(f"→ Cluster : {mongo_url.split('@')[-1].split('/')[0]}")
    print(f"→ Database: {db_name}")
    print(f"→ Admin   : {admin_email}")
    print()

    # Import AFTER env is set so server.py picks up the prod values.
    from server import db, app  # noqa: E402

    # FastAPI startup events include the seeder. Run them manually.
    # Using the lifespan/startup handlers keeps this in lock-step with boot.
    for handler in app.router.on_startup:
        res = handler()
        if asyncio.iscoroutine(res):
            await res

    # Quick post-seed summary
    user_count = await db.users.count_documents({})
    trip_count = await db.trips.count_documents({})
    rt_indexes = await db.refresh_tokens.index_information()
    user_indexes = await db.users.index_information()

    print("✓ Seed complete.\n")
    print(f"  users.count            = {user_count}")
    print(f"  trips.count            = {trip_count}")
    print(f"  users indexes          = {sorted(user_indexes.keys())}")
    print(f"  refresh_tokens indexes = {sorted(rt_indexes.keys())}")
    print()
    print("Next steps:")
    print("  1. Rotate ADMIN_PASSWORD to a unique prod value if you haven't.")
    print("  2. Verify Atlas Network Access only whitelists your prod egress IPs.")
    print("  3. Deploy the app with these env vars loaded into the process.")
    print("  4. Hit GET /api/health from the app host to confirm connectivity.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true",
                    help="Bypass the DB_NAME prod-suffix guard. Use with care.")
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(force=args.force)))
