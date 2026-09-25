// Fetches DMart Ready category pages and writes data/catalog.json.
//
// DMart's category pages are server-rendered (Next.js) and embed the first page
// of products — name, pack size, MRP and selling price — in the RSC payload.
// We read that payload rather than calling any private API. One request per
// category, sequential, with a pause between them. Runs once a day.
//
// Usage: node scripts/fetch-catalog.mjs

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "catalog.json");

const USER_AGENT =
  process.env.FETCH_USER_AGENT ||
  "Mozilla/5.0 (compatible; KitnaHuaBot/0.1; daily price guessing game; fetches once a day)";
const PAUSE_MS = 1500;
const MIN_PRODUCTS = 200; // below this we assume the page format changed and keep the old catalog

// group = which slot of the basket a product can fill (see make-shop.mjs)
const CATEGORIES = [
  ["dairy", "dairy-and-beverages/dairy-aesc-dairy"],
  ["fresh", "fruits-and-vegetables/vegetables-aesc-vegetables"],
  ["fresh", "fruits-and-vegetables/fresh-fruits-aesc-freshfruits"],
  ["staples", "groceries/flours---grains-aesc-floursandgrains4"],
  ["staples", "groceries/rice---rice-products-aesc-riceandriceproducts4"],
  ["staples", "groceries/dals-aesc-dals"],
  ["staples", "groceries/cooking-oil-aesc-cookingoil"],
  ["staples", "groceries/masala---spices-aesc-masalaandspices4"],
  ["staples", "groceries/salt---sugar---jaggery-aesc-saltsugarjaggery4"],
  ["staples", "groceries/ghee---vanaspati-aesc-gheeandvanaspati"],
  ["packaged", "packaged-foods/biscuits---cookies-aesc-biscuitsandcookies"],
  ["packaged", "packaged-foods/snacks---farsans-aesc-snacksandfarsans"],
  ["packaged", "packaged-foods/pasta---noodles-aesc-pastaandnoodles"],
  ["packaged", "packaged-foods/chocolates---candies"],
  ["packaged", "packaged-foods/ketchup---sauce-aesc-ketchupandsauces"],
  ["packaged", "packaged-foods/breakfast-cereals-aesc-breakfastcereals"],
  ["packaged", "packaged-foods/pickles-aesc-pickles"],
  ["drinks", "dairy-and-beverages/beverages-aesc-beverages/tea-aesc-teasc2"],
  ["drinks", "dairy-and-beverages/beverages-aesc-beverages/coffee-aesc-coffeesc2"],
  ["drinks", "dairy-and-beverages/beverages-aesc-beverages/soft-drinks-aesc-soft-drinkssc2"],
  ["drinks", "dairy-and-beverages/beverages-aesc-beverages/juices-aesc-juicessc2"],
  ["home", "home-and-bathroom-cleaners/detergent---fabric-care-aesc-detergentsandfabriccare"],
  ["home", "home-and-bathroom-cleaners/utensil-cleaners-aesc-utensilcleaners"],
  ["home", "home-and-bathroom-cleaners/cleaners-aesc-cleaners"],
  ["personal", "personal-care-beauty/oral-care-aesc-oralcare"],
  ["personal", "personal-care-beauty/bath-body"],
  ["personal", "personal-care-beauty/hair-care-208506--1"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Concatenate the self.__next_f.push([1,"..."]) string chunks into one payload.
function flightPayload(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = "";
  for (const m of html.matchAll(re)) out += JSON.parse(`"${m[1]}"`);
  return out;
}

// Slice the JSON object that starts at the first "{" after `key`, respecting strings.
function extractObject(text, key) {
  const at = text.indexOf(key);
  if (at === -1) return null;
  const start = text.indexOf("{", at);
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

const toPaise = (s) => Math.round(parseFloat(s) * 100);

function normalise(product, group, categoryPath) {
  const skus = product.sKUs || [];
  return skus
    .filter((s) => s.buyable === "true" && s.availabilityType === "A" && s.bulk !== "Y")
    .map((s) => {
      const [namePart, sizePart] = s.name.split(/\s+:\s+/);
      return {
        id: s.skuUniqueID,
        productId: product.productId,
        name: namePart.trim(),
        brand: product.manufacturer || "",
        size: (sizePart || s.variantTextValue || "").trim(),
        price: toPaise(s.priceSALE),
        mrp: toPaise(s.priceMRP),
        image: s.productImageKey
          ? `https://cdn.dmart.in/images/products/${s.productImageKey}_${s.imgCode || 5}_P.jpg`
          : null,
        category: (product.categoryMap || []).map((c) => c.name).at(-1) || "",
        group,
        defaultVariant: s.defaultVariant === "Y",
        source: categoryPath,
      };
    })
    .filter((p) => Number.isFinite(p.price) && p.price > 0);
}

async function fetchCategory(categoryPath) {
  const url = `https://www.dmart.in/category/${categoryPath}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-IN" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const plp = extractObject(flightPayload(await res.text()), '"plpData":');
  if (!plp?.products) throw new Error("no plpData in page");
  return plp.products;
}

const products = new Map();
const failures = [];
for (const [group, categoryPath] of CATEGORIES) {
  try {
    const list = await fetchCategory(categoryPath);
    let added = 0;
    for (const p of list) {
      for (const item of normalise(p, group, categoryPath)) {
        if (!products.has(item.id)) {
          products.set(item.id, item);
          added++;
        }
      }
    }
    console.log(`ok   ${group.padEnd(8)} ${String(added).padStart(3)} skus  ${categoryPath}`);
  } catch (err) {
    failures.push(categoryPath);
    console.warn(`FAIL ${group.padEnd(8)} ${categoryPath}: ${err.message}`);
  }
  await sleep(PAUSE_MS);
}

if (products.size < MIN_PRODUCTS) {
  let previous = "none";
  try {
    previous = JSON.parse(await readFile(OUT, "utf8")).fetchedAt;
  } catch {}
  console.error(`Only ${products.size} products fetched; keeping the existing catalog (fetched ${previous}).`);
  process.exit(1);
}

const catalog = {
  source: "DMart Ready",
  location: "Mumbai (Andheri)",
  fetchedAt: new Date().toISOString(),
  failedCategories: failures,
  products: [...products.values()],
};
await writeFile(OUT, JSON.stringify(catalog, null, 1) + "\n");
console.log(`\nWrote ${catalog.products.length} products to ${path.relative(ROOT, OUT)}`);
