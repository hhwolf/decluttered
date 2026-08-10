import { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { paletteFor } from "../domains.js";
import { matchLabel } from "../engine/present.mjs";

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
.taste-mark{font-family:var(--disp);font-weight:700;font-size:23px;letter-spacing:-.01em;display:flex;align-items:center;
  gap:8px;min-width:0;}
.taste-mark .dot{font-family:var(--mono);font-size:10px;color:var(--muted);font-weight:700;letter-spacing:.12em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* the tagline is decorative — drop it before it can wrap and shove the counter */
@media (max-width:420px){.taste-mark .dot{display:none;}}
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
/* left-aligned rating badge; capped so it can never slide under the match pill */
.ext-pill{position:absolute;top:16px;left:12px;max-width:44%;background:var(--ink);color:var(--paper);
  border:2px solid var(--ink);border-radius:10px;padding:6px 10px;display:flex;align-items:center;gap:5px;z-index:3;
  font-family:var(--mono);font-size:11px;font-weight:700;transform:rotate(-3deg);box-shadow:3px 3px 0 rgba(17,17,17,.25);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.match-pill span{white-space:nowrap;}
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
.starbtn{background:none;border:none;padding:0;line-height:0;cursor:pointer;border-radius:4px;}
.starbtn:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}
.star{color:var(--soft);transition:color .1s ease;pointer-events:none;}
.star.on{color:var(--ink);}

/* ---- bottom sheet (item detail) ---- */
.sheet-back{position:fixed;inset:0;background:rgba(17,17,17,.42);z-index:40;display:flex;align-items:flex-end;
  justify-content:center;animation:fade .14s ease;}
.sheet{background:var(--paper);width:100%;max-width:468px;max-height:88vh;overflow-y:auto;border:2px solid var(--ink);
  border-bottom:none;border-radius:18px 18px 0 0;padding:0 18px 26px;animation:rise .18s ease;
  -webkit-overflow-scrolling:touch;}
/* tall enough to contain the absolutely-positioned close button, or sheet
   content slides underneath it */
.sheet-grab{position:sticky;top:0;background:var(--paper);padding:10px 0 8px;display:flex;justify-content:center;
  align-items:center;z-index:2;min-height:44px;}
.sheet-grab i{width:44px;height:5px;border-radius:3px;background:var(--soft);display:block;}
.sheet-x{position:absolute;right:0;top:6px;width:32px;height:32px;border:2px solid var(--ink);border-radius:9px;
  background:var(--card);cursor:pointer;font-size:13px;font-weight:700;color:var(--ink);line-height:1;
  box-shadow:2px 2px 0 var(--ink);}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes rise{from{transform:translateY(26px)}to{transform:translateY(0)}}

/* ---- toast (undo) ---- */
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:86px;z-index:35;background:var(--ink);
  color:var(--paper);border-radius:12px;padding:10px 12px 10px 14px;display:flex;align-items:center;gap:12px;
  box-shadow:3px 3px 0 rgba(17,17,17,.3);font-size:13.5px;width:max-content;max-width:min(420px,92vw);
  animation:rise .16s ease;}
.toast > span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.toast b{font-weight:600;}
.toast button{background:var(--hl);color:#1c2406;border:2px solid var(--paper);border-radius:8px;padding:4px 10px;
  font-family:var(--ui);font-size:12.5px;font-weight:700;cursor:pointer;flex:none;}

/* ---- scroll affordance on the deck card body ---- */
.cardbody{position:relative;overflow-y:auto;flex:1;min-height:0;}
.cardfoot{flex:none;border:none;border-top:2px solid var(--line);background:var(--card);cursor:pointer;
  padding:11px 18px;display:flex;align-items:center;gap:6px;font-family:var(--ui);font-size:13px;
  font-weight:600;color:var(--slate);}
.cardfoot:hover{background:var(--paper2);}
.fademask{position:absolute;left:0;right:0;bottom:0;height:26px;pointer-events:none;
  background:linear-gradient(transparent,var(--card));}

/* ---- search + sort controls ---- */
.searchwrap{display:flex;align-items:center;gap:8px;border:2px solid var(--ink);border-radius:10px;
  background:var(--card);padding:0 10px;color:var(--muted);}
.searchinput{flex:1;min-width:0;border:none;background:none;outline:none;padding:10px 0;
  font-family:var(--ui);font-size:14px;color:var(--ink);}
.selectbox{flex:1;min-width:0;border:2px solid var(--ink);border-radius:10px;background:var(--card);
  padding:9px 10px;font-family:var(--ui);font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;}

/* ---- covers/titles as buttons (tap target without restyling) ---- */
.coverbtn{background:none;border:none;padding:0;cursor:pointer;border-radius:8px;flex:none;line-height:0;}
.coverbtn:focus-visible,.linkbtn:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}
.linkbtn{background:none;border:none;padding:0;cursor:pointer;color:var(--ink);font:inherit;display:block;}

/* ---- cross-domain rows ---- */
.domrow{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;cursor:pointer;
  padding:9px 0;border-bottom:1px solid var(--line);font-family:var(--ui);color:var(--ink);}
.domrow:last-of-type{border-bottom:none;}
.domrow:hover{background:var(--paper2);}

/* ---- streak dots ---- */
.dots{display:flex;gap:5px;}
.dots i{flex:1;height:26px;border:2px solid var(--ink);border-radius:6px;background:var(--card);display:block;}
.dots i.on{background:var(--hl);}
.dots i.today{box-shadow:0 0 0 2px var(--hl-deep);}

/* ---- share card (rendered, then exported as PNG) ---- */
.sharecard{background:var(--ink);color:var(--paper);border-radius:14px;padding:18px;}
.sharecard .sc-k{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.72;}
.sharecard .sc-v{font-family:var(--disp);font-size:21px;font-weight:700;line-height:1.15;}
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

/* ==========================================================================
   LANDING PAGE
   ========================================================================== */
.landing{padding:0 0 40px;}
.backbar{padding:14px 18px 0;}
.citynag{width:100%;cursor:pointer;margin-bottom:8px;text-align:left;}
.vibe{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  background:var(--paper2);border:1.5px solid var(--ink);border-radius:999px;padding:2px 8px;}
/* A vibe is derived from our own vectors; a fact is stated by the source. They
   should not look identical, or the guess borrows the authority of the fact. */
.vibe.fact{background:var(--ink);color:var(--paper);border-color:var(--ink);}
/* "More like this" rows — tappable, and visibly so, since they navigate. */
.linkbtn{background:none;border:none;padding:0;cursor:pointer;font-family:var(--mono);font-size:10.5px;
  font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink);text-decoration:underline;}
/* one photo per swipe, snapped */
.dishscroll{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:0;border:2px solid var(--ink);
  border-radius:10px;background:var(--paper2);-webkit-overflow-scrolling:touch;}
.dishshot{flex:0 0 100%;width:100%;height:210px;object-fit:cover;scroll-snap-align:start;display:block;}
.likerow{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;
  background:none;border:none;border-bottom:1px solid var(--line);padding:8px 0;text-align:left;
  cursor:pointer;color:var(--ink);font:inherit;}
.likerow:last-child{border-bottom:none;}
.likerow:hover:not(:disabled){background:var(--paper2);}
.likerow:disabled{cursor:default;}
.citynag:hover{background:var(--paper2);}
/* the wordmark doubles as the "what is this?" affordance */
.markbtn{border:none;background:none;padding:0;cursor:pointer;color:var(--ink);text-align:left;}
.markbtn:hover .dot{color:var(--ink);}
.markbtn:focus-visible{outline:2px solid var(--ink);outline-offset:3px;border-radius:6px;}
.lz{padding:34px 18px 6px;}
.lz.hero{padding-top:26px;}
.lz.close{padding-bottom:20px;}
.hero-h{font-size:40px;line-height:1.02;margin:14px 0 0;}
.hero-h .line{display:block;opacity:0;transform:translateY(14px);animation:lineIn .62s cubic-bezier(.2,.7,.3,1) forwards;}
@keyframes lineIn{to{opacity:1;transform:translateY(0);}}
.float-in{opacity:0;transform:translateY(12px);animation:lineIn .6s cubic-bezier(.2,.7,.3,1) .1s forwards;}

/* reveal-on-scroll */
.reveal{opacity:0;transform:translateY(18px);transition:opacity .55s ease,transform .55s cubic-bezier(.2,.7,.3,1);}
.reveal.in{opacity:1;transform:none;}

/* chaos -> order: the thesis, as a picture */
.chaos{position:relative;height:210px;margin:26px 0 22px;display:flex;align-items:center;justify-content:center;}
.chaos-card{position:absolute;border:2px solid var(--ink);border-radius:9px;overflow:hidden;
  box-shadow:3px 3px 0 var(--ink);background:var(--card);
  transition:transform 1.05s cubic-bezier(.22,.9,.24,1),filter .8s ease;filter:saturate(.75);}
.chaos-card.settled{filter:saturate(1);}
.chaos-label{position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);opacity:0;transition:opacity .5s ease .4s;
  background:var(--paper);padding:2px 8px;border-radius:999px;white-space:nowrap;}
.chaos-label.in{opacity:1;}

/* drifting proof-of-catalogue strips */
.marquee{overflow:hidden;padding:10px 0;border-top:2px solid var(--ink);border-bottom:2px solid var(--ink);
  background:var(--paper2);}
.marquee-row{display:flex;gap:10px;width:max-content;animation:drift 42s linear infinite;}
.marquee-row.rev{animation-direction:reverse;}
.marquee-item{flex:none;}
.marquee:hover .marquee-row{animation-play-state:paused;}
@keyframes drift{from{transform:translateX(0);}to{transform:translateX(-50%);}}

.problem-card{margin-bottom:10px;}
.steps{display:flex;flex-direction:column;gap:12px;}
.step{display:flex;gap:12px;align-items:flex-start;}
.step-n{flex:none;width:36px;height:36px;border-radius:10px;border:2px solid var(--ink);background:var(--hl);
  display:flex;align-items:center;justify-content:center;box-shadow:2px 2px 0 var(--ink);color:var(--ink);}

/* auto-playing swipe demo */
.demo{position:relative;height:186px;margin:22px 0 4px;display:flex;align-items:center;justify-content:center;}
.demo-card{position:absolute;border:2px solid var(--ink);border-radius:11px;overflow:hidden;background:var(--card);
  box-shadow:4px 4px 0 var(--ink);}
.demo-card.back{transform:scale(.93) translateY(9px);filter:saturate(.85);}
.demo-card.front{transition:transform .42s cubic-bezier(.4,0,.7,1),opacity .42s ease;}
.demo-card.fling-right{transform:translateX(190px) rotate(17deg);opacity:0;}
.demo-card.fling-left{transform:translateX(-190px) rotate(-17deg);opacity:0;}
.demo-stamp{position:absolute;top:12px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:12px;
  font-weight:700;letter-spacing:.1em;padding:3px 8px;border-radius:7px;border:2px solid;opacity:0;transition:opacity .12s;}
.demo-stamp.right{opacity:1;color:var(--hl-deep);border-color:var(--hl-deep);background:var(--card);}
.demo-stamp.left{opacity:1;color:var(--stamp);border-color:var(--stamp);background:var(--card);}

/* craving picker */
.craving-grid{display:flex;flex-direction:column;gap:10px;}
.craving{width:100%;text-align:left;border:2px solid var(--ink);border-radius:12px;background:var(--card);
  padding:13px 15px;cursor:pointer;box-shadow:3px 3px 0 var(--ink);transition:transform .12s ease,box-shadow .12s ease,background .12s ease;
  color:var(--ink);font-family:var(--ui);}
.craving:hover{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink);background:var(--hl);}
.craving:focus-visible{outline:2px solid var(--ink);outline-offset:3px;}
.diff-card{margin-bottom:10px;}

@media (min-width:900px){
  /* the shell is a nav-rail grid at this width; the landing is full-bleed and
     must span both columns instead of being squeezed into the rail */
  .landing{grid-column:1/-1;grid-row:2;max-width:none;}
  .lz{padding-left:0;padding-right:0;max-width:620px;margin:0 auto;}
  .hero-h{font-size:52px;}
  .chaos{height:250px;}
  .craving-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .marquee{border-radius:14px;border:2px solid var(--ink);margin:8px auto;max-width:980px;}
}
@media (prefers-reduced-motion: reduce){
  .hero-h .line,.float-in{opacity:1;transform:none;animation:none;}
  .reveal{opacity:1;transform:none;}
  .marquee-row{animation:none;}
  .chaos-card,.demo-card{transition:none;}
}

/* ==========================================================================
   DESKTOP (>=900px). The phone column is right for a swipe deck, so keep it —
   but stop wasting the rest of the screen: promote navigation to a permanent
   left rail, widen the content column, and let list/grid views use the room.
   ========================================================================== */
@media (min-width:900px){
  .taste-root{padding:0;}
  .taste-shell{max-width:1080px;border:none;display:grid;
    grid-template-columns:232px minmax(0,1fr);grid-template-rows:auto auto 1fr;
    column-gap:26px;padding:0 24px;}
  .taste-top{grid-column:1/-1;grid-row:1;padding:22px 0 14px;border-bottom:2px solid var(--ink);margin-bottom:18px;}
  .taste-mark{font-size:27px;}
  .taste-mark .dot{display:inline;}

  /* left rail: domain switcher + the former bottom tabs, stacked */
  .dombar{grid-column:1;grid-row:2;flex-direction:column;gap:7px;padding:0 0 14px;align-self:start;}
  .dombtn{justify-content:flex-start;padding:11px 13px;font-size:10.5px;gap:8px;}
  .tabbar{grid-column:1;grid-row:3;position:static;max-width:none;margin:0;flex-direction:column;
    border:2px solid var(--ink);border-radius:12px;background:var(--card);padding:7px;gap:3px;
    align-self:start;box-shadow:3px 3px 0 var(--ink);}
  .tab{flex-direction:row;justify-content:flex-start;gap:10px;padding:10px 12px;border-radius:9px;font-size:11px;}
  .tab.on{background:var(--hl);color:var(--ink);}
  .tab .ind{display:none;}

  .taste-body{grid-column:2;grid-row:2/span 2;padding:0 0 60px;}

  /* the deck stays a phone-width card, centred in the wider column */
  .deck{max-width:468px;margin:8px auto 0;}
  .actions{max-width:468px;margin-left:auto;margin-right:auto;}
  /* keep the deck's own header aligned with the card, not the full column */
  .deckhead{max-width:468px;margin-left:auto;margin-right:auto;}

  /* lists and suggestion rows finally get to breathe */
  .item-row{padding:14px 0;}
  .shelfrow{gap:16px;}
  .sugcard{width:132px;}
  .sugcard .cover{width:132px !important;height:186px !important;}
  .sheet-back{align-items:center;}
  .sheet{max-width:600px;border:2px solid var(--ink);border-radius:16px;max-height:86vh;}
  .toast{bottom:26px;}
}
/* Two-up suggestion grid on very wide screens: no more horizontal scrolling
   for rows that comfortably fit. */
@media (min-width:1180px){
  .taste-shell{max-width:1240px;grid-template-columns:248px minmax(0,1fr);}
  .shelfrow{flex-wrap:wrap;overflow-x:visible;}
}
`;

/* ---- Cover: real artwork when the catalogue has it, stylized card if not --- */
export function Cover({ item, size = "md" }) {
  const [broken, setBroken] = useState(false);
  const pal = paletteFor(item.genres?.[0]);
  const dims = { sm: [54, 80], md: [88, 132], lg: [150, 224] }[size];
  const titleSize = size === "lg" ? 19 : size === "md" ? 12.5 : 9;
  if (item.image && !broken) {
    // Real artwork stands on its own — no text overlay (every context that
    // renders a cover already shows the title next to or below it).
    return (
      <div className="cover imgcover" style={{ width: dims[0], height: dims[1], background: pal.bg, flex: "none" }}>
        <img src={item.image} alt={item.title} loading="lazy" onError={() => setBroken(true)}
          onLoad={(e) => { if (e.currentTarget.naturalWidth < 10) setBroken(true); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
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

export function Stars({ value, onChange, size = 20, label = "Overall rating" }) {
  const star = (n) => (
    <Star size={size} className={"star" + (n <= value ? " on" : "")} fill={n <= value ? "currentColor" : "none"} />
  );
  // Read-only stars stay plain svg; interactive ones are real buttons so they
  // are keyboard-reachable and announced.
  if (!onChange) return <div className="stars" role="img" aria-label={`${label}: ${value} of 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n}>{star(n)}</span>)}</div>;
  return (
    <div className="stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className="starbtn" aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={n <= value} onClick={() => onChange(n === value ? 0 : n)}>
          {star(n)}
        </button>
      ))}
    </div>
  );
}

/* ---- Chip: selectable pill that is actually a button ---------------------- */
export function Chip({ on, onClick, variant = "", children }) {
  return (
    <button type="button" className={"chip" + (variant ? " " + variant : "") + (on ? " on" : "")}
      aria-pressed={on} onClick={onClick}>{children}</button>
  );
}

/* ---- Sheet: modal bottom sheet with escape/backdrop close ----------------- */
export function Sheet({ onClose, labelledBy, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // don't scroll the page behind the sheet
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab">
          <i />
          <button type="button" className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---- Toast: transient message with one action (used for undo) ------------- */
export function Toast({ message, actionLabel, onAction, onDismiss, ms = 5000 }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
  }, [message, ms, onDismiss]);
  return (
    <div className="toast" role="status">
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      {actionLabel && <button type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

/* compact 1..5 dot rating, visually distinct from the overall stars */
export function MiniRate({ value = 0, onChange, label = "rating" }) {
  return (
    <div style={{ display: "flex", gap: 5 }} role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)}
          aria-label={`${label}: ${n} of 5`} aria-pressed={n <= value}
          style={{ width: 15, height: 15, borderRadius: "50%", padding: 0, cursor: "pointer",
            border: "1.5px solid var(--ink)", background: n <= value ? "var(--hl-deep)" : "transparent",
            transition: "background .1s ease" }} />
      ))}
    </div>
  );
}

/* External rating badge — real Google/Open Library stars or Deezer popularity. */
export function ExtRating({ item, dark = false, compact = false }) {
  const r = item.rating;
  if (!r || r.value == null) return null;
  const fmtCount = (c) => (c >= 1000000 ? (c / 1000000).toFixed(1) + "M" : c >= 1000 ? Math.round(c / 1000) + "k" : c);
  const scale = r.scale || (r.source === "Deezer" ? 100 : 5);
  const style = dark ? {} : { position: "static", background: "transparent", color: "var(--ink2)", padding: 0 };
  // Space is tight on the deck badge and in narrow suggestion cards, so those
  // drop the source name; the full string stays in the tooltip and the sheet.
  const terse = dark || compact;
  // Two of these sources measure attention, not approval, and must never render
  // as stars or read like a rating: Wikipedia's is monthly readership, Deezer's
  // is a play-driven popularity index. Only the star scales are opinions.
  const isInterest = r.source === "Wikipedia";
  const isPopularity = scale === 100 && !isInterest;
  let body;
  if (isInterest) body = terse ? <>◆ {r.value}</> : <>◆ {r.value} · Wikipedia interest</>;
  else if (isPopularity) body = terse ? <>▶ {r.value}</> : <>▶ {r.value} · {r.source} popularity</>;
  else if (scale === 10) body = terse ? <>★ {r.value}/10</> : <>★ {r.value}/10 · {r.count ? fmtCount(r.count) + " on " : ""}{r.source}</>;
  else body = terse ? <>★ {r.value}{r.count ? ` · ${fmtCount(r.count)}` : ""}</> : <>★ {r.value} · {r.count ? fmtCount(r.count) + " on " : ""}{r.source}</>;
  const full = isInterest
    ? `Wikipedia interest ${r.value}/100 — about ${(r.count || 0).toLocaleString()} readers a month. Not a rating.`
    // r.count is Deezer's raw rank here, not a tally of ratings — never show it
    // as one. How much it is played, not how much it is liked.
    : isPopularity ? `${r.source} popularity ${r.value}/100 — how much this is being played right now. Not a rating.`
    : `${r.value}${scale === 10 ? "/10" : ""}${r.count ? ` from ${r.count.toLocaleString()} ratings` : ""} on ${r.source}`;
  return <span className={dark ? "ext-pill" : "cat-no"} style={style} title={full}>{body}</span>;
}

// Wording is shared with the native client; only the colour token is web-specific.
const TONE_VAR = { strong: "var(--hl-deep)", good: "var(--slate)", ok: "var(--ink2)", weak: "var(--muted)" };
export function matchTag(score) {
  const { text, tone } = matchLabel(score);
  return { t: text, c: TONE_VAR[tone] };
}
// Shared with the native client so one item can never show two percentages.
export { displayScore, ringDegrees } from "../engine/present.mjs";

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
            <div style={{ opacity: on ? 1 : 0.92, transform: on ? "translateY(-2px)" : "none", transition: "all .12s ease",
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
