# Store Listings — Name Check, Descriptions, Screenshots, Intro Video

Researched 2026-07-08. Complements `06-MARKETING-KIT.md` (social posts,
channels); this doc is the submission-ready listing package.

**Revised 2026-07-28 against the v1 binary** (post Trip Optimizer gating,
PR #15). Every feature claim below was checked against the shipping source.
Removed as unbacked: Trip Optimizer (gated off — paid tier, 1.x), item
claiming (CRDT plumbing exists but no UI path renders or triggers it), and
the Siri / hands-free section (`src/voice/siri.ts` has no runtime caller and
no iOS extension target; "voice input" is keyboard dictation into a prompt).
Qualified as opt-in: all price/deal features (`pricingOptedIn` defaults
false). "Open source" softened to source-available: the only LICENSE in the
repo is an Expo-template MIT stub crediting "650 Industries, Inc. (aka
Expo)" — not a deliberate license grant by the owner. §§1, 1b, 7 (name
checks) are unchanged except a domain-status correction in §7.

**Adversarially re-verified 2026-07-28** (second agent pass instructed to
refute the rewrite): all char counts confirmed within limits; remaining
risks are deployment preconditions, not copy — see the ⚠️ block in §2.

---

## 1. Name-collision check: "Grocery App"

**Google Play — TAKEN, verbatim.** An app literally titled "Grocery App"
exists: a grocery-delivery template app
(https://play.google.com/store/apps/details?id=com.mstoreapp.grocery).

**Apple App Store — no exact "Grocery App"** in results, but the space is
saturated with near-names: "Grocery - Smart Shopping List"
(apps.apple.com/us/app/grocery-smart-shopping-list/id1195676848), "Grocery
List" (id1359785050), "Grocery Shopping List - Alist" (id6739451339), plus
AnyList/Bring!/OurGroceries all carrying "Grocery" in their titles.

**Verdict: do NOT rename to "Grocery App".** It's already claimed on Play,
it's generic (weak/no trademark protection, unbrandable, un-searchable — you'd
be competing with every app containing the words "grocery app"), and Apple's
metadata rules disfavor generic keyword names.

## 1b. Name-collision check: "PantryRun" (checked 2026-07-28)

The app was renamed StopHop → **PantryRun** on 2026-07-28 at the owner's
request. The clearance analysis that used to sit above applied to *StopHop*
("Stop Hopper", the transit ride-share app
play.google.com/…/com.sparelabs.platform.rider.stophopper, and the delisted
HopStop); it said nothing about PantryRun and was removed rather than
re-pointed at a name it never examined. Fresh check below.

**⚠️ A direct same-category collision exists.** "Pantry Run" is a live product
at **app.pantry.run**, described in search results as a smart grocery shopping
list app with real-time sync, auto-categorisation by store section, and shared
lists. That is PantryRun's exact category *and* close to its exact feature set
— materially worse than the StopHop situation, where the nearest name was a
transit app in an unrelated category.

| Check | Result |
|---|---|
| App Store / Play listing named "PantryRun" or "Pantry Run" | **None found** in searches — the collision is currently a web app, not a store listing |
| `pantry.run` | **Taken and live** — resolves (AWS), Route 53 nameservers; this is the competing product |
| `pantryrun.com` | **Taken** — registered 2016-03-28, held by TurnCommerce/NameBright (a domain reseller), expiry 2027-03-28. Parked, so likely purchasable at reseller pricing |
| `pantryrun.app` | **Appears available** — no DNS records and no WHOIS registration record |
| Trademark | **Not searched.** A USPTO/CIPO word-mark search in the relevant classes is still outstanding and is the check that actually matters for a same-category name |

**Assessment.** The store name is probably obtainable (no competing listing
found), and `pantryrun.app` is free, which is enough to ship. But brand
confusion with an existing grocery-list product of the same name is a real
risk, `.com` is not free, and no trademark search has been run. §7's earlier
sweep had already eliminated **PantryPal** on domain grounds, so the "pantry"
space is demonstrably crowded.

**Before first submission:** run the USPTO/CIPO word-mark search, re-check the
store listings closer to launch, and decide whether to secure `pantryrun.app`.
Keep "Grocery" in the subtitle/title suffix for search:
`PantryRun: Family Grocery List`.

---

## 2. Apple App Store listing (copy-paste ready)

> **⚠️ SUBMISSION PRECONDITIONS — copy below is honest only once these are
> resolved. Do not paste it into either console before then:**
> 1. **A reachable relay must exist.** Sync AND every price/deal/flyer
>    feature route through the relay (`catalogClient`, `relay-extractor`,
>    enrollment tokens); the shipped default `relayUrl` is `ws://localhost`
>    and no hosted relay is deployed. An App Review tester who tries pairing
>    or prices gets dead features — Apple 2.1/2.3.1. Either deploy a hosted
>    relay before submission, or reframe the sync/price copy as
>    self-host-first. Owner decision.
> 2. **`groceryapp.app` currently does not resolve (NXDOMAIN).** The privacy
>    policy URL below is dead until the domain is registered and the policy
>    hosted (tracked in `03-GOOGLE-READINESS.md`); universal-link invites
>    and AASA/assetlinks hosting depend on the same domain. No
>    terms-of-service document exists in the repo — the copy says "Privacy
>    policy" only.
> 3. **Crash reporting**: the binary ships Sentry with `sentryEnabled`
>    defaulting to true (opt-out, `src/services/sentry.ts`). It is inert
>    only while `EXPO_PUBLIC_SENTRY_DSN` is unset at build time. The "no
>    analytics, no tracking" bullet is true for DSN-less builds; if you set
>    the DSN for release, amend that bullet AND the data-safety/privacy
>    forms in the same change.

| Field | Value | Limit |
|---|---|---|
| **Name** | `PantryRun: Family Grocery List` | **30/30 — at the cap, no slack** |
| **Subtitle** | `Private family grocery lists` | 28/30 |
| **Promotional text** | `Your family's grocery list, end-to-end encrypted. Works offline, syncs across your household, and — when you opt in — compares local flyer prices. Your data stays yours.` | 169/170 |
| **Keywords** | `grocery,shopping list,family,shared list,price compare,flyer,deals,private,encrypted,offline,pantry` | 99/100 |
| **Category** | Primary: Shopping · Secondary: Food & Drink | |
| **Age rating** | 4+ | |

Changes from the pre-revision draft: subtitle dropped "& prices" (prices are
opt-in and off by default — not a headline claim); promo text dropped "find
which stores save you the most" (that is the Trip Optimizer's output, gated
off in v1); keywords dropped `meal` (no meal feature exists anywhere in v1 —
an Apple 2.3.7 irrelevant-keyword risk) in favor of `offline` (real,
default-on). `pantry` stays — defensible via the app name.

**Description** (≤4000 chars; ~1,500 used):

> **The grocery list that respects your family's privacy.**
>
> PantryRun keeps your household's shopping in sync — without accounts, ads,
> or anyone reading your data. Lists are end-to-end encrypted on your device;
> not even the sync server can see what's on them.
>
> SHARED FAMILY LISTS
> Add "milk" on your phone; it appears on your partner's in the store aisle.
> Works fully offline — changes sync when you're back online.
>
> ACTUALLY PRIVATE
> • End-to-end encrypted sync (XChaCha20-Poly1305)
> • No account, no email, no phone number — ever
> • No ads, no analytics, no tracking
> • Prefer full control? The sync server's source is on GitHub — run it in
>   your own home.
>
> PAY LESS FOR THE SAME CART (optional — everything here is off until you
> turn it on)
> • See local prices next to your list items
> • Add a photo of a store flyer — AI reads the deals into your price list
> • Weekly flyer deals matched to what's already on your list, for your area
>
> YOUR KEYS, YOUR DATA
> A 12-word recovery phrase — like a crypto wallet, but for your grocery
> list. It gets you back in on a new phone, and your family's shared list
> syncs right back.
>
> PantryRun is built for households that think a grocery list shouldn't be
> anyone else's business.
>
> Privacy policy: https://groceryapp.app/privacy

**Accuracy guardrails (Apple 2.3.1) — the claims we deliberately do NOT
make, and why. Checked against the v1 source 2026-07-28; re-verify before
any copy change:**
- **No Trip Optimizer / "which stores save you most" / multi-stop savings**
  anywhere: `TRIP_OPTIMIZER_ENABLED = false` in
  `GroceryApp/src/screens/GroceryListScreen.tsx` — paid-tier feature, 1.x.
- **No Siri / Shortcuts / hands-free / voice claims**: `src/voice/siri.ts`
  has no runtime caller and no iOS Intents extension target exists. The
  in-app "voice input" is keyboard dictation into a text prompt (iOS) or a
  paste-text modal (Android) — not hands-free.
- **No item-claiming claims** ("claim items so two people don't buy the same
  thing"): the sync plumbing exists but no UI renders or triggers it.
- **No Alexa/Google Assistant, no "premium/subscription", no managed-cloud
  plan** (all hidden/off in v1: `MANAGED_TIER_ENABLED`,
  `VOICE_ASSISTANT_LINKING_ENABLED`, relay `ASSISTANT_INTEGRATION` unset).
- **All price/deal/flyer claims stay marked optional**: `pricingOptedIn`
  defaults false and gates every price path (AC-14). Deals additionally need
  a postal area (FSA) and relay enrollment.
- **Say "source is on GitHub", not "open source"**: the only LICENSE file in
  the repo (`GroceryApp/LICENSE`) is an Expo-template MIT stub whose
  copyright line reads "650 Industries, Inc. (aka Expo)" — a scaffolding
  artifact, not a deliberate grant by the owner, and it attributes the code
  to the wrong party. Replace it with a real license under the owner's name,
  then upgrade the wording.
- **"Add a photo of a store flyer"** — keep this wording until the
  camera-capture fix is device-verified, then "Snap a photo" is fine.
- **Recovery phrase**: say "12-word recovery phrase"; do NOT say
  "BIP39-compatible" — the checksum deliberately deviates from BIP39
  (`src/identity/recovery.ts`), so third-party wallet tools will not accept
  it.
- **Sync AND all price/deal/flyer features need a reachable relay, and v1
  preconfigures none** (default `relayUrl` is `ws://localhost`; price/deal
  lookups go through the relay catalog, flyer extraction through the relay's
  extract endpoint, both behind relay enrollment). A family syncs — and the
  opt-in price features return data — only after someone runs the relay (or
  the owner deploys a hosted one before launch). The copy frames
  self-hosting as a choice — if no hosted relay ships, revisit that framing.
  **Owner decision needed before submission — see the ⚠️ preconditions
  block at the top of this section.**

---

## 3. Google Play listing (copy-paste ready)

| Field | Value | Limit |
|---|---|---|
| **Title** | `PantryRun: Family Grocery List` | **30/30 — at the cap, no slack** |
| **Short description** | `Private, encrypted family grocery lists. Offline-first, opt-in local prices.` | 76/80 |
| **Category** | Shopping · Tags: shopping list, family organizer | |
| **Content rating** | Everyone | |

**Full description** (≤4000): use the Apple description above **verbatim** —
with the hands-free section removed there is no longer any platform-specific
line to strip. Play allows light formatting/emoji; the 🛒🔒💰 emoji-header
variant in `06-MARKETING-KIT.md` (kept in sync with this doc as of
2026-07-28) is fine here if you prefer it.

---

## 4. Screenshots — plan + production

**Honesty rule first:** Apple 2.3.3 and Play metadata policy require
screenshots of the *actual running app*. Nothing has been captured yet because
the app hasn't been run on a device/simulator this cycle — so this is a
shot list + capture pipeline, deliberately not fabricated mockups.

### Required sizes
- **iOS:** 6.9" (1320×2868) required; 6.5" (1284×2778) recommended.
  **iPad 13" (2064×2752) is required while `supportsTablet: true`** — either
  capture iPad shots or flip `supportsTablet` to false for v1 (one line in
  app.json; recommended if you don't want to polish iPad layout now).
- **Android:** phone screenshots min 1080px wide, 9:16 (min 2, max 8), plus
  **feature graphic 1024×500** (required; no text near edges — it gets
  cropped in some placements).

### The 8 shots (same narrative both stores; caption strip on each)
| # | Screen to capture | Caption overlay |
|---|---|---|
| 1 | GroceryListScreen with a realistic 10-item list, 2 checked off | **Your family's list, always in sync** |
| 2 | Two-device composite (or notification moment): item appears on second phone | **Add milk here, it shows up there** |
| 3 | List with per-item prices and category subtotals (enable the pricing opt-in and seed prices first) | **See local prices on your list** |
| 4 | Store cards row showing per-store totals for the list (same seeded prices) | **Compare store totals at a glance** |
| 5 | FlyerScanFlow result: "14 prices captured from [store]" | **Add a photo of a flyer, get the deals** |
| 6 | PrivacyScreen ("How Your Data Is Handled" card) | **Encrypted end-to-end. No account. No ads.** |
| 7 | Pairing QR screen (with dummy QR) | **Invite family with one QR code** |
| 8 | Recovery phrase screen (blur/dummy words!) | **Your keys, your data — 12 words** |

Capture notes, learned from the source (2026-07-28):
- Former shot 4 (Trip Plan sheet) is **removed**: that UI is gated off in v1
  (`TRIP_OPTIMIZER_ENABLED = false`) — capturing it would mean flipping a
  build flag to photograph a feature users cannot reach, which violates the
  honesty rule below as well as Apple 2.3.3. Replaced with the store-cards
  totals row, which is real v1 UI (`StoreCard` in `GroceryListScreen.tsx`).
- Shot 3's old subject named "price badges + store totals bar" — **both are
  dead components** (`PriceBadge` and `StoreTotalBar` are imported/rendered
  nowhere). Real v1 price UI is: per-item price via `ItemRow`'s `price`
  prop, category subtotals, and the store-cards row.
- Shots 3–5 require Settings → the pricing opt-in first, plus seeded price
  data (a scanned flyer or relay catalog). Budget setup time for this.
- Shot 8 is now the easiest: a **fresh install shows the recovery screen by
  itself** (first-run backup prompt, PR #15). Use dummy/blurred words.
- Shot 5's caption now says "Add a photo" — the old "Point at a flyer"
  contradicted this doc's own guardrail (camera capture not yet
  device-verified).

Seed data for shots: use a plausible weekly list (milk, eggs, bread, chicken
thighs, bananas, coffee…) and CAD prices; set device clock to a clean time,
full battery, no notifications (iOS: `xcrun simctl status_bar override`).

### Capture pipeline
```bash
# iOS (after eas build or local prebuild)
npx expo run:ios --device "iPhone 16 Pro Max"   # 6.9" class
xcrun simctl status_bar "iPhone 16 Pro Max" override --time "9:41" --batteryState charged --batteryLevel 100
xcrun simctl io booted screenshot shot1.png

# Android
npx expo run:android   # Pixel-class emulator, 1080×2400+
adb exec-out screencap -p > shot1.png
```
Frame + caption the raw captures with any device-frame tool (e.g. Figma with
Apple's device frames, or `fastlane frameit`). Keep caption text in the top
1/4, 44pt+, same accent color as the app (#10B981).

### Feature graphic (Play, 1024×500)
Dark background (#0B0F19), app icon left, headline right:
"**Private family grocery lists** — with price superpowers". No screenshot
inside it (crops badly at small sizes).

---

## 5. Short intro video

- **Apple App Preview:** 15–30s, portrait, uploaded per size class; must be
  ~entirely on-device screen recording (no hands/lifestyle footage); audio
  optional (assume muted autoplay). Capture with `xcrun simctl io booted
  recordVideo` or QuickTime from a real device.
- **Google Play:** a YouTube link on the listing; same footage works, can add
  a 1s logo bumper.

### 30-second storyboard (screen recording + text overlays, no voiceover)
| Time | On screen (real app) | Text overlay |
|---|---|---|
| 0–3s | Logo splash → Home | **PantryRun** — the private family grocery list |
| 3–8s | Type "milk", "eggs", quick-add; check one off (satisfying tick) | Fast lists. Works offline. |
| 8–13s | Cut: second device — the same items appear | Syncs with your family — **end-to-end encrypted** |
| 13–18s | Per-item prices + category subtotals appear (pricing opt-in pre-enabled for the recording) | See local prices while you plan |
| 18–24s | Scroll the store cards row: per-store totals for the same list | Compare **store totals** at a glance |
| 24–28s | Flyer photo → "14 prices captured" | Add a flyer photo. Get the deals. |
| 28–30s | Privacy screen card → end card: icon + name | No account. No ads. **End-to-end encrypted.** |

(The 18–24s beat previously showed the Trip Plan sheet — removed for the
same reason as screenshot 4: that UI is gated off in the v1 binary. The end
card previously said "Your data stays home", which the same video's opt-in
price/flyer scenes contradict — those features do send queries and photos
off-device once enabled.)

Production notes: record at 60fps, trim taps to feel instant (cut dead time),
end card is the only non-screen frame Apple tolerates (~1s, static). One
recording session can yield the video AND all 8 screenshots — do it right
after the two-device smoke test, since that setup (two paired simulators/
devices with seeded data) is exactly what shots 2 and the 8–13s scene need.

---

## 6. Prerequisites recap (from the readiness checklists)
Screenshots/video are the last asset gap on both stores' checklists
(`02-APPLE-READINESS.md`, `03-GOOGLE-READINESS.md`). Everything here assumes
the same session as the two-device smoke test — one afternoon: smoke test →
seed data → capture screenshots → record video → frame/caption → upload.

---

## 7. Friendlier name candidates (verified 2026-07-08)

Store search (both stores) + live domain checks. "Store hits" = any existing
app found under that name.

| Candidate | Vibe | Store hits | .app domain | .com | Verdict |
|---|---|---|---|---|---|
| **CartNest** | warm — nest = home/family | none found | ✅ available | ✅ available | **Top pick** — only candidate with both domains free; obvious icon (nest+cart) |
| **SnugCart** | coziest, most playful | none found | ✅ available | — | Strong #2 — friendliest word, says feeling not function |
| **KinCart** | family-forward ("kin") | none found | ✅ available | ❌ taken | Solid #3 |
| HomeCart | friendly but plain | none found | ✅ available | — | OK; generic-adjacent, delivery-service confusion risk |
| ToteCart | neutral | none | ✅ available | — | Clunky to say |
| ~~CartHop~~ | — | **direct competitor** (carthop.store: multi-store price splitting!) | ❌ | — | Eliminated |
| ~~Basketful~~ | — | live grocery-list app (Play co.basketful.basketful + iOS) | ✅ | — | Eliminated |
| ~~Grocery App~~ | — | taken verbatim on Play; generic | — | — | Eliminated |
| ~~PantryPal / Cartly / MilkRun / Grocerly / OurCart / ListNest / FamCart~~ | — | domains taken → brands occupied | ❌ | — | Eliminated |

Registration (user action — do not auto-purchase):
- cartnest.app / cartnest.com: godaddy.com/domainsearch/find?domainToCheck=cartnest.app
- snugcart.app: godaddy.com/domainsearch/find?domainToCheck=snugcart.app
- kincart.app: godaddy.com/domainsearch/find?domainToCheck=kincart.app

**Rename cost (pre-launch = cheap):** display name lives in app.json
(`name`, listing titles) + marketing docs. **Superseded 2026-07-28:** this
section previously advised that the bundle id was user-invisible and could
stay. The owner renamed it anyway, so the id is now
`com.shiftlogichq.pantryrun` (namespace, applicationId, `android.package`, the
iOS app group, `assetlinks.json` `package_name`, the AASA `appID` suffix, and
the `java/com/shiftlogichq/pantryrun/` source dir). Any *further* id change
must still happen BEFORE first submission — iOS locks it after. Invite-link
domain is brand-neutral (`groceryapp.app`) — but note it **currently does
not resolve (NXDOMAIN, checked 2026-07-28)**: universal-link invites and
AASA/assetlinks hosting need it registered and live before launch
(custom-scheme invites work without it). If switching to cartnest.app for
links, update `associatedDomains`, AASA, assetlinks + DEEP-LINK-HOSTING.md.
Listing copy: "CartNest: Family Grocery List" = 29 chars — fits.
