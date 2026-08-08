import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, BookOpen, Film, Tv, Music, UtensilsCrossed, Sparkles, Shield, Compass, Layers } from "lucide-react";
import { DOMAINS, DOMAIN_KEYS } from "../domains.js";
import { Cover } from "./bits.jsx";

const ICONS = { books: BookOpen, movies: Film, tv: Tv, music: Music, restaurants: UtensilsCrossed };

/* Reveal-on-scroll. One observer per element, unobserved after firing so a
   long page never keeps dozens of callbacks alive. Reduced-motion users get
   everything visible immediately. */
function useReveal(rootMargin = "0px 0px -12% 0px") {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.unobserve(el); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, shown];
}

function Reveal({ delay = 0, children, style }) {
  const [ref, shown] = useReveal();
  return (
    <div ref={ref} className={"reveal" + (shown ? " in" : "")} style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

/* Counts up once visible. Uses rAF rather than a timer so it tracks real
   elapsed time and cannot drift or over-shoot. */
function CountUp({ to, ms = 900 }) {
  const [ref, shown] = useReveal("0px"); // may sit above the fold
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!shown) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(to); return; }
    let raf, start;
    const tick = (t) => {
      start ??= t;
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); // ease-out
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, to, ms]);
  return <span ref={ref}>{n.toLocaleString()}</span>;
}

/**
 * The thesis, animated: a scattered pile of covers (the overwhelm) collapses
 * into one considered card (the point of the app).
 */
function ChaosToOrder({ items }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setSettled(true); return; }
    const loop = setInterval(() => setSettled((s) => !s), 3600);
    const first = setTimeout(() => setSettled(true), 900);
    return () => { clearInterval(loop); clearTimeout(first); };
  }, []);
  // deterministic scatter so the layout never jumps between renders
  const scatter = useMemo(() => items.map((_, i) => {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.6789;
    return { x: ((a - Math.floor(a)) - 0.5) * 190, y: ((b - Math.floor(b)) - 0.5) * 90, r: ((a - Math.floor(a)) - 0.5) * 55 };
  }), [items]);

  return (
    <div className="chaos" aria-hidden="true">
      {items.map((it, i) => (
        <div key={it.id} className={"chaos-card" + (settled ? " settled" : "")}
          style={{
            transform: settled
              ? `translate(${(i - (items.length - 1) / 2) * 7}px, ${i * -2}px) rotate(${(i - 2) * 1.6}deg) scale(${i === items.length - 1 ? 1 : 0.97})`
              : `translate(${scatter[i].x}px, ${scatter[i].y}px) rotate(${scatter[i].r}deg)`,
            zIndex: i, transitionDelay: `${i * 55}ms`,
          }}>
          <Cover item={it} size="md" />
        </div>
      ))}
      <div className={"chaos-label" + (settled ? " in" : "")}>
        <span className="cat-no">{settled ? "one pick, explained" : "everything, all at once"}</span>
      </div>
    </div>
  );
}

/* An endless drift of real artwork — proof the catalogue is real, not lorem. */
function Marquee({ items, reverse = false }) {
  const row = [...items, ...items]; // duplicated so the loop seams invisibly
  return (
    <div className="marquee" aria-hidden="true">
      <div className={"marquee-row" + (reverse ? " rev" : "")}>
        {row.map((it, i) => (
          <div className="marquee-item" key={it.id + "-" + i}><Cover item={it} size="sm" /></div>
        ))}
      </div>
    </div>
  );
}

/* Auto-playing swipe demo: shows the core interaction without asking for it. */
function SwipeDemo({ items }) {
  const [i, setI] = useState(0);
  const [fling, setFling] = useState(null);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let t2;
    const t1 = setInterval(() => {
      setFling(Math.random() > 0.45 ? "right" : "left");
      t2 = setTimeout(() => { setFling(null); setI((v) => (v + 1) % items.length); }, 420);
    }, 2200);
    return () => { clearInterval(t1); clearTimeout(t2); };
  }, [items.length]);

  const item = items[i];
  const next = items[(i + 1) % items.length];
  if (!item) return null;
  return (
    <div className="demo" aria-hidden="true">
      <div className="demo-card back"><Cover item={next} size="md" /></div>
      <div className={"demo-card front" + (fling ? " fling-" + fling : "")}>
        <Cover item={item} size="md" />
        <span className={"demo-stamp " + (fling || "")}>{fling === "right" ? "SAVE" : fling === "left" ? "PASS" : ""}</span>
      </div>
    </div>
  );
}

export default function Landing({ onPick, onSkip, onClose = null, revisiting = false }) {
  const total = DOMAIN_KEYS.reduce((a, k) => a + DOMAINS[k].items.length, 0);
  // A handful of real, image-bearing items per domain for the visuals.
  const pick = (key, n) => [...DOMAINS[key].items].filter((i) => i.image).slice(0, n);
  const heroCards = useMemo(() => [
    ...pick("books", 1), ...pick("movies", 1), ...pick("tv", 1), ...pick("music", 1), ...pick("restaurants", 1),
  ], []);
  const marqueeA = useMemo(() => [...pick("movies", 7), ...pick("books", 7)], []);
  const marqueeB = useMemo(() => [...pick("tv", 7), ...pick("music", 7)], []);
  const demoCards = useMemo(() => pick("movies", 6), []);

  return (
    <div className="landing">
      {onClose && (
        <button className="iconbtn backbar" onClick={onClose}>
          <ArrowLeft size={15} /> Back to my deck
        </button>
      )}

      {/* ---- hero ------------------------------------------------------- */}
      <section className="lz hero">
        <div className="eyebrow float-in">№ 000 · One engine, five cravings</div>
        <h1 className="h1 hero-h">
          <span className="line" style={{ animationDelay: "60ms" }}>You don't need</span>
          <span className="line" style={{ animationDelay: "160ms" }}><span className="hl">more options.</span></span>
          <span className="line" style={{ animationDelay: "260ms" }}>You need fewer,</span>
          <span className="line" style={{ animationDelay: "360ms" }}>better ones.</span>
        </h1>
        <p className="sub float-in" style={{ animationDelay: "480ms", maxWidth: 380 }}>
          Every app you own is optimised to keep you choosing. Decluttered is built to get you
          to <b>one good pick</b> — a book, a film, a show, a song, a table — and then get out of your way.
        </p>

        <ChaosToOrder items={heroCards} />

        <div className="float-in" style={{ animationDelay: "620ms" }}>
          {revisiting ? (
            <button className="btn btn-primary btn-block" onClick={onClose}>
              Back to my deck <ArrowRight size={16} style={{ verticalAlign: "-3px" }} />
            </button>
          ) : (
            <>
              <button className="btn btn-primary btn-block" onClick={() => onPick("books")}>
                Build my taste profile <ArrowRight size={16} style={{ verticalAlign: "-3px" }} />
              </button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onSkip}>
                Skip setup — just start swiping
              </button>
            </>
          )}
          <p className="cat-no" style={{ textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
            ~60 seconds · <CountUp to={total} /> real books, films, shows, tracks and restaurants
          </p>
        </div>
      </section>

      <Marquee items={marqueeA} />

      {/* ---- the problem ------------------------------------------------ */}
      <section className="lz">
        <Reveal><div className="eyebrow">The problem</div></Reveal>
        <Reveal delay={60}>
          <h2 className="h1" style={{ fontSize: 27, margin: "8px 0 14px" }}>
            Choosing has become a second job.
          </h2>
        </Reveal>
        {[
          ["Endless shelves", "Five streamers, three bookshops, every restaurant in the city — all one tap away, none of them ranked for you."],
          ["Research fatigue", "You open six tabs of reviews to decide on dinner, then pick the place you already knew."],
          ["Feeds that profit from the scroll", "The algorithm is graded on how long you browse, not on whether you found something good."],
        ].map(([t, d], i) => (
          <Reveal key={t} delay={120 + i * 90}>
            <div className="card problem-card">
              <div className="serif" style={{ fontWeight: 600, fontSize: 17, marginBottom: 4 }}>{t}</div>
              <p className="sub" style={{ margin: 0 }}>{d}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* ---- how it works ----------------------------------------------- */}
      <section className="lz">
        <Reveal><div className="eyebrow">How it works</div></Reveal>
        <Reveal delay={60}>
          <h2 className="h1" style={{ fontSize: 27, margin: "8px 0 6px" }}>
            Teach it once. Swipe from then on.
          </h2>
        </Reveal>
        <Reveal delay={110}>
          <p className="sub" style={{ margin: "0 0 16px" }}>
            A minute of setup buys a deck that is already yours — then every swipe sharpens it.
          </p>
        </Reveal>

        <div className="steps">
          {[
            [Compass, "Say what you like", "Pick a few genres and favourites. Or skip it entirely and let the swipes do the talking."],
            [Layers, "Swipe a ranked deck", "No infinite grid. One card at a time, ordered by how well it fits you."],
            [Sparkles, "Watch it get sharper", "Every save, pass and star rating retrains the profile — and each pick explains itself."],
          ].map(([Icon, t, d], i) => (
            <Reveal key={t} delay={140 + i * 100}>
              <div className="step">
                <div className="step-n"><Icon size={17} /></div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{t}</div>
                  <p className="sub" style={{ margin: "3px 0 0" }}>{d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={460}><SwipeDemo items={demoCards} /></Reveal>
      </section>

      <Marquee items={marqueeB} reverse />

      {/* ---- the five cravings ------------------------------------------ */}
      <section className="lz">
        <Reveal><div className="eyebrow">Five cravings, one engine</div></Reveal>
        <Reveal delay={60}>
          <h2 className="h1" style={{ fontSize: 27, margin: "8px 0 6px" }}>Start anywhere.</h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="sub" style={{ margin: "0 0 16px" }}>
            Each craving keeps its own taste profile, library and streak. The same engine runs all five.
          </p>
        </Reveal>
        <div className="craving-grid">
          {DOMAIN_KEYS.map((k, i) => {
            const d = DOMAINS[k];
            const Icon = ICONS[k];
            return (
              <Reveal key={k} delay={140 + i * 70}>
                <button className={"craving dom-" + k} onClick={() => onPick(k)}>
                  <div className="row" style={{ gap: 9 }}>
                    <Icon size={17} />
                    <span className="serif" style={{ fontWeight: 700, fontSize: 17 }}>{d.name}</span>
                    <ArrowRight size={14} style={{ marginLeft: "auto" }} />
                  </div>
                  <div className="cat-no" style={{ marginTop: 5 }}>
                    {d.items.length.toLocaleString()} {d.nounPlural} · {d.ratingSource}
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---- why it's different ------------------------------------------ */}
      <section className="lz">
        <Reveal><div className="eyebrow">Why it's different</div></Reveal>
        <Reveal delay={60}>
          <h2 className="h1" style={{ fontSize: 27, margin: "8px 0 14px" }}>
            Built to end the search, not extend it.
          </h2>
        </Reveal>
        {[
          [Shield, "Your taste stays on your device", "No account, no tracking, no ad model. The profile lives in your browser and you can wipe it in two taps."],
          [Sparkles, "Every suggestion shows its work", "A percentage, a breakdown, and what critics actually said — so you can disagree with it."],
          [Compass, "Seven ways to surface things", "Not one algorithm chasing similarity. Hidden gems, crowd favourites, mood matches, and a row built to stretch you."],
        ].map(([Icon, t, d], i) => (
          <Reveal key={t} delay={110 + i * 90}>
            <div className="card diff-card">
              <div className="row" style={{ gap: 9, marginBottom: 4 }}>
                <Icon size={15} style={{ color: "var(--hl-deep)", flex: "none" }} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>{t}</span>
              </div>
              <p className="sub" style={{ margin: 0 }}>{d}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* ---- close ------------------------------------------------------- */}
      <section className="lz close">
        <Reveal>
          <h2 className="h1" style={{ fontSize: 30, margin: "0 0 10px" }}>
            Stop researching. <span className="hl">Start enjoying.</span>
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="sub" style={{ margin: "0 0 18px" }}>
            Pick a craving and you'll have something worth your evening before the kettle boils.
          </p>
        </Reveal>
        <Reveal delay={140}>
          {revisiting ? (
            <button className="btn btn-hl btn-block" onClick={onClose}>
              Back to my deck <ArrowRight size={16} style={{ verticalAlign: "-3px" }} />
            </button>
          ) : (
            <>
              <button className="btn btn-hl btn-block" onClick={() => onPick("books")}>
                Get started <ArrowRight size={16} style={{ verticalAlign: "-3px" }} />
              </button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onSkip}>
                Skip setup — just start swiping
              </button>
            </>
          )}
        </Reveal>
      </section>
    </div>
  );
}
