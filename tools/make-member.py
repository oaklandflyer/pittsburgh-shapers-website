#!/usr/bin/env python3
"""Add or update a member login for the Shapers members area.

The site is static (GitHub Pages, no backend), so logins are verified in the
browser: data/members.json holds a PBKDF2-SHA256 salt+hash per member, never a
plaintext password. This script writes those records.

Usage
-----
    python3 tools/make-member.py --user acoutinho --name "Andrew Coutinho"
    python3 tools/make-member.py --user acoutinho --password "..." --role Curator
    python3 tools/make-member.py --list
    python3 tools/make-member.py --remove acoutinho

Passwords are prompted for (hidden) unless --password is given. After running,
commit data/members.json and the new login works immediately.

Read SECURITY-NOTES.md before relying on this for anything sensitive: a
determined visitor can download members.json and attack the hashes offline, so
this gates casual access, not secrets.
"""

import argparse
import getpass
import hashlib
import json
import os
import secrets
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEMBERS_PATH = os.path.join(ROOT, "data", "members.json")

# Must match the iteration count the browser uses when verifying. Stored per
# record so old accounts keep working if this is raised later.
ITERATIONS = 210000


def load():
    if not os.path.exists(MEMBERS_PATH):
        return {"iterations": ITERATIONS, "users": []}
    with open(MEMBERS_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    data.setdefault("users", [])
    data.setdefault("iterations", ITERATIONS)
    return data


def save(data):
    os.makedirs(os.path.dirname(MEMBERS_PATH), exist_ok=True)
    with open(MEMBERS_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
    print("wrote %s" % os.path.relpath(MEMBERS_PATH, ROOT))


def derive(password, salt_hex, iterations):
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations, dklen=32
    )
    return dk.hex()


def main():
    ap = argparse.ArgumentParser(description="Manage members-area logins.")
    ap.add_argument("--user", help="username (lowercase, no spaces)")
    ap.add_argument("--name", help="display name shown after sign-in")
    ap.add_argument("--role", default="", help="optional role label, e.g. Curator")
    ap.add_argument("--password", help="password (omit to be prompted)")
    ap.add_argument("--iterations", type=int, default=ITERATIONS)
    ap.add_argument("--remove", metavar="USER", help="delete a login")
    ap.add_argument("--list", action="store_true", help="list existing logins")
    args = ap.parse_args()

    data = load()

    if args.list:
        if not data["users"]:
            print("no logins yet")
        for u in data["users"]:
            print("%-16s %s%s" % (u["u"], u.get("name", ""),
                                  (" · " + u["role"]) if u.get("role") else ""))
        return 0

    if args.remove:
        before = len(data["users"])
        data["users"] = [u for u in data["users"] if u["u"] != args.remove.strip().lower()]
        if len(data["users"]) == before:
            print("no such login: %s" % args.remove, file=sys.stderr)
            return 1
        save(data)
        return 0

    if not args.user:
        ap.error("--user is required (or use --list / --remove)")

    user = args.user.strip().lower()
    password = args.password or getpass.getpass("Password for %s: " % user)
    if not args.password:
        if password != getpass.getpass("Repeat password: "):
            print("passwords did not match", file=sys.stderr)
            return 1
    if len(password) < 8:
        print("use at least 8 characters", file=sys.stderr)
        return 1

    salt = secrets.token_hex(16)
    record = {
        "u": user,
        "name": args.name or user,
        "role": args.role,
        "salt": salt,
        "iter": args.iterations,
        "hash": derive(password, salt, args.iterations),
    }

    replaced = False
    for i, existing in enumerate(data["users"]):
        if existing["u"] == user:
            data["users"][i] = record
            replaced = True
            break
    if not replaced:
        data["users"].append(record)

    save(data)
    print("%s login '%s'" % ("updated" if replaced else "added", user))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
