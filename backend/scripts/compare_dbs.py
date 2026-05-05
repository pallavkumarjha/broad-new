"""
Compare structure of dev and prod MongoDB databases, sync dev → prod.

Reads two env files (default: backend/.env and backend/.env.production), connects
to both, and reports:
  - Collections present in one but not the other
  - Index differences per collection
  - Document count per collection (for sanity, not enforced)

Run modes:
  python scripts/compare_dbs.py                    # diff only, prints report
  python scripts/compare_dbs.py --apply            # also create missing collections
                                                   # and indexes in DEV to match PROD
                                                   # NEVER touches data, NEVER drops
                                                   # anything, NEVER touches PROD.

The "prod is correct" assumption is enforced — we only ever write to dev.

Usage:
  cd backend
  python scripts/compare_dbs.py
  python scripts/compare_dbs.py --apply
"""
from __future__ import annotations
import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient


def load_env(path: Path) -> dict[str, str]:
    """Tiny .env parser. Doesn't pollute os.environ — returns a dict only."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip()
        # strip surrounding quotes
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        out[k.strip()] = v
    return out


def index_signature(spec: dict[str, Any]) -> tuple:
    """Reduce an index_information dict entry to a comparable tuple.

    Mongo's index_information returns:
      { "name": { "key": [(field, dir), ...], "unique": True, ... } }

    We build a frozen tuple of (sorted key tuple, unique, partial_filter, sparse,
    expireAfter) so two equivalent indexes hash equal regardless of dict order.
    """
    key = tuple(spec.get("key", []))
    flags = (
        ("unique", bool(spec.get("unique", False))),
        ("sparse", bool(spec.get("sparse", False))),
        # partialFilterExpression as sorted-items tuple
        ("partialFilterExpression",
         tuple(sorted((spec.get("partialFilterExpression") or {}).items()))),
        ("expireAfterSeconds", spec.get("expireAfterSeconds")),
    )
    return (key, flags)


async def gather_state(client: AsyncIOMotorClient, db_name: str) -> dict[str, Any]:
    db = client[db_name]
    collections = sorted(await db.list_collection_names())
    state: dict[str, Any] = {}
    for c in collections:
        coll = db[c]
        idx = await coll.index_information()
        # Drop the auto _id_ index from comparison — every collection has it
        # and Mongo manages it; reporting it is just noise.
        idx.pop("_id_", None)
        count = await coll.estimated_document_count()
        state[c] = {
            "count": count,
            "indexes": idx,
        }
    return state


def diff_indexes(dev_idx: dict, prod_idx: dict) -> tuple[list[str], list[str]]:
    """Return (missing_in_dev, extra_in_dev) by signature equality."""
    dev_sigs = {name: index_signature(spec) for name, spec in dev_idx.items()}
    prod_sigs = {name: index_signature(spec) for name, spec in prod_idx.items()}
    dev_set = set(dev_sigs.values())
    prod_set = set(prod_sigs.values())

    # By signature: missing = in prod, not in dev
    missing_sigs = prod_set - dev_set
    extra_sigs = dev_set - prod_set
    missing_names = [name for name, sig in prod_sigs.items() if sig in missing_sigs]
    extra_names = [name for name, sig in dev_sigs.items() if sig in extra_sigs]
    return missing_names, extra_names


async def apply_index(coll, name: str, spec: dict[str, Any]) -> None:
    """Create one index in DEV from a PROD index_information entry."""
    keys = spec.get("key") or []
    if not keys:
        return
    kwargs: dict[str, Any] = {"name": name}
    if spec.get("unique"):
        kwargs["unique"] = True
    if spec.get("sparse"):
        kwargs["sparse"] = True
    if "partialFilterExpression" in spec:
        kwargs["partialFilterExpression"] = spec["partialFilterExpression"]
    if "expireAfterSeconds" in spec:
        kwargs["expireAfterSeconds"] = spec["expireAfterSeconds"]
    # Motor expects key spec as list of (field, direction) tuples.
    await coll.create_index(list(keys), **kwargs)


async def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="Create missing collections + indexes in DEV. "
                         "PROD is read-only.")
    ap.add_argument("--dev-env", default=".env",
                    help="Path to dev env file (default: .env)")
    ap.add_argument("--prod-env", default=".env.production",
                    help="Path to prod env file (default: .env.production)")
    args = ap.parse_args(argv)

    backend = Path(__file__).resolve().parent.parent
    dev_env = load_env(backend / args.dev_env)
    prod_env = load_env(backend / args.prod_env)

    if not dev_env.get("MONGO_URL") or not dev_env.get("DB_NAME"):
        print(f"ERROR: dev env missing MONGO_URL or DB_NAME ({args.dev_env})", file=sys.stderr)
        return 2
    if not prod_env.get("MONGO_URL") or not prod_env.get("DB_NAME"):
        print(f"ERROR: prod env missing MONGO_URL or DB_NAME ({args.prod_env})", file=sys.stderr)
        return 2
    if dev_env["MONGO_URL"] == prod_env["MONGO_URL"] and dev_env["DB_NAME"] == prod_env["DB_NAME"]:
        print("ERROR: dev and prod point at the same DB. Aborting.", file=sys.stderr)
        return 3

    dev_client = AsyncIOMotorClient(dev_env["MONGO_URL"])
    prod_client = AsyncIOMotorClient(prod_env["MONGO_URL"])

    print(f"DEV  : {dev_env['DB_NAME']} @ {dev_env['MONGO_URL'].split('@')[-1].split('/')[0]}")
    print(f"PROD : {prod_env['DB_NAME']} @ {prod_env['MONGO_URL'].split('@')[-1].split('/')[0]}")
    print()

    dev_state = await gather_state(dev_client, dev_env["DB_NAME"])
    prod_state = await gather_state(prod_client, prod_env["DB_NAME"])

    dev_colls = set(dev_state.keys())
    prod_colls = set(prod_state.keys())
    missing_colls = prod_colls - dev_colls
    extra_colls = dev_colls - prod_colls
    common = sorted(dev_colls & prod_colls)

    # ── Collection-level summary ──────────────────────────────────────────────
    print("== COLLECTIONS ==")
    if missing_colls:
        print(f"  Missing in DEV (present in PROD): {sorted(missing_colls)}")
    if extra_colls:
        print(f"  Extra   in DEV (NOT in PROD)    : {sorted(extra_colls)} (left alone)")
    if not missing_colls and not extra_colls:
        print("  ✓ Same collections in both.")
    print()

    # ── Index-level diff per common collection ───────────────────────────────
    print("== INDEXES ==")
    total_index_drift = 0
    drift_plan: list[tuple[str, str, dict]] = []  # (collection, name, spec) to add to dev
    for c in common:
        missing_names, extra_names = diff_indexes(
            dev_state[c]["indexes"], prod_state[c]["indexes"]
        )
        if missing_names or extra_names:
            print(f"  [{c}]")
            if missing_names:
                print(f"    Missing in DEV: {missing_names}")
                for name in missing_names:
                    drift_plan.append((c, name, prod_state[c]["indexes"][name]))
            if extra_names:
                print(f"    Extra   in DEV: {extra_names} (left alone)")
            total_index_drift += len(missing_names) + len(extra_names)
    if total_index_drift == 0 and not missing_colls:
        print("  ✓ Index sets match.")
    print()

    # ── Document count side-by-side (informational only) ─────────────────────
    print("== DOC COUNTS ==")
    print(f"  {'collection':<22} {'dev':>10} {'prod':>10}")
    all_colls = sorted(dev_colls | prod_colls)
    for c in all_colls:
        dev_n = dev_state.get(c, {}).get("count", "—")
        prod_n = prod_state.get(c, {}).get("count", "—")
        print(f"  {c:<22} {str(dev_n):>10} {str(prod_n):>10}")
    print()

    # ── Apply: ONLY writes to dev, never prod ────────────────────────────────
    if args.apply and (missing_colls or drift_plan):
        print("== APPLYING (DEV only) ==")
        dev_db = dev_client[dev_env["DB_NAME"]]
        # Create missing collections (empty). Mongo creates them on first
        # insert too, but explicit creation makes intent obvious.
        for c in sorted(missing_colls):
            try:
                await dev_db.create_collection(c)
                print(f"  + collection: {c}")
            except Exception as e:
                # Already exists race or auth issue
                print(f"  ! collection {c}: {e}")
        # Add missing indexes to existing OR newly created collections
        for collection_name, name, spec in drift_plan:
            try:
                await apply_index(dev_db[collection_name], name, spec)
                print(f"  + index    : {collection_name}.{name}")
            except Exception as e:
                print(f"  ! index    : {collection_name}.{name}: {e}")
        print()
        print("Done. Re-run without --apply to verify.")
    elif args.apply:
        print("Nothing to apply — dev already matches prod.")

    dev_client.close()
    prod_client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv[1:])))
