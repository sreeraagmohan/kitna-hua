// Picks today's basket from data/catalog.json and appends it to public/shops.json.
//
// Prices are frozen into the shop when it is made, so past shops stay playable
// even after the catalog moves on. The pick is seeded by the date, so re-running
// on the same day gives the same basket, and a day that already has a shop is
// left alone unless --force is passed.
//
// Usage: node scripts/make-shop.mjs [--date YYYY-MM-DD] [--force]

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "data", "catalog.json");
const SHOPS = path.join(ROOT, "public", "shops.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const istDate = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const date = option("--date") || istDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad --date: ${date}`);

// Basket shape: every shop gets these, plus 0–2 extras from anywhere.
const SLOTS = ["fresh", "dairy", "staples", "staples", "packaged", ["drinks", "home", "personal"]];
const EXTRA_GROUPS = ["fresh", "dairy", "staples", "packaged", "packaged", "drinks", "home", "personal"];
const GROUP_ORDER = ["fresh", "dairy", "staples", "packaged", "drinks", "home", "personal"];

const MIN_ITEM = 10_00; // paise
const MAX_ITEM = 650_00;
const MIN_TOTAL = 450_00;
const MAX_TOTAL = 2200_00;
const NO_REPEAT_SHOPS = 21; // a product can't reappear within this many shops

// mulberry32, seeded from a string hash
function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
let archive;
try {
  archive = JSON.parse(await readFile(SHOPS, "utf8"));
} catch {
  archive = { shops: [] };
}

const existing = archive.shops.findIndex((s) => s.date === date);
if (existing !== -1 && !flag("--force")) {
  console.log(`Shop #${archive.shops[existing].no} for ${date} already exists; nothing to do.`);
  process.exit(0);
}

const recent = new Set(
  archive.shops
    .filter((s) => s.date < date)
    .slice(-NO_REPEAT_SHOPS)
    .flatMap((s) => s.items.map((i) => i.productId)),
);

const pool = {};
for (const p of catalog.products) {
  if (p.price < MIN_ITEM || p.price > MAX_ITEM || recent.has(p.productId)) continue;
  (pool[p.group] ||= []).push(p);
}

function pickBasket(random) {
  const pickFrom = (list) => list[Math.floor(random() * list.length)];
  const slots = [...SLOTS];
  const extras = Math.floor(random() * 3);
  for (let i = 0; i < extras; i++) slots.push(pickFrom(EXTRA_GROUPS));

  const items = [];
  const usedProducts = new Set();
  const usedCategories = new Set();
  for (const slot of slots) {
    const group = Array.isArray(slot) ? pickFrom(slot) : slot;
    // one product per category, so no basket of two dals or three chocolates
    const candidates = (pool[group] || []).filter(
      (p) => !usedProducts.has(p.productId) && !usedCategories.has(p.category),
    );
    if (!candidates.length) continue;
    const p = pickFrom(candidates);
    usedProducts.add(p.productId);
    usedCategories.add(p.category);
    items.push(p);
  }
  return items;
}

const random = rng(`kitna-hua:${date}`);
let items;
for (let attempt = 0; attempt < 200; attempt++) {
  items = pickBasket(random);
  const total = items.reduce((sum, i) => sum + i.price, 0);
  if (items.length >= 6 && total >= MIN_TOTAL && total <= MAX_TOTAL) break;
}
items.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

const shop = {
  no: existing !== -1 ? archive.shops[existing].no : (archive.shops.at(-1)?.no ?? 0) + 1,
  date,
  store: catalog.source,
  location: catalog.location,
  pricesAt: catalog.fetchedAt,
  total: items.reduce((sum, i) => sum + i.price, 0),
  mrpTotal: items.reduce((sum, i) => sum + i.mrp, 0),
  items: items.map(({ productId, name, brand, size, price, mrp, image, category, group }) => ({
    productId,
    name,
    brand,
    size,
    price,
    mrp,
    image,
    category,
    group,
  })),
};

if (existing !== -1) archive.shops[existing] = shop;
else archive.shops.push(shop);
archive.shops.sort((a, b) => a.date.localeCompare(b.date));

await writeFile(SHOPS, JSON.stringify(archive, null, 1) + "\n");
console.log(`Shop #${shop.no} for ${date}: ${shop.items.length} items, ₹${shop.total / 100}`);
for (const i of shop.items) console.log(`  ₹${String(i.price / 100).padStart(4)}  ${i.name} (${i.size})`);
