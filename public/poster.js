// Draws the shareable result card: a torn DMart bill on a haldi background.
// Spoiler-free on purpose: it shows the basket and how each guess landed,
// never a price, a guess amount or the total.

const W = 1080;
const H = 1350; // 4:5, fits Instagram, WhatsApp and LinkedIn feeds

const C = {
  bg: "#EFAE3A",
  ink: "#1D2230",
  paper: "#FFFDF8",
  muted: "#6A6456",
  line: "#E2D9C6",
  tileBg: "#F3EDE0",
  accentInk: "#8A5A00",
};
const TILE = {
  exact: { bg: "#2E7D4F", fg: "#FFFFFF" },
  close: { bg: "#DDF0E3", fg: "#2E7D4F" },
  little: { bg: "#FBEFC4", fg: "#7A5C00" },
  off: { bg: "#FBE1CF", fg: "#A94F14" },
  far: { bg: "#F8DAD5", fg: "#B3362B" },
};
const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const font = (weight, size, family = DISPLAY) => `${weight} ${size}px ${family}`;

// same bag mark as the site's logo, on a 32-unit grid
const BAG = new Path2D("M9 12h14l-1.2 12.2a2 2 0 0 1-2 1.8h-7.6a2 2 0 0 1-2-1.8z");
const HANDLE = new Path2D("M12.5 12v-1.5a3.5 3.5 0 0 1 7 0V12");

async function fontsReady() {
  const wanted = [font(800, 72), font(700, 20), font(600, 27), font(600, 30, MONO), font(400, 22, MONO)];
  try {
    await Promise.race([
      Promise.all(wanted.map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(resolve, 2500)), // fall back to system fonts
    ]);
  } catch {}
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

function dashedLine(ctx, x1, x2, y) {
  ctx.save();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

// Rounded top, straight sides, torn zigzag bottom.
function billPath(x, y, w, h) {
  const r = 18;
  const depth = 13;
  const teeth = Math.round(w / 28);
  const step = w / teeth;
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h);
  for (let i = 0; i < teeth; i++) {
    const right = x + w - i * step;
    p.lineTo(right - step / 2, y + h + depth);
    p.lineTo(right - step, y + h);
  }
  p.arcTo(x, y, x + r, y, r);
  p.closePath();
  return p;
}

function drawBackground(ctx) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = C.ink;
  ctx.font = font(600, 46, MONO);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let row = 0; row * 110 < H + 110; row++) {
    for (let col = -1; col * 120 < W + 120; col++) {
      ctx.fillText((row + col) % 3 === 0 ? "?" : "₹", col * 120 + (row % 2) * 60, row * 110);
    }
  }
  ctx.restore();
}

function drawMasthead(ctx, card) {
  ctx.save();
  ctx.translate(72, 52);
  roundRect(ctx, 0, 0, 76, 76, 18);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.scale(76 / 32, 76 / 32);
  ctx.fillStyle = C.bg;
  ctx.fill(BAG);
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 2;
  ctx.stroke(HANDLE);
  ctx.restore();

  ctx.fillStyle = C.ink;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = font(800, 60);
  ctx.fillText("Kitna Hua?", 168, 112);

  ctx.textAlign = "right";
  ctx.font = font(600, 26, MONO);
  ctx.fillText(`SHOP NO. ${card.no}`, W - 72, 84);
  ctx.globalAlpha = 0.72;
  ctx.font = font(400, 22, MONO);
  ctx.fillText(card.date.toUpperCase(), W - 72, 118);
  ctx.globalAlpha = 1;
}

function drawArrow(ctx, cx, cy, dir, size) {
  const s = dir === "higher" ? -1 : 1;
  const tip = cy + s * size;
  const tail = cy - s * size;
  const wing = size * 0.7;
  ctx.beginPath();
  ctx.moveTo(cx, tail);
  ctx.lineTo(cx, tip);
  ctx.moveTo(cx - wing, tip - s * wing);
  ctx.lineTo(cx, tip);
  ctx.lineTo(cx + wing, tip - s * wing);
  ctx.stroke();
}

function drawGuessTile(ctx, x, y, w, h, guess) {
  if (!guess) {
    ctx.save();
    roundRect(ctx, x, y, w, h, 18);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.line;
    ctx.font = font(700, 40);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("–", x + w / 2, y + h / 2);
    return;
  }

  const { bg, fg } = TILE[guess.band];
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = bg;
  ctx.fill();

  const cx = x + w / 2;
  const iconY = y + 46;
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (guess.band === "exact") {
    ctx.lineWidth = 5;
    for (const r of [25, 14]) {
      ctx.beginPath();
      ctx.arc(cx, iconY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, iconY, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (guess.band === "close") {
    ctx.font = font(800, 60);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("≈", cx, iconY + 2);
  } else if (guess.band === "far") {
    ctx.lineWidth = 7;
    drawArrow(ctx, cx - 17, iconY, guess.dir, 21);
    drawArrow(ctx, cx + 17, iconY, guess.dir, 21);
  } else {
    ctx.lineWidth = guess.band === "little" ? 6 : 7;
    drawArrow(ctx, cx, iconY, guess.dir, guess.band === "little" ? 16 : 21);
  }
  ctx.restore();

  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 21;
  ctx.font = font(700, size);
  while (ctx.measureText(guess.label).width > w - 20 && size > 15) ctx.font = font(700, --size);
  ctx.fillText(guess.label, cx, y + h - 30);
}

// Returns the y of the bill's bottom edge (before the teeth).
function drawBill(ctx, card) {
  const x = 84;
  const w = W - 2 * x;
  const padX = 48;
  const n = card.items.length;
  const rowH = n > 7 ? 54 : 60;
  const headH = 118;
  const itemsH = n * rowH + 24;
  const totalH = 86;
  const guessesH = 196;
  const h = headH + itemsH + totalH + guessesH;
  const maxH = headH + (8 * 54 + 24) + totalH + guessesH;
  const y = 176 + (maxH - h) / 2;
  const left = x + padX;
  const right = x + w - padX;

  ctx.save();
  ctx.translate(W / 2, y + h / 2);
  ctx.rotate((-1.2 * Math.PI) / 180);
  ctx.translate(-W / 2, -(y + h / 2));

  const bill = billPath(x, y, w, h);
  ctx.save();
  ctx.shadowColor = "rgba(90, 55, 0, 0.35)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = C.paper;
  ctx.fill(bill);
  ctx.restore();

  // header
  ctx.fillStyle = C.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(600, 30, MONO);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
  ctx.fillText(card.store.toUpperCase(), W / 2, y + 62);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.fillStyle = C.muted;
  ctx.font = font(400, 22, MONO);
  ctx.fillText(`${card.location} · ${n} items`, W / 2, y + 98);
  dashedLine(ctx, left, right, y + headH);

  // items, prices hidden
  const itemsTop = y + headH + 12;
  card.items.forEach((item, i) => {
    const cy = itemsTop + i * rowH + rowH / 2;
    roundRect(ctx, left, cy - 22, 44, 44, 10);
    ctx.fillStyle = C.tileBg;
    ctx.fill();
    ctx.font = `26px ${EMOJI}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.ink;
    ctx.fillText(item.emoji, left + 22, cy + 2);

    ctx.textAlign = "left";
    ctx.font = font(600, 27);
    ctx.fillText(fitText(ctx, item.name, right - left - 64 - 96), left + 64, cy);
    ctx.textAlign = "right";
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 26, MONO);
    ctx.fillText("₹??", right, cy);

    if (i < n - 1) {
      ctx.fillStyle = C.line;
      ctx.fillRect(left + 64, itemsTop + (i + 1) * rowH - 1, right - left - 64, 2);
    }
  });

  // total
  const totalTop = y + headH + itemsH;
  dashedLine(ctx, left, right, totalTop);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink;
  ctx.font = font(600, 28, MONO);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
  ctx.fillText("KITNA HUA?", left, totalTop + totalH / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = C.accentInk;
  ctx.font = font(600, 46, MONO);
  ctx.fillText("₹????", right, totalTop + totalH / 2);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  dashedLine(ctx, left, right, totalTop + totalH);

  // guesses
  const gTop = totalTop + totalH;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.muted;
  ctx.font = font(500, 20, MONO);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  ctx.fillText("MY GUESSES", left, gTop + 44);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  const gap = 14;
  const tileW = (right - left - 3 * gap) / 4;
  for (let i = 0; i < 4; i++) {
    drawGuessTile(ctx, left + i * (tileW + gap), gTop + 62, tileW, 116, card.guesses[i]);
  }

  ctx.restore();
  return y + h;
}

function drawVerdict(ctx, card) {
  ctx.fillStyle = C.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(800, 70);
  ctx.fillText(card.title, W / 2, H - 196);
  ctx.globalAlpha = 0.82;
  ctx.font = font(600, 34);
  ctx.fillText(card.scoreLine, W / 2, H - 146);
  ctx.globalAlpha = 1;

  const label = `Can you do better?  ${card.url}`;
  ctx.font = font(500, 25, MONO);
  const pillW = ctx.measureText(label).width + 64;
  roundRect(ctx, (W - pillW) / 2, H - 104, pillW, 62, 31);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.textBaseline = "middle";
  ctx.fillText(label, W / 2, H - 72);
}

/**
 * card: { no, date, store, location, url, title, scoreLine,
 *         items: [{ name, emoji }],
 *         guesses: [{ band, dir, label }] }   // up to 4
 * Resolves to a PNG Blob.
 */
export async function posterBlob(card) {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);
  drawMasthead(ctx, card);
  drawBill(ctx, card);
  drawVerdict(ctx, card);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the card"))), "image/png"),
  );
}
