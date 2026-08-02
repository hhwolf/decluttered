import { useState } from "react";
import { Star } from "lucide-react";
import { paletteFor } from "../domains.js";

export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/* ---- shared style sheet: NEO-BRUTALIST skin -------------------------------
   Cream paper, white cards, 2px #111 borders, hard offset shadows (no blur),
   chunky press-down buttons, rotated sticker badges, loud per-domain accents.
   Layout & behavior identical to the editorial skin — tokens & chrome only. */
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap');
.taste-root{
  --paper:#FFF8E7; --paper2:#FCF0D4; --card:#FFFFFF; --ink:#111111; --ink2:#3A3A34;
  --slate:#111111; --hl:#FFD23F; --hl-deep:#8A6400; --stamp:#E63946; --muted:#6E6A5C; --line:#111111;
  --soft:#E7DDBE;
  --disp:'Fraunces',Georgia,serif; --ui:'Inter',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  font-family:var(--ui); color:var(--ink); background:var(--paper);
  -webkit-font-smoothing:antialiased; box-sizing:border-box;
}
.taste-root.dom-restaurants{--hl:#FF9F1C;--hl-deep:#A85E00;}
.taste-root.dom-music{--hl:#53DD6C;--hl-deep:#0F7A2E;}
.taste-root.dom-movies{--hl:#FF5D73;--hl-deep:#C1122F;}
.taste-root.dom-tv{--hl:#4D9DE0;--hl-deep:#175E9E;}
.taste-root *,.taste-root *::before,.taste-root *::after{box-sizing:border-box;}
.taste-shell{max-width:468px;margin:0 auto;min-height:100vh;min-height:100dvh;position:relative;
  background:var(--paper);border-left:2px solid var(--ink);border-right:2px solid var(--ink);
  display:flex;flex-direction:column;}
.taste-top{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 10px;}
.taste-mark{font-family:var(--disp);font-weight:700;font-size:23px;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;}
.taste-mark .dot{font-family:var(--mono);font-size:10px;color:var(--muted);font-weight:700;letter-spacing:.12em;}
.cat-no{font-family:var(--mono);font-size:10.5px;color:var(--muted);letter-spacing:.06em;font-weight:500;}
.taste-body{flex:1;padding:4px 18px 96px;overflow:visible;}
.dombar{display:flex;gap:5px;padding:0 14px 10px;}
.dombtn{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:4px;border:2px solid var(--ink);
  background:var(--card);color:var(--ink);border-radius:10px;padding:8px 3px;cursor:pointer;
  font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  box-shadow:2px 2px 0 var(--ink);transition:all .1s ease;}
.dombtn:hover{transform:translate(1px,1px);box-shadow:1px 1px 0 var(--ink);}
.dombtn.on{background:var(--hl);color:var(--ink);transform:translate(2px,2px);box-shadow:0 0 0 var(--ink);}
.dombtn .dnum{opacity:.7;font-size:8px;}
.shelfrow{display:flex;gap:12px;overflow-x:auto;padding:4px 4px 12px;scrollbar-width:thin;}
.sugcard{flex:none;width:112px;display:flex;flex-direction:column;gap:5px;transition:opacity .15s ease,transform .15s ease;}
.sugcard .cover{width:112px !important;height:158px !important;}
.sugmeta{display:flex;flex-direction:column;gap:1px;min-width:0;}
.sugtitle{font-family:var(--disp);font-weight:700;font-size:13px;line-height:1.15;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.sugacts{display:flex;gap:2px;justify-content:space-between;border-top:2px solid var(--ink);padding-top:5px;}
.hl{position:relative;display:inline;z-index:0;}
.hl::before{content:"";position:absolute;left:-3px;right:-4px;top:34%;bottom:-2%;background:var(--hl);
  transform:skewX(-6deg) rotate(-.5deg);z-index:-1;}
.eyebrow{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);}
.h1{font-family:var(--disp);font-weight:700;font-size:30px;line-height:1.05;letter-spacing:-.015em;margin:6px 0 4px;}
.h2{font-family:var(--disp);font-weight:700;font-size:21px;line-height:1.1;letter-spacing:-.01em;}
.sub{color:var(--ink2);font-size:14px;line-height:1.5;}
.serif{font-family:var(--disp);}
.btn{font-family:var(--ui);font-weight:700;font-size:15px;border:2px solid var(--ink);cursor:pointer;border-radius:13px;
  padding:13px 18px;box-shadow:4px 4px 0 var(--ink);transition:transform .1s ease,box-shadow .1s ease;}
.btn:hover{transform:translate(1px,1px);box-shadow:3px 3px 0 var(--ink);}
.btn:active{transform:translate(4px,4px);box-shadow:0 0 0 var(--ink);}
.btn:disabled{box-shadow:4px 4px 0 var(--ink);transform:none;}
.btn-primary{background:var(--ink);color:var(--paper);box-shadow:4px 4px 0 var(--hl);}
.btn-primary:hover{box-shadow:3px 3px 0 var(--hl);}
.btn-primary:active{box-shadow:0 0 0 var(--hl);}
.btn-ghost{background:var(--card);color:var(--ink);}
.btn-hl{background:var(--hl);color:var(--ink);}
.btn-block{width:100%;}
.chip{font-family:var(--ui);font-size:13.5px;font-weight:600;border:2px solid var(--ink);background:var(--card);
  color:var(--ink);border-radius:999px;padding:8px 14px;cursor:pointer;box-shadow:2px 2px 0 var(--ink);
  transition:all .1s ease;user-select:none;display:inline-block;}
.chip:hover{transform:translate(1px,1px);box-shadow:1px 1px 0 var(--ink);}
.chip.on{background:var(--hl);color:var(--ink);transform:translate(2px,2px);box-shadow:0 0 0 var(--ink);}
.chip.avoid.on{background:var(--stamp);color:#fff;}
.chips{display:flex;flex-wrap:wrap;gap:9px;}
.cover{position:relative;border-radius:7px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;
  padding:13px 12px;border:2px solid var(--ink);box-shadow:3px 3px 0 var(--ink);}
.cover .ctitle{font-family:var(--disp);font-weight:700;line-height:1.06;letter-spacing:-.01em;}
.cover .cauth{font-family:var(--mono);font-size:9px;letter-spacing:.04em;opacity:.9;}
.cover .crule{height:2px;opacity:.5;margin:7px 0;}
.cover.imgcover{padding:0;justify-content:flex-end;background-size:cover;background-position:center;}
.cover.imgcover .cgrad{background:linear-gradient(transparent 30%,rgba(10,10,12,.88));padding:20px 9px 8px;width:100%;}
.deck{position:relative;height:454px;margin-top:8px;}
.swipecard{position:absolute;inset:0;background:var(--card);border-radius:16px;border:2px solid var(--ink);
  box-shadow:7px 7px 0 var(--ink);overflow:hidden;display:flex;flex-direction:column;touch-action:pan-y;}
.match-pill{position:absolute;top:14px;right:12px;background:var(--card);border:2px solid var(--ink);border-radius:12px;
  padding:6px 11px 6px 8px;display:flex;align-items:center;gap:7px;z-index:3;transform:rotate(4deg);
  box-shadow:3px 3px 0 var(--ink);}
.ext-pill{position:absolute;top:16px;left:12px;background:var(--ink);color:var(--paper);border:2px solid var(--ink);
  border-radius:10px;padding:6px 10px;display:flex;align-items:center;gap:5px;z-index:3;
  font-family:var(--mono);font-size:11px;font-weight:700;transform:rotate(-3deg);box-shadow:3px 3px 0 rgba(17,17,17,.25);}
.stamp{position:absolute;top:34px;font-family:var(--mono);font-weight:700;font-size:18px;letter-spacing:.12em;
  text-transform:uppercase;border:3px solid;border-radius:9px;padding:5px 11px;z-index:4;opacity:0;
  background:var(--card);box-shadow:3px 3px 0 var(--ink);transition:opacity .08s ease;pointer-events:none;}
.stamp.want{left:22px;transform:rotate(-12deg);color:var(--hl-deep);border-color:var(--hl-deep);}
.stamp.pass{right:22px;transform:rotate(12deg);color:var(--stamp);border-color:var(--stamp);}
.actions{display:flex;gap:12px;justify-content:center;margin-top:18px;}
.act{width:60px;height:60px;border-radius:50%;border:2px solid var(--ink);background:var(--card);cursor:pointer;
  display:flex;align-items:center;justify-content:center;box-shadow:3px 3px 0 var(--ink);
  transition:transform .1s ease,box-shadow .1s ease,background .1s ease;}
.act:hover{transform:translate(1px,1px);box-shadow:2px 2px 0 var(--ink);}
.act:active{transform:translate(3px,3px);box-shadow:0 0 0 var(--ink);}
.act.small{width:50px;height:50px;}
.act.pass:hover{background:#FFE3E0;}
.act.want:hover{background:var(--hl);}
.act.consumed:hover{background:var(--paper2);}
.act.more:hover{background:var(--paper2);}
.tabbar{position:fixed;bottom:0;left:0;right:0;max-width:468px;margin:0 auto;display:flex;
  background:var(--paper);border-top:2px solid var(--ink);border-left:2px solid var(--ink);border-right:2px solid var(--ink);
  padding:8px 6px 10px;z-index:30;}
.tab{flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:5px 0;color:var(--muted);font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}
.tab.on{color:var(--ink);}
.tab .ind{height:5px;width:22px;border-radius:3px;background:transparent;border:2px solid transparent;}
.tab.on .ind{background:var(--hl);border-color:var(--ink);}
.seg{display:flex;background:var(--card);border:2px solid var(--ink);border-radius:12px;padding:3px;gap:3px;box-shadow:2px 2px 0 var(--ink);}
.seg button{flex:1;border:none;background:none;cursor:pointer;font-family:var(--ui);font-size:13px;font-weight:600;
  color:var(--ink2);padding:8px 6px;border-radius:8px;}
.seg button.on{background:var(--ink);color:var(--paper);}
.range{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:0;background:var(--card);
  border:2px solid var(--ink);outline:none;}
.range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:6px;
  background:var(--hl);border:2px solid var(--ink);box-shadow:2px 2px 0 var(--ink);cursor:pointer;}
.range::-moz-range-thumb{width:20px;height:20px;border-radius:6px;background:var(--hl);border:2px solid var(--ink);
  box-shadow:2px 2px 0 var(--ink);cursor:pointer;}
.row{display:flex;align-items:center;gap:12px;}
.item-row{display:flex;gap:13px;align-items:center;padding:12px 0;border-bottom:2px solid var(--ink);}
.stars{display:flex;gap:3px;}
.star{cursor:pointer;color:var(--soft);transition:color .1s ease;}
.star.on{color:var(--ink);}
.card{background:var(--card);border:2px solid var(--ink);border-radius:14px;padding:15px;box-shadow:4px 4px 0 var(--ink);}
.bar{height:10px;border-radius:5px;background:var(--card);overflow:hidden;border:2px solid var(--ink);}
.bar > span{display:block;height:100%;background:var(--ink);}
.avatar{width:38px;height:38px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
  color:#fff;font-family:var(--disp);font-weight:700;font-size:16px;border:2px solid var(--ink);}
.feeditem{padding:14px 0;border-bottom:2px solid var(--ink);}
.iconbtn{background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;gap:5px;
  font-family:var(--ui);font-size:13px;font-weight:600;}
.iconbtn.on{color:var(--stamp);}
.input{width:100%;border:2px solid var(--ink);background:var(--card);border-radius:10px;padding:11px 12px;
  font-family:var(--ui);font-size:14px;color:var(--ink);resize:none;}
.input:focus{outline:none;box-shadow:2px 2px 0 var(--ink);}
.empty{text-align:center;padding:48px 20px;color:var(--muted);}
.progress{height:9px;background:var(--card);border:2px solid var(--ink);border-radius:5px;overflow:hidden;margin:0 0 18px;}
.progress > span{display:block;height:100%;background:var(--hl);transition:width .3s ease;}
@media (prefers-reduced-motion: reduce){.btn,.act,.swipecard,.chip,.dombtn{transition:none !important;}}
`;

/* ---- Cover: real artwork when the catalogue has it, stylized card if not --- */
export function Cover({ item, size = "md" }) {
  const [broken, setBroken] = useState(false);
  const pal = paletteFor(item.genres?.[0]);
  const dims = { sm: [54, 80], md: [88, 132], lg: [150, 224] }[size];
  const titleSize = size === "lg" ? 19 : size === "md" ? 12.5 : 9;
  if (item.image && !broken) {
    return (
      <div className="cover imgcover" style={{ width: dims[0], height: dims[1], background: pal.bg, flex: "none" }}>
        <img src={item.image} alt="" loading="lazy" onError={() => setBroken(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        {size !== "sm" && (
          <div className="cgrad" style={{ position: "relative", color: "#F6F4EC" }}>
            <div className="ctitle" style={{ fontSize: titleSize * 0.85 }}>{item.title}</div>
            <div className="cauth">{item.subtitle}</div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="cover" style={{ width: dims[0], height: dims[1], background: pal.bg, color: pal.fg, flex: "none" }}>
      <div className="cauth" style={{ marginTop: 8 }}>{item.subtitle}</div>
      <div>
        <div className="crule" style={{ background: pal.fg }} />
        <div className="ctitle" style={{ fontSize: titleSize }}>{item.title}</div>
      </div>
    </div>
  );
}

export function Stars({ value, onChange, size = 20 }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={"star" + (n <= value ? " on" : "")}
          fill={n <= value ? "currentColor" : "none"}
          onClick={onChange ? () => onChange(n === value ? 0 : n) : undefined} />
      ))}
    </div>
  );
}

/* compact 1..5 dot rating, visually distinct from the overall stars */
export function MiniRate({ value = 0, onChange }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n === value ? 0 : n)} aria-label={n + " of 5"}
          style={{ width: 15, height: 15, borderRadius: "50%", padding: 0, cursor: "pointer",
            border: "1.5px solid var(--ink)", background: n <= value ? "var(--hl-deep)" : "transparent",
            transition: "background .1s ease" }} />
      ))}
    </div>
  );
}

/* External rating badge — real Google/Open Library stars or Deezer popularity. */
export function ExtRating({ item, dark = false }) {
  const r = item.rating;
  if (!r || r.value == null) return null;
  const fmtCount = (c) => (c >= 1000000 ? (c / 1000000).toFixed(1) + "M" : c >= 1000 ? Math.round(c / 1000) + "k" : c);
  const scale = r.scale || (r.source === "Deezer" ? 100 : 5);
  const style = dark ? {} : { position: "static", background: "transparent", color: "var(--ink2)", padding: 0 };
  let body;
  if (scale === 100) body = <>▶ {r.value} · {r.source} charts</>;
  else if (scale === 10) body = <>★ {r.value}/10 · {r.count ? fmtCount(r.count) + " on " : ""}{r.source}</>;
  else body = <>★ {r.value} · {r.count ? fmtCount(r.count) + " on " : ""}{r.source}</>;
  return <span className={dark ? "ext-pill" : "cat-no"} style={style} title={r.source}>{body}</span>;
}

export function matchTag(score) {
  if (score >= 60) return { t: "Strong match", c: "var(--hl-deep)" };
  if (score >= 45) return { t: "Good match", c: "var(--slate)" };
  if (score >= 32) return { t: "Worth a look", c: "var(--ink2)" };
  return { t: "A stretch", c: "var(--muted)" };
}
// DISPLAY ONLY — engine's true 0..100 remapped so a genuine good match reads
// high-70s/80s and the realistic ceiling (~true 80) reads 100. Ranking,
// matching, learning and matchTag all use the TRUE score.
export const displayScore = (score) => Math.round(clamp(0.8 * score + 36, 0, 100));
export const ringDegrees = (score) => displayScore(score) * 3.6;

/* Functional-updater toggle: safe for rapid taps (never reads stale state). */
export function toggleSel(set, v, max) {
  set((arr) => {
    if (arr.includes(v)) return arr.filter((x) => x !== v);
    if (!max || arr.length < max) return [...arr, v];
    return arr;
  });
}

/* Hoisted item picker (module scope — no remount flicker per selection). */
export function ItemPicker({ items, selected, set, max, exclude = [] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {items.filter((b) => !exclude.includes(b.id)).map((b) => {
        const on = selected.includes(b.id);
        return (
          <button key={b.id} onClick={() => toggleSel(set, b.id, max)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", position: "relative", textAlign: "left" }}>
            <div style={{ opacity: on ? 1 : 0.62, transform: on ? "translateY(-2px)" : "none", transition: "all .12s ease",
              outline: on ? "2px solid var(--ink)" : "none", outlineOffset: 2, borderRadius: 6 }}>
              <Cover item={b} size="md" />
            </div>
            <div className="cat-no" style={{ marginTop: 4, lineHeight: 1.25, maxHeight: 26, overflow: "hidden" }}>{b.title}</div>
            {on && (
              <div style={{ position: "absolute", top: -6, right: -6, background: "var(--hl)", borderRadius: "50%",
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--ink)",
                fontSize: 12, fontWeight: 700, color: "#1c2406" }}>✓</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
