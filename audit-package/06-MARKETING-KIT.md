# PantryRun — Marketing Kit

Copy claims only shipped v1 features (no Alexa/Google Assistant, no managed
plan — both hidden in v1). **Corrected 2026-07-28 against the v1 binary:**
the previous ground rule here said Siri and the trip optimizer were "shipped
and claimable" — **neither is**. Trip Optimizer is gated off
(`TRIP_OPTIMIZER_ENABLED = false`, paid tier, 1.x) and Siri has no runtime
caller and no iOS extension target. Price comparison is shipped but
**opt-in, off by default** — always mark it optional. The full guardrail
list lives in `07-STORE-LISTINGS.md` §2; that doc is the source of truth for
store copy and this kit was synced to it on 2026-07-28. **Flyer scanning
caveat, updated:** the camera-capture bug (`01-USABILITY-AUDIT.md` #3) has a
fix on main (commit `f8f4493` — real CameraView capture with an image-picker
fallback), but it has not been device-verified, so the copy below still says
"Add a photo" rather than "Snap a photo". Upgrade the wording only after the
capture path is verified on a device.

---

## 1. Store-listing copy

### Apple App Store
- **Name (≤30):** `PantryRun: Family Grocery List` *(30 chars — exactly at the 30 limit)*
- **Subtitle (≤30):** `Private family grocery lists` *(28 chars)*
- **Promotional text (≤170):**
  `Your family's grocery list, end-to-end encrypted. Works offline, syncs across your household, and — when you opt in — compares local flyer prices. Your data stays yours.` *(169 chars)*
- **Keywords (≤100 chars):**
  `grocery,shopping list,family,shared list,price compare,flyer,deals,private,encrypted,offline,pantry` *(99 chars)*

### Google Play
- **Title (≤30):** `PantryRun: Family Grocery List`
- **Short description (≤80):**
  `Private, encrypted family grocery lists. Offline-first, opt-in local prices.` *(76 chars)*

### Full description (both stores)

> **The grocery list that respects your family's privacy.**
>
> PantryRun keeps your household's shopping in sync — without accounts, ads,
> or anyone reading your data. Lists are end-to-end encrypted on your device;
> not even the sync server can see what's on them.
>
> **🛒 Shared family lists**
> Add "milk" on your phone; it appears on your partner's in the store aisle.
> Works fully offline — changes sync when you're back online.
>
> **🔒 Actually private**
> • End-to-end encrypted sync (XChaCha20-Poly1305)
> • No account, no email, no phone number — ever
> • No ads, no analytics, no tracking
> • Prefer full control? The sync server's source is on GitHub — run it in
>   your own home.
>
> **💰 Pay less for the same cart** (optional — everything here is off until
> you turn it on)
> • See local prices next to your list items
> • Add a photo of a store flyer — AI reads the deals into your price list
> • Weekly flyer deals matched to what's already on your list, for your area
>
> **🔑 Your keys, your data**
> A 12-word recovery phrase — like a crypto wallet, but for your grocery
> list. It gets you back in on a new phone, and your family's shared list
> syncs right back.
>
> PantryRun is built for households that think a grocery list shouldn't be
> anyone else's business. Privacy policy: https://groceryapp.app/privacy

*(Both stores ≤4000 chars — this is ~1,600.)*

**Listing don'ts (accuracy per Apple 2.3.1 / Play metadata policy):** don't
mention Alexa/Google Assistant, "premium", "subscription", or a managed/cloud
plan until those ship; don't claim Android↔iOS family sync until the
two-device cross-platform smoke test has actually been run; don't say "snap"
or "photograph" a flyer until the camera-capture bug is fixed.

---

## 2. Three social posts

**Post 1 — X/Twitter (launch announcement)**
> Your grocery list knows when you eat, what you can afford, and when you're
> pregnant before your family does. Most list apps sell that.
>
> We built PantryRun: end-to-end encrypted family grocery lists. No account.
> No ads. The sync server is yours to run — one docker-compose command.
>
> 🛒🔒 App Store / Google Play → [link]

**Post 2 — Reddit r/selfhosted (technical audience, no marketing voice)**
> **PantryRun — E2EE family grocery list with a self-hostable relay (Docker, ~256MB)**
>
> Built this because every shared-list app wanted an account and phoned home.
> Architecture: Yjs CRDTs for offline-first sync, XChaCha20-Poly1305
> client-side encryption (the relay sees only ciphertext on the list-sync
> path; the optional flyer-photo extraction channel is NOT zero-knowledge —
> disclosed in the threat model), libsodium,
> QR-based device pairing with Ed25519-signed one-time invite tokens (blind
> RSA per RFC 9474 is used separately for anonymous price-pool
> contributions), 12-word recovery phrase. The relay is a single Node
> container; docker-compose up and point the app at it. Optional: local AI
> flyer-price extraction via your own Ollama (qwen2.5-vl).
>
> Threat model and crypto docs are in the repo. Would love brutal feedback
> on both. [links]

**Post 3 — Instagram/Facebook (household decision-maker)**
*(Rewritten 2026-07-28: the previous version pitched multi-stop trip savings
— that's the Trip Optimizer, gated off in v1. Re-pitch it when 1.x ships the
paid tier.)*
> One list, whole family, zero group texts 🛒
>
> Add it on your phone, it's on your partner's in the aisle. PantryRun keeps
> your family's grocery list in sync — end-to-end encrypted, no account, no
> ads. Turn on prices and it matches this week's flyer deals to what's
> already on your list.
>
> Free on iPhone & Android. #grocerylist #familylife #privacy

---

## 3. Promo channels, ranked

| # | Channel | Why this rank | Concrete first move |
|---|---|---|---|
| 1 | **r/selfhosted + r/privacy + r/degoogle** | The only audience that fully values the differentiator and tolerates v1 rough edges; self-hosters become evangelists and free QA | Post 2 above; be present in comments for 48h; add relay `docker-compose` one-liner to README first |
| 2 | **Hacker News (Show HN)** | E2EE + CRDTs + self-hosting + honest threat-model doc is exactly HN-shaped; one good thread outperforms months of ads | "Show HN: PantryRun – E2EE family grocery list you can self-host". Link the threat model, disclose the flyer-channel caveat up front — HN rewards honesty |
| 3 | **Product Hunt** | Broader early-adopter reach; privacy products chart well | Launch AFTER the Reddit/HN feedback round fixes the top usability items; ship with real screenshots |
| 4 | **Privacy-recommendation lists** (PrivacyGuides forum, AlternativeTo, awesome-privacy / awesome-selfhosted GitHub lists) | Durable, compounding discovery — people search "private AnyList alternative" | Submit to AlternativeTo as alternative to AnyList/Bring!/OurGroceries; PR to awesome-selfhosted |
| 5 | **Frugal/couponing communities** (r/Frugal, r/EatCheapAndHealthy, PF Canada subs) | The flyer-deals story lands here; bigger but less differentiated audience | Post a real "scanned this week's flyer, matched $X of deals to my list" walkthrough with screenshots — value-first, not launch-y. (The multi-stop "saved $X across 2 stores" story is the gated Trip Optimizer — save it for the 1.x paid-tier launch) |
| 6 | **YouTube self-hosting channels** (e.g., the Docker/homelab reviewers) | High-trust, evergreen installs; they need a working `docker-compose` demo | Offer early access + a 5-minute setup script; wait until managed tier exists for their non-technical viewers |
| 7 | Paid ads (ASA/Google App Campaigns) | **Not yet** — CAC will exceed $0 revenue in a free v1; revisit when the premium tier launches | — |

**Sequencing note:** channels 1-2 first (they also double as beta QA), fix
what they find, then 3-5 in the same week for the compounding-launch effect.
