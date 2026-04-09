#!/usr/bin/env python3
"""
CLI script to trigger data refreshes via the API.

Usage:
    python scripts/refresh_data.py --source weather --start 2024-01-01 --end 2024-12-31
    python scripts/refresh_data.py --all --start 2024-01-01 --end 2024-12-31
    python scripts/refresh_data.py --list
"""
import argparse
import httpx
import sys

BASE_URL = "http://localhost:8000"


def list_sources():
    resp = httpx.get(f"{BASE_URL}/sources")
    resp.raise_for_status()
    sources = resp.json()
    print(f"{'ID':<20} {'Name':<35} {'Category':<15} {'Key Required'}")
    print("-" * 90)
    for s in sources:
        key_status = "✓ configured" if s["key_configured"] else "✗ missing" if s["requires_key"] else "n/a"
        print(f"{s['id']:<20} {s['name']:<35} {s['category']:<15} {key_status}")


def refresh(source_id: str, start: str, end: str):
    payload = {"start_date": start, "end_date": end}
    resp = httpx.post(f"{BASE_URL}/sources/{source_id}/refresh", json=payload, timeout=30)
    if resp.status_code == 200:
        print(f"[{source_id}] Queued: {start} → {end}")
    else:
        print(f"[{source_id}] Error {resp.status_code}: {resp.text}")


def main():
    parser = argparse.ArgumentParser(description="Refresh FullPicture data sources")
    parser.add_argument("--source", help="Source ID to refresh")
    parser.add_argument("--all", action="store_true", help="Refresh all sources")
    parser.add_argument("--list", action="store_true", help="List available sources")
    parser.add_argument("--start", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", help="End date (YYYY-MM-DD)")
    parser.add_argument("--base-url", default=BASE_URL, help=f"API base URL (default: {BASE_URL})")
    args = parser.parse_args()

    global BASE_URL
    BASE_URL = args.base_url

    if args.list:
        list_sources()
        return

    if not args.start or not args.end:
        print("Error: --start and --end are required for refresh operations.")
        sys.exit(1)

    if args.all:
        resp = httpx.get(f"{BASE_URL}/sources")
        resp.raise_for_status()
        for source in resp.json():
            refresh(source["id"], args.start, args.end)
    elif args.source:
        refresh(args.source, args.start, args.end)
    else:
        print("Error: specify --source <id> or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
