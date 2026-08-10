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

# add an admin, who lands on /admin after signing in
python3 tools/make-member.py --user acoutinho --name "Andrew Coutinho" --kind admin

# list logins
python3 tools/make-member.py --list

# remove one
python3 tools/make-member.py --remove acoutinho
```

Then commit `data/members.json`. The change is live as soon as Pages redeploys.

## Accounts and where they land

Each login has a **kind**: `admin` or `member`.

- **`member`** signs in on `/shapers.html` and stays there — the members area.
- **`admin`** signs in on the same form and is sent straight to `/admin/index.html`,
  the hub managers. Admin accounts are also what unlocks `/admin/*` directly;
  a member account that tries gets a "admins only" screen.

Two logins ship in `data/members.json`:

| Username | Password       | Kind   | Lands on            |
| -------- | -------------- | ------ | ------------------- |
| `admin`  | `AdminShaper!` | admin  | `/admin/index.html` |
| `shaper` | `Shapers2026`  | member | `/shapers.html`     |

**These passwords are written down here, in a public repo, so treat them as
public.** Replace them with your own before the gate means anything:

```bash
python3 tools/make-member.py --user admin --name "Hub Admin" --role Curator --kind admin
python3 tools/make-member.py --user shaper --name "Pittsburgh Shaper" --kind member
```

## The admin pages

`/admin/*` no longer carries its own plaintext password. `admin/gate.js` now
loads the same `auth.js` and checks for a signed-in session whose kind is
`admin`; anyone else is sent to the sign-in form. The same caveat applies as
above — this is casual gating on static hosting. The real authority for
editing content is the GitHub token you paste into each manager, which is
never stored in this repo.
