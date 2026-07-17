import { useState } from "react";
import { Star } from "lucide-react";
import { paletteFor } from "../domains.js";

export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/* ---- shared style sheet (ported from the Shelf MVP, plus domain accents) --- */
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
.taste-root{
  --paper:#E9E6DD; --paper2:#F4F2EA; --card:#FCFBF5; --ink:#17181C; --ink2:#41464F;
  --slate:#3E5366; --hl:#D9F24E; --hl-deep:#9FB823; --stamp:#B6442F; --muted:#8C887E; --line:#D8D4C8;
  --disp:'Fraunces',Georgia,serif; --ui:'Inter',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
  font-family:var(--ui); color:var(--ink); background:var(--paper);
  -webkit-font-smoothing:antialiased; box-sizing:border-box;
}
.taste-root.dom-restaurants{--hl:#F2B04E;--hl-deep:#B97E1E;}
.taste-root.dom-music{--hl:#7FD9F2;--hl-deep:#2586A3;}
.taste-root *,.taste-root *::before,.taste-root *::after{box-sizing:border-box;}
.taste-shell{max-width:468px;margin:0 auto;min-height:100vh;min-height:100dvh;position:relative;
  background:var(--paper);background-image:radial-gradient(var(--line) 0.6px,transparent 0.6px);background-size:22px 22px;
  display:flex;flex-direction:column;box-shadow:0 0 0 1px rgba(0,0,0,.04);}
.taste-top{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 10px;}
.taste-mark{font-family:var(--disp);font-weight:600;font-size:23px;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;}
.taste-mark .dot{font-family:var(--mono);font-size:10px;color:var(--muted);font-weight:400;letter-spacing:.12em;}
.cat-no{font-family:var(--mono);font-size:10.5px;color:var(--muted);letter-spacing:.06em;}
.taste-body{flex:1;padding:4px 18px 96px;overflow:visible;}
.dombar{display:flex;gap:6px;padding:0 18px 8px;}
.dombtn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);
  background:var(--paper2);color:var(--ink2);border-radius:11px;padding:9px 6px;cursor:pointer;
  font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;transition:all .12s ease;}
.dombtn.on{background:var(--ink);color:var(--paper2);border-color:var(--ink);}
.dombtn .dnum{opacity:.55;font-size:9px;}
.hl{position:relative;display:inline;}
.hl::before{content:"";position:absolute;left:-2px;right:-3px;top:38%;bottom:2%;background:var(--hl);
  transform:skewX(-9deg);z-index:-1;opacity:.92;}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--slate);}
.h1{font-family:var(--disp);font-weight:600;font-size:30px;line-height:1.05;letter-spacing:-.015em;margin:6px 0 4px;}
.h2{font-family:var(--disp);font-weight:600;font-size:21px;line-height:1.1;letter-spacing:-.01em;}
.sub{color:var(--ink2);font-size:14px;line-height:1.5;}
.serif{font-family:var(--disp);}
.btn{font-family:var(--ui);font-weight:500;font-size:15px;border:none;cursor:pointer;border-radius:11px;
  padding:13px 18px;transition:transform .12s ease,filter .12s ease;}
.btn:active{transform:translateY(1px) scale(.99);}
.btn-primary{background:var(--ink);color:var(--paper2);}
.btn-primary:hover{filter:brightness(1.12);}
.btn-ghost{background:transparent;color:var(--ink2);border:1px solid var(--line);}
.btn-hl{background:var(--hl);color:#1c2406;font-weight:600;}
.btn-block{width:100%;}
.chip{font-family:var(--ui);font-size:13.5px;font-weight:500;border:1px solid var(--line);background:var(--paper2);
  color:var(--ink2);border-radius:999px;padding:9px 14px;cursor:pointer;transition:all .12s ease;user-select:none;}
.chip:hover{border-color:var(--ink);}
.chip.on{background:var(--ink);color:var(--paper2);border-color:var(--ink);}
.chip.avoid.on{background:var(--stamp);border-color:var(--stamp);color:#fff;}
.chips{display:flex;flex-wrap:wrap;gap:8px;}
.cover{position:relative;border-radius:5px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;
  padding:13px 12px;box-shadow:0 1px 2px rgba(0,0,0,.18),inset 0 0 0 1px rgba(255,255,255,.06);}
.cover .ctitle{font-family:var(--disp);font-weight:600;line-height:1.06;letter-spacing:-.01em;}
.cover .cauth{font-family:var(--mono);font-size:9px;letter-spacing:.04em;opacity:.85;}
.cover .crule{height:1px;opacity:.4;margin:7px 0;}
.cover.imgcover{padding:0;justify-content:flex-end;background-size:cover;background-position:center;}
.cover.imgcover .cgrad{background:linear-gradient(transparent 30%,rgba(10,10,12,.86));padding:20px 9px 8px;width:100%;}
.deck{position:relative;height:454px;margin-top:8px;}
.swipecard{position:absolute;inset:0;background:var(--card);border-radius:16px;border:1px solid var(--line);
  box-shadow:0 12px 30px -16px rgba(0,0,0,.35);overflow:hidden;display:flex;flex-direction:column;touch-action:pan-y;}
.match-pill{position:absolute;top:14px;right:14px;background:var(--paper2);border:1px solid var(--line);border-radius:999px;
  padding:6px 11px 6px 8px;display:flex;align-items:center;gap:7px;z-index:3;box-shadow:0 2px 6px rgba(0,0,0,.08);}
.ext-pill{position:absolute;top:14px;left:14px;background:rgba(23,24,28,.82);color:#F4F2EA;border-radius:999px;
  padding:6px 11px;display:flex;align-items:center;gap:5px;z-index:3;font-family:var(--mono);font-size:11px;}
.stamp{position:absolute;top:34px;font-family:var(--mono);font-weight:500;font-size:18px;letter-spacing:.12em;
  text-transform:uppercase;border:2.5px solid;border-radius:7px;padding:5px 11px;z-index:4;opacity:0;
  transition:opacity .08s ease;pointer-events:none;}
.stamp.want{left:22px;transform:rotate(-12deg);color:var(--hl-deep);border-color:var(--hl-deep);}
.stamp.pass{right:22px;transform:rotate(12deg);color:var(--stamp);border-color:var(--stamp);}
.actions{display:flex;gap:10px;justify-content:center;margin-top:16px;}
.act{width:60px;height:60px;border-radius:50%;border:1px solid var(--line);background:var(--card);cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:transform .12s ease,background .12s ease;box-shadow:0 4px 10px -6px rgba(0,0,0,.3);}
.act:hover{transform:translateY(-2px);}
.act.small{width:50px;height:50px;}
.act.pass:hover{background:#fbeae6;}
.act.want:hover{background:var(--hl);}
.act.consumed:hover{background:#eef1f4;}
.act.more:hover{background:#f3efe2;}
.tabbar{position:fixed;bottom:0;left:0;right:0;max-width:468px;margin:0 auto;display:flex;
  background:rgba(252,251,245,.92);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:8px 6px 10px;z-index:30;}
.tab{flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:5px 0;color:var(--muted);font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;}
.tab.on{color:var(--ink);}
.tab .ind{height:3px;width:18px;border-radius:2px;background:transparent;}
.tab.on .ind{background:var(--hl-deep);}
.seg{display:flex;background:var(--paper2);border:1px solid var(--line);border-radius:11px;padding:3px;gap:3px;}
.seg button{flex:1;border:none;background:none;cursor:pointer;font-family:var(--ui);font-size:13px;font-weight:500;
  color:var(--ink2);padding:8px 6px;border-radius:8px;}
.seg button.on{background:var(--ink);color:var(--paper2);}
.range{-webkit-appearance:none;appearance:none;width:100%;height:5px;border-radius:3px;background:var(--line);outline:none;}
.range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;
  background:var(--hl);border:2px solid var(--ink);cursor:pointer;}
.range::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--hl);border:2px solid var(--ink);cursor:pointer;}
.row{display:flex;align-items:center;gap:12px;}
.item-row{display:flex;gap:13px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line);}
.stars{display:flex;gap:3px;}
.star{cursor:pointer;color:var(--line);transition:color .1s ease;}
.star.on{color:var(--slate);}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px;}
.bar{height:7px;border-radius:4px;background:var(--paper);overflow:hidden;border:1px solid var(--line);}
.bar > span{display:block;height:100%;background:var(--slate);}
.avatar{width:38px;height:38px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
  color:#fff;font-family:var(--disp);font-weight:600;font-size:16px;}
.feeditem{padding:14px 0;border-bottom:1px solid var(--line);}
.iconbtn{background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;gap:5px;font-family:var(--ui);font-size:13px;}
.iconbtn.on{color:var(--stamp);}
.input{width:100%;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:11px 12px;
  font-family:var(--ui);font-size:14px;color:var(--ink);resize:none;}
.input:focus{outline:none;border-color:var(--ink);}
.empty{text-align:center;padding:48px 20px;color:var(--muted);}
.progress{height:3px;background:var(--line);border-radius:2px;overflow:hidden;margin:0 0 18px;}
.progress > span{display:block;height:100%;background:var(--hl-deep);transition:width .3s ease;}
@media (prefers-reduced-motion: reduce){.btn,.act,.swipecard{transition:none !important;}}
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
  const fmtCount = (c) => (c >= 1000 ? Math.round(c / 1000) + "k" : c);
  const isPop = r.source === "Deezer";
  const style = dark ? {} : { position: "static", background: "transparent", color: "var(--ink2)", padding: 0 };
  return (
    <span className={dark ? "ext-pill" : "cat-no"} style={style} title={r.source}>
      {isPop ? <>▶ {r.value} · {r.source} charts</> : <>★ {r.value} · {fmtCount(r.count)} on {r.source}</>}
    </span>
  );
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
