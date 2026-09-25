# Kitna Hua?

India's daily grocery price guessing game. Every morning there's a new basket of 6–8 everyday items with real DMart Ready prices. Guess the basket total in four tries. After each guess you get a nudge, never the answer.

Inspired by [Daily Shop](https://dailyshopgame.co.uk/), the UK original.

## How it works

```
Mac (hourly check)    scripts/fetch-catalog.mjs  →  data/catalog.json   (~1,500 products with current prices)
GitHub (05:47 IST)    scripts/make-shop.mjs      →  public/shops.json   (today's basket appended, prices frozen)
                      public/                    →  GitHub Pages         (static site, no build step)
```

- **Prices** come from a small job on a Mac, not from GitHub: DMart blocks GitHub's servers. The job checks every hour and fetches new prices once the ones on `main` are over 12 hours old, then pushes `data/catalog.json`. See [Mac price job](#mac-price-job).
- **The daily shop** is made by a GitHub Action (`.github/workflows/daily.yml`) at 05:47 IST, using the freshest prices on `main`. It commits `public/shops.json` and redeploys the site. If the Mac hasn't fetched for a while, the shop still appears with older prices, and the Action logs a warning once they're over 48 hours old.
- **Where prices come from:** DMart Ready category pages. They're server-rendered and embed each product's name, pack size, MRP and selling price, so no private API or login is involved. Each fetch is 27 requests, one at a time, with a pause between each.
- **Baskets** are seeded by the date, so they're reproducible. Each one is shaped like a real shop: one fresh item, one dairy, two staples, one packaged food, and a drink, household or personal-care item, plus 0–2 extras. No product repeats within 21 days, and the total stays between ₹450 and ₹2,200.
- **Past shops** keep the prices from their own day, so the archive stays playable.
- **Progress and stats** stay in the player's browser (`localStorage`). There's no backend.

### Nudges

| Your guess is… | Nudge |
|---|---|
| exact, to the rupee | Exactly right 🎯 (game over, you win) |
| within 3% | Very close (no direction given) |
| within 10% | A little higher / lower |
| within 20% | Higher / Lower |
| further off | Much higher / lower |

Score = accuracy of your best guess (100% − percentage error).

## Put it on GitHub

1. Create a new repo and push this folder to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Daily shop → Run workflow** to publish right away. After that it runs every morning on its own.
4. On a Mac that's usually on, run `scripts/mac/install.sh` so prices keep refreshing.

The site will be at `https://<you>.github.io/<repo>/`.

## Mac price job

```bash
scripts/mac/install.sh              # install, or update after changing install.sh
scripts/mac/install.sh --uninstall  # remove
tail -f ~/Library/Logs/kitna-hua.log
```

- **When it runs:** a launchd job checks every hour at :07. If the Mac was asleep, it runs as soon as it wakes. Most checks just log `prices are Nh old; nothing to do`.
- **When it fetches:** once the prices on `main` are over 12 hours old. It fetches, commits `data/catalog.json` and pushes. Pushes that only change `data/` don't redeploy the site.
- **Where it works:** in its own copy of the repo at `~/Library/Application Support/kitna-hua/repo`, which it resets to `main` before every fetch. It never touches your working copy, and background jobs can't read `~/Documents` without extra macOS permissions anyway. Changes to `refresh-prices.sh` reach the job on its next fetch. Changes to `install.sh` need it re-run.
- **If fetching keeps failing:** you get a macOS notification once prices are 36 hours old, at most once a day.
- **To fetch right now:** `touch ~/Library/Application\ Support/kitna-hua/force-refresh`. The next hourly check will fetch whatever the age.
- **What it needs:** the Mac logged in, a connection DMart doesn't block, and git able to push to GitHub (the job uses your Keychain login).

## Run locally

```bash
npm run daily   # fetch prices and make today's shop
npm run dev     # serve public/ at http://localhost:8000
```

`node scripts/make-shop.mjs --date 2026-10-01` makes a shop for a given day. Add `--force` to re-roll a day that already exists.

## Tuning

- **Basket shape, price limits, repeat window:** constants at the top of `scripts/make-shop.mjs`.
- **Which categories are fetched:** `CATEGORIES` in `scripts/fetch-catalog.mjs`.
- **Nudge thresholds:** `BANDS` at the top of `public/app.js`.
- **New-shop time shown in the countdown:** `NEW_SHOP_HOUR_IST` in `public/app.js`. Keep it in step with the cron in the workflow.

## Caveats

- **Why DMart rather than Blinkit, Zepto or Instamart:** those three (and BigBasket) put every automated request behind a bot check, wherever it comes from, including a Mac at home. Instamart's, for example, is Amazon's firewall asking the client to run a JavaScript challenge. Their prices also depend on your pincode and nearest dark store, so there's no single national price to guess. DMart Ready serves full product data in plain HTML, and its `robots.txt` allows category pages. It only blocks some server networks, GitHub's among them, which is why prices are fetched from a Mac. Adding another source means writing a fetcher that outputs the same catalog shape.
- **Prices are for one store (Mumbai, Andheri),** the default a signed-out visitor sees. The footer says so.
- **Terms:** read DMart's terms of use before you promote this publicly. Keep the "not affiliated" footer. Product images are hotlinked from DMart's CDN. If that ever breaks or they object, the game falls back to category emoji.
- **If DMart changes its page format or blocks the Mac,** the fetch fails loudly and the last good catalog stays on `main`. Shops keep appearing with older prices until it's fixed, and the footer shows the date the prices are from.
- **The answer is in `shops.json`,** as with most daily web games. Anyone with dev tools can peek, but it's a game.
- **A useful by-product:** `data/catalog.json` is committed each time prices refresh, so git history builds up a price record for ~1,500 grocery items.
