import { posterBlob } from "./poster.js";

const STORE_KEY = "kitnahua.v1";
const SEEN_HELP_KEY = "kitnahua.seenHelp";
const MAX_GUESSES = 4;
const NEW_SHOP_HOUR_IST = 6;
const IST_OFFSET_MS = 5.5 * 3600e3;

// Nudge bands, tightest first. `pct` is the max % error for the band.
const BANDS = [
  { id: "close", pct: 3, emoji: "🟩", label: () => "Very close" }, // direction deliberately hidden
  { id: "little", pct: 10, emoji: "🟨", label: (d) => (d === "higher" ? "A little higher" : "A little lower") },
  { id: "off", pct: 20, emoji: "🟧", label: (d) => (d === "higher" ? "Higher" : "Lower") },
  { id: "far", pct: Infinity, emoji: "🟥", label: (d) => (d === "higher" ? "Much higher" : "Much lower") },
];
const EXACT = { id: "exact", emoji: "🎯", label: () => "Exactly right" };
const GROUP_EMOJI = { fresh: "🥬", dairy: "🥛", staples: "🌾", packaged: "🍪", drinks: "☕", home: "🧽", personal: "🧴" };
const ARROW = {
  higher: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  lower: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
};

const inr = new Intl.NumberFormat("en-IN");
const rupees = (paise) => "₹" + inr.format(Math.round(paise / 100));
const pad = (n) => String(n).padStart(3, "0");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const formatDate = (iso, opts) =>
  new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...opts });
const istToday = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const $app = document.getElementById("app");
const $footer = document.getElementById("footer");
let shops = [];
let state = loadState();
let countdownTimer = null;

// ---------- storage ----------

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.progress) return s;
  } catch {}
  return { progress: {} };
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
}
function progressFor(shop) {
  return (state.progress[shop.no] ||= { guesses: [], done: false, onDay: false });
}

// ---------- scoring ----------

function feedback(guess, total) {
  if (guess === total) return { band: EXACT, dir: null };
  const diff = Math.abs(guess - total);
  const band = BANDS.find((b) => 100 * diff <= b.pct * total);
  return { band, dir: band.id === "close" ? null : guess < total ? "higher" : "lower" };
}

function score(guesses, total) {
  const best = guesses.reduce((a, g) => (Math.abs(g - total) < Math.abs(a - total) ? g : a));
  const exact = best === total;
  const accuracy = Math.max(0, 100 - (Math.abs(best - total) / total) * 100);
  // never show 100.0% for a near miss
  return { best, exact, accuracy, shown: exact ? "100" : Math.min(accuracy, 99.9).toFixed(1) };
}

function computeStats() {
  const latest = shops.at(-1);
  let played = 0, bullseyes = 0, accSum = 0, bestAcc = 0, run = 0, bestRun = 0;
  for (const shop of shops) {
    const p = state.progress[shop.no];
    if (p?.done && p.onDay) {
      const s = score(p.guesses, shop.total);
      played++;
      accSum += s.accuracy;
      bestAcc = Math.max(bestAcc, s.accuracy);
      if (s.exact) bullseyes++;
      bestRun = Math.max(bestRun, ++run);
    } else if (shop !== latest) {
      run = 0; // today's shop not being played yet doesn't break the streak
    }
  }
  return { played, bullseyes, streak: run, bestStreak: bestRun, avg: played ? accSum / played : 0, bestAcc };
}

// ---------- rendering ----------

function pill(f) {
  return `<span class="pill band-${f.band.id}">${f.dir ? ARROW[f.dir] : ""}${f.band.label(f.dir)}</span>`;
}

function thumb(item) {
  const emoji = GROUP_EMOJI[item.group] || "🛒";
  return item.image
    ? `<div class="thumb" data-emoji="${emoji}"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" width="52" height="52"></div>`
    : `<div class="thumb fallback" aria-hidden="true">${emoji}</div>`;
}

function priceCell(item, revealed) {
  if (!revealed) return `<span class="hidden-price" aria-label="Price hidden">₹??</span>`;
  const mrp = item.mrp > item.price ? `<span class="mrp" aria-label="MRP">${rupees(item.mrp)}</span>` : "";
  return `${mrp}<span class="sp">${rupees(item.price)}</span>`;
}

function itemsHtml(shop, revealed) {
  return shop.items
    .map(
      (item, i) => `
      <li class="item" style="--i:${i}">
        ${thumb(item)}
        <div>
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">${[item.brand, item.size].filter(Boolean).map(escapeHtml).join(" · ")}</div>
        </div>
        <div class="item-price">${priceCell(item, revealed)}</div>
      </li>`,
    )
    .join("");
}

function useEmojiOnImageError(root) {
  for (const img of root.querySelectorAll(".thumb img")) {
    const swap = () => {
      const box = img.parentElement;
      box.classList.add("fallback");
      box.textContent = box.dataset.emoji;
    };
    if (img.complete && img.naturalWidth === 0) swap();
    else img.addEventListener("error", swap, { once: true });
  }
}

function renderGame(shop) {
  const p = progressFor(shop);
  const isLatest = shop === shops.at(-1);
  const heading = isLatest
    ? "How much does today’s shop cost?"
    : `How much did the ${formatDate(shop.date, { day: "numeric", month: "long" })} shop cost?`;

  $app.innerHTML = `
    <section class="intro">
      <p class="eyebrow"><span class="tag">SHOP NO. ${pad(shop.no)}</span><span class="where">${escapeHtml(shop.store)}</span></p>
      <h1>${heading}</h1>
      <p>Four guesses. After each one you get a nudge, never the answer.</p>
    </section>
    <div class="receipt-wrap">
      <article class="receipt" id="receipt" aria-label="Today's basket">
        <header class="bill-head">
          <div class="store">${escapeHtml(shop.store)}</div>
          <div class="meta">${escapeHtml(shop.location)}</div>
          <div class="meta">${formatDate(shop.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${shop.items.length} items</div>
          <span class="note">Online selling prices · no delivery fee</span>
        </header>
        <ol class="items" id="items">${itemsHtml(shop, p.done)}</ol>
        <div class="total-row">
          <span class="label">Kitna hua?</span>
          <span class="amount mono ${p.done ? "" : "unknown"}" id="total">${p.done ? rupees(shop.total) : "₹????"}</span>
        </div>
        ${p.done ? "" : `<div class="total-hint">Total hidden. This is what you guess.</div>`}
      </article>
    </div>
    <section class="play" id="play"></section>`;

  useEmojiOnImageError($app);
  renderPlay(shop);
  renderFooter(shop);
}

function renderPlay(shop, { justGuessed = false } = {}) {
  const p = progressFor(shop);
  const $play = document.getElementById("play");

  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => {
    const g = p.guesses[i];
    if (g === undefined) {
      return `<li class="guess empty"><span class="n">${i + 1}</span><span class="amt">${p.done ? "Not needed" : "—"}</span><span></span></li>`;
    }
    const fresh = justGuessed && i === p.guesses.length - 1 ? " fresh" : "";
    return `<li class="guess${fresh}"><span class="n">${i + 1}</span><span class="amt">${rupees(g)}</span>${pill(feedback(g, shop.total))}</li>`;
  });

  const form = `
    <form class="guess-form" id="guess-form" novalidate>
      <label for="guess-input">Guess ${p.guesses.length + 1} of ${MAX_GUESSES}: the basket total</label>
      <div class="guess-row">
        <div class="money-input">
          <span class="rupee" aria-hidden="true">₹</span>
          <input id="guess-input" inputmode="numeric" autocomplete="off" enterkeyhint="go" placeholder="0" maxlength="8" aria-describedby="form-msg">
        </div>
        <button class="btn btn-primary" type="submit">Guess</button>
      </div>
      <p class="form-msg" id="form-msg" aria-live="assertive"></p>
    </form>`;

  $play.innerHTML = `
    ${p.done ? "" : form}
    <ol class="guesses" aria-label="Your guesses">${rows.join("")}</ol>
    ${p.done ? resultHtml(shop, p) : ""}`;

  if (p.done) {
    $play.querySelector("[data-share]").addEventListener("click", () => openShare(shop));
    startCountdown();
    return;
  }
  const $form = document.getElementById("guess-form");
  const $input = document.getElementById("guess-input");
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitGuess(shop, $input.value);
  });
  if (justGuessed) $input.focus();
}

function submitGuess(shop, raw) {
  const p = progressFor(shop);
  const $msg = document.getElementById("form-msg");
  const clean = raw.replace(/[₹,\s]/g, "");
  if (!/^\d+$/.test(clean)) return ($msg.textContent = "Enter a whole number of rupees, like 850.");
  const r = parseInt(clean, 10);
  if (r <= 0) return ($msg.textContent = "Sadly, groceries aren’t free.");
  if (r > 100000) return ($msg.textContent = "That’s over ₹1,00,000. It’s a basket, not a wedding.");
  const guess = r * 100;
  if (p.guesses.includes(guess)) return ($msg.textContent = `You already guessed ${rupees(guess)}.`);

  p.guesses.push(guess);
  if (guess === shop.total || p.guesses.length >= MAX_GUESSES) {
    p.done = true;
    p.onDay = shop === shops.at(-1);
    p.finishedAt = new Date().toISOString();
  }
  saveState();

  if (p.done) reveal(shop);
  else renderPlay(shop, { justGuessed: true });
}

function reveal(shop) {
  const $receipt = document.getElementById("receipt");
  document.getElementById("items").innerHTML = itemsHtml(shop, true);
  useEmojiOnImageError($receipt);
  $receipt.querySelector(".total-hint")?.remove();
  $receipt.classList.add("revealing");

  const $total = document.getElementById("total");
  $total.classList.remove("unknown");
  countUp($total, shop.total, shop.items.length * 110 + 500);

  renderPlay(shop, { justGuessed: true });
  document.querySelector(".result")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
}

function countUp(el, paise, ms) {
  if (reducedMotion) return void (el.textContent = rupees(paise));
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = rupees(paise * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function verdict(shop, s, guessCount) {
  if (s.exact) return ["Bilkul sahi! 🎯", `Spot on to the rupee, in ${guessCount} ${guessCount === 1 ? "guess" : "guesses"}.`];
  if (s.accuracy >= 97) return ["Ekdum close!", "Within 3% of the bill. Your mental kirana ledger is sharp."];
  if (s.accuracy >= 90) return ["Not bad at all", "Within 10%. You’d catch a wrong bill."];
  if (s.accuracy >= 80) return ["Thoda aur practice", "Within 20% of the real total."];
  return s.best < shop.total
    ? ["Arre, mehngai!", "This basket cost a lot more than you thought."]
    : ["Itna mehnga nahi hai!", "This basket was cheaper than you thought."];
}

function emojiRow(shop, guesses) {
  return guesses
    .map((g) => {
      const f = feedback(g, shop.total);
      return f.band.emoji + (f.dir === "higher" ? "⬆️" : f.dir === "lower" ? "⬇️" : "");
    })
    .join(" ");
}

function resultHtml(shop, p) {
  const s = score(p.guesses, shop.total);
  const [title, sub] = verdict(shop, s, p.guesses.length);
  const isLatest = shop === shops.at(-1);
  const saved = shop.mrpTotal - shop.total;
  return `
    <section class="result" aria-label="Result">
      <h2>${title}</h2>
      <p class="sub">${sub}</p>
      <div class="score">
        <div><div class="v">${rupees(shop.total)}</div><div class="k">Total</div></div>
        <div><div class="v">${rupees(s.best)}</div><div class="k">Best guess</div></div>
        <div><div class="v">${s.shown}%</div><div class="k">Accuracy</div></div>
      </div>
      <p class="emoji-row" aria-label="Your guesses as emoji">${emojiRow(shop, p.guesses)}</p>
      <div class="actions">
        <button type="button" class="btn btn-accent" data-share>Share result</button>
        <a class="btn" href="#/past">Past shops</a>
      </div>
      ${saved > 0 ? `<p class="savings">At MRP this basket would cost ${rupees(shop.mrpTotal)}. DMart knocks off ${rupees(saved)}.</p>` : ""}
      <p class="next">${isLatest ? nextShopHtml() : `That was shop No. ${pad(shop.no)}. <a href="#/">Play today’s shop →</a>`}</p>
    </section>`;
}

function nextShopHtml() {
  const nowIst = Date.now() + IST_OFFSET_MS;
  const d = new Date(nowIst);
  let target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), NEW_SHOP_HOUR_IST);
  const latestIsStale = shops.at(-1).date < istToday();
  if (latestIsStale && nowIst >= target) return "Today’s shop is on its way. Check back in a few minutes.";
  if (target <= nowIst) target += 86400e3;
  const mins = Math.ceil((target - nowIst) / 60e3);
  return `Next shop in <strong id="countdown">${Math.floor(mins / 60)}h ${mins % 60}m</strong>`;
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const $next = document.querySelector(".result .next");
    if (!$next || !document.getElementById("countdown")) return clearInterval(countdownTimer);
    $next.innerHTML = nextShopHtml();
  }, 20e3);
}

// ---------- sharing ----------

let sharing = null; // { shop, blob, file, url } for the open share dialog
let shareRequest = 0;

function shareText(shop) {
  const p = progressFor(shop);
  const s = score(p.guesses, shop.total);
  const line = s.exact ? `Bullseye in ${p.guesses.length}/${MAX_GUESSES}` : `${s.shown}% accurate`;
  return `Kitna Hua? No. ${pad(shop.no)} 🛒\n${emojiRow(shop, p.guesses)}\n${line}\n${location.origin}${location.pathname}`;
}

// What the poster shows. No prices, guess amounts or total, so it can't spoil the shop.
function posterCard(shop) {
  const p = progressFor(shop);
  const s = score(p.guesses, shop.total);
  const n = p.guesses.length;
  return {
    no: pad(shop.no),
    date: formatDate(shop.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    store: shop.store,
    location: shop.location,
    url: `${location.host}${location.pathname}`.replace(/\/(index\.html)?$/, ""),
    title: verdict(shop, s, n)[0].replace(/\s*🎯$/, ""),
    scoreLine: s.exact ? `Bullseye in ${n} ${n === 1 ? "guess" : "guesses"}` : `${s.shown}% accurate`,
    items: shop.items.map((item) => ({ name: item.name, emoji: GROUP_EMOJI[item.group] || "🛒" })),
    guesses: p.guesses.map((g) => {
      const f = feedback(g, shop.total);
      return { band: f.band.id, dir: f.dir, label: f.band.label(f.dir) };
    }),
  };
}

async function openShare(shop) {
  const $dialog = document.getElementById("share");
  const $img = document.getElementById("share-img");
  const $status = document.getElementById("share-status");
  const $action = (name) => $dialog.querySelector(`[data-share-action="${name}"]`);
  const request = ++shareRequest;

  if (sharing?.url) URL.revokeObjectURL(sharing.url);
  sharing = { shop };
  $img.removeAttribute("src");
  $status.textContent = "Printing your bill…";
  for (const name of ["share", "download", "copy-image"]) $action(name).hidden = true;
  $dialog.showModal();

  try {
    const blob = await posterBlob(posterCard(shop));
    if (request !== shareRequest) return; // reopened for another shop meanwhile
    const file = new File([blob], `kitna-hua-${pad(shop.no)}.png`, { type: "image/png" });
    sharing = { shop, blob, file, url: URL.createObjectURL(blob) };
  } catch {
    $status.textContent = "Couldn’t draw the card here, but you can still copy your result as text.";
    return;
  }
  $img.src = sharing.url;
  $action("download").href = sharing.url;
  $action("download").download = sharing.file.name;
  $action("download").hidden = false;
  $action("share").hidden = !navigator.canShare?.({ files: [sharing.file] });
  $action("copy-image").hidden = !(window.ClipboardItem && navigator.clipboard?.write);
  $status.textContent = "";
}

function wireShare() {
  const $dialog = document.getElementById("share");
  const $status = document.getElementById("share-status");
  $dialog.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-share-action]")?.dataset.shareAction;
    if (!action || !sharing || action === "download") return; // the download link does its own thing
    try {
      if (action === "share") {
        await navigator.share({ files: [sharing.file], text: shareText(sharing.shop) });
      } else if (action === "copy-image") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": sharing.blob })]);
        $status.textContent = "Image copied. Paste it anywhere.";
      } else if (action === "copy-text") {
        await navigator.clipboard.writeText(shareText(sharing.shop));
        $status.textContent = "Copied. Paste it in the family WhatsApp group!";
      }
    } catch (err) {
      if (err?.name !== "AbortError") $status.textContent = "That didn’t work here. Try downloading the image instead.";
    }
  });
}

function renderPast() {
  const latest = shops.at(-1);
  const rows = [...shops]
    .reverse()
    .map((shop) => {
      const p = state.progress[shop.no];
      let status = `<span class="past-status todo">Play →</span>`;
      if (p?.done) {
        const s = score(p.guesses, shop.total);
        status = `<span class="past-status"><span class="mono">${rupees(shop.total)}</span>${s.exact ? "🎯 Bullseye" : `${s.shown}%`}</span>`;
      } else if (p?.guesses.length) {
        status = `<span class="past-status todo">${p.guesses.length}/${MAX_GUESSES} guessed</span>`;
      }
      const when = formatDate(shop.date, { weekday: "short", day: "numeric", month: "short" });
      return `
        <li><a href="#/shop/${shop.no}">
          <span class="past-no">${pad(shop.no)}</span>
          <span><div class="past-date">${shop === latest ? "Today · " : ""}${when}</div>
          <div class="past-meta">${shop.items.length} items · ${escapeHtml(shop.store)}</div></span>
          ${status}
        </a></li>`;
    })
    .join("");

  $app.innerHTML = `
    <section class="intro">
      <h1>Past shops</h1>
      <p>Missed a day? Every basket keeps the prices from its own day.</p>
    </section>
    <ol class="past-list">${rows}</ol>`;
  renderFooter(latest);
}

function renderStats() {
  const s = computeStats();
  const tiles = [
    [s.played, "Played"],
    [s.streak, "Streak"],
    [s.bestStreak, "Best streak"],
    [s.played ? `${s.avg.toFixed(1)}%` : "–", "Avg accuracy"],
    [s.played ? `${s.bestAcc >= 100 ? "100" : Math.min(s.bestAcc, 99.9).toFixed(1)}%` : "–", "Best"],
    [s.bullseyes, "Bullseyes"],
  ];
  document.getElementById("stats-body").innerHTML = `<div class="stats-grid">${tiles
    .map(([v, k]) => `<div><div class="v">${v}</div><div class="k">${k}</div></div>`)
    .join("")}</div>`;
}

function renderFooter(shop) {
  const fetched = shop?.pricesAt
    ? new Date(shop.pricesAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" })
    : null;
  $footer.innerHTML = `
    ${shop ? `<p>Prices are ${escapeHtml(shop.store)} online selling prices for ${escapeHtml(shop.location)}${fetched ? `, as shown on ${fetched}` : ""}. Offers and delivery fees aren’t included. Prices change, and what you pay may differ.</p>` : ""}
    <p>Kitna Hua? is a fan-made game and isn’t affiliated with DMart or Avenue E-Commerce Ltd. Product names and images belong to their owners.</p>`;
}

// ---------- routing & boot ----------

function route() {
  const hash = location.hash;
  const match = hash.match(/^#\/shop\/(\d+)$/);
  let nav = "today";
  if (hash === "#/past") {
    nav = "past";
    renderPast();
  } else if (match) {
    const shop = shops.find((s) => s.no === Number(match[1]));
    if (!shop) return void (location.hash = "#/");
    if (shop !== shops.at(-1)) nav = "past";
    renderGame(shop);
  } else {
    renderGame(shops.at(-1));
  }
  for (const a of document.querySelectorAll("[data-nav]")) {
    if (a.dataset.nav === nav) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

function wireDialogs() {
  for (const btn of document.querySelectorAll("[data-open]")) {
    btn.addEventListener("click", () => {
      if (btn.dataset.open === "stats") renderStats();
      document.getElementById(btn.dataset.open).showModal();
    });
  }
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
  }
}

async function boot() {
  wireDialogs();
  wireShare();
  try {
    const res = await fetch("shops.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    shops = (await res.json()).shops || [];
  } catch {
    $app.innerHTML = `<p class="loading">Couldn’t load today’s shop. Check your connection and refresh.</p>`;
    return;
  }
  if (!shops.length) {
    $app.innerHTML = `<p class="loading">The first shop opens tomorrow morning.</p>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();

  let seenHelp = false;
  try {
    seenHelp = localStorage.getItem(SEEN_HELP_KEY) === "1";
    localStorage.setItem(SEEN_HELP_KEY, "1");
  } catch {}
  if (!seenHelp && !progressFor(shops.at(-1)).guesses.length) document.getElementById("how").showModal();
}

boot();
