# Kitna Hua?

India's daily grocery price guessing game. Every morning there's a new basket of 6–8 everyday items with real DMart Ready prices. Guess the basket total in four tries. After each guess you get a nudge, never the answer.

Inspired by [Daily Shop](https://dailyshopgame.co.uk/), the UK original.

## How it works

```
scripts/fetch-catalog.mjs  →  data/catalog.json   (~1,500 products with today's prices)
scripts/make-shop.mjs      →  public/shops.json   (today's basket appended, prices frozen)
public/                    →  GitHub Pages         (static site, no build step)
```

A GitHub Action (`.github/workflows/daily.yml`) runs at 05:47 IST. It fetches prices, makes the day's shop, commits both JSON files and redeploys the site.

- **Prices** are read from DMart Ready category pages. They're server-rendered and embed each product's name, pack size, MRP and selling price, so no private API or login is involved. That's 27 requests a day, one at a time, with a pause between each.
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

The site will be at `https://<you>.github.io/<repo>/`.

`public/shops.json` already has Shop No. 001 (25 Sep 2026). To start numbering from launch day, delete that file before your first run.

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

- **Why DMart rather than Blinkit, Zepto or Instamart:** those three (and BigBasket) block automated requests outright. Their prices also depend on your pincode and nearest dark store, so there's no single national price to guess. DMart Ready serves full product data in plain HTML, and its `robots.txt` allows category pages. Adding another source means writing a fetcher that outputs the same catalog shape.
- **Prices are for one store (Mumbai, Andheri),** the default a signed-out visitor sees. The footer says so.
- **Terms:** read DMart's terms of use before you promote this publicly. Keep the "not affiliated" footer. Product images are hotlinked from DMart's CDN. If that ever breaks or they object, the game falls back to category emoji.
- **If DMart changes its page format,** the fetch fails loudly and the last good catalog is kept, so a shop still appears that day with slightly older prices.
- **The answer is in `shops.json`,** as with most daily web games. Anyone with dev tools can peek, but it's a game.
- **A useful by-product:** `data/catalog.json` is committed every day, so git history builds up a daily price record for ~1,500 grocery items.
