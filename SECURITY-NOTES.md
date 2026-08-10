# Members-area sign-in — how it works, and what it protects

The members area (`/shapers.html`) requires a **username and password**. There is
no third-party identity provider, no external SDK, and no analytics — the whole
flow uses the browser's built-in WebCrypto API.

## How it works

1. `data/members.json` stores, for each member, a random 16-byte salt and the
   **PBKDF2-SHA256 hash** of their password (210,000 iterations, 32-byte output).
   Plaintext passwords are never stored, sent, or logged.
2. On sign-in, `assets/js/auth.js` re-derives the hash from what was typed and
   compares it to the stored one in constant time.
3. On success a session is written to `sessionStorage` (this tab only), or to
   `localStorage` for 30 days if "Keep me signed in" is ticked. "Sign out"
   clears both.
4. Unknown usernames still run a full derivation, so a wrong username and a
   wrong password take about the same amount of time.

## What this protects — and what it doesn't

This site is hosted on GitHub Pages: static files, no server, so **no page can
be withheld from someone who asks for it**. Anyone can download
`data/members.json` and run an offline attack against the hashes. PBKDF2 at
210k iterations makes that slow and per-user, but it is not impossible.

So: this is solid protection for **"members only, please"** content — internal
links, working docs, meeting notes. It is **not** a place for secrets,
credentials, personal data about members, or anything you'd be harmed by
leaking. Use strong, unique passwords, and don't reuse a password from
anywhere else.

If you ever need real access control, the site would have to move behind
something that enforces login *before* serving the page — e.g. Cloudflare
Access in front of the domain, or hosting the members area on a platform with
a backend. That's a hosting change, not a code change.

## Managing logins

```bash
# add or update a member (prompts for the password, twice)
python3 tools/make-member.py --user acoutinho --name "Andrew Coutinho" --role Curator

# list logins
python3 tools/make-member.py --list

# remove one
python3 tools/make-member.py --remove acoutinho
```

Then commit `data/members.json`. The change is live as soon as Pages redeploys.

## Seeded logins — rotate these

Two starter logins ship in `data/members.json` so the page works immediately:

| Username  | Password                  |
| --------- | ------------------------- |
| `curator` | `Pittsburgh-Curator-2026`  |
| `shaper`  | `Pittsburgh-Shapers-2026`  |

**These passwords are published in this file, so treat them as public.** Replace
them before relying on the gate:

```bash
python3 tools/make-member.py --user curator --name "Hub Curator" --role Curator
python3 tools/make-member.py --remove shaper
```

## Separately: the admin pages

`/admin/*` is still gated by `admin/gate.js`, which contains a **plaintext**
password in the source. That predates this change and was left alone, but it
should be rotated onto the same hashed scheme — say the word and it's a small
change.
