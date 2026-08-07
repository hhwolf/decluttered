import { useState } from "react";
import { Heart, MessageCircle, Send } from "lucide-react";
import { Cover } from "./bits.jsx";

const SEED_USERS = [
  { id: "u_mara", name: "Mara Quiñones", handle: "marataste", avatar: "#7A2E3A" },
  { id: "u_dev", name: "Devon Park", handle: "devon_pp", avatar: "#1F2A44" },
  { id: "u_ife", name: "Ife Adeyemi", handle: "ife.digs", avatar: "#2E4F4A" },
  { id: "u_sol", name: "Sol Brenner", handle: "solb", avatar: "#5A4632" },
];

// Seed posts reference items by position in the domain catalogue so every
// domain gets a plausible feed without hardcoding ids.
export function seedFeed(domain) {
  const it = (n) => domain.items[n]?.id;
  const now = Date.now();
  const verbs = {
    books: ["Read it in one sitting. The kind of book that rearranges the furniture in your head.",
      "Hot take: pacing is underrated. I'll forgive almost anything if it never lets me put it down."],
    restaurants: ["Went on a Tuesday, still had to wait — worth every minute of it.",
      "Hot take: a great room with mid food beats great food in a sad room. Fight me."],
    music: ["Had this on repeat all week. The bridge is doing something illegal.",
      "Hot take: a perfect 2:45 single beats any 6-minute epic."],
    movies: ["Watched it twice in one weekend. The last twenty minutes earn everything.",
      "Hot take: a tight 100 minutes beats a baggy masterpiece every single time."],
    tv: ["Three episodes in I cancelled my plans. It knows exactly what it's doing.",
      "Hot take: a great finale is rarer than a great pilot — judge shows by how they land."],
  }[domain.key] || ["Believe the hype on this one.", "Hot take: taste beats trend, every time."];
  return [
    { id: "s1", userId: "u_mara", type: "rated", itemId: it(5), rating: 5, text: verbs[0], ts: now - 1000 * 60 * 42, likes: 14, likedByMe: false, comments: [{ user: "u_dev", text: "adding to my list right now" }] },
    { id: "s2", userId: "u_dev", type: "note", text: verbs[1], ts: now - 1000 * 60 * 60 * 3, likes: 9, likedByMe: false, comments: [] },
    { id: "s3", userId: "u_ife", type: "shelved", itemId: it(11), text: "Everyone keeps telling me to start here. Intimidated but in.", ts: now - 1000 * 60 * 60 * 9, likes: 6, likedByMe: false, comments: [] },
    { id: "s4", userId: "u_sol", type: "rated", itemId: it(2), rating: 4, text: "Believe the hype. Still thinking about it.", ts: now - 1000 * 60 * 60 * 26, likes: 11, likedByMe: false, comments: [] },
  ].filter((f) => f.type === "note" || f.itemId);
}

export default function Feed({ domain, feed, setFeed, shelf, onOpen }) {
  const [draft, setDraft] = useState("");
  const [openComments, setOpenComments] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    setFeed([{ id: "p" + Date.now(), userId: "me", type: "note", text, ts: Date.now(), likes: 0, likedByMe: false, comments: [] }, ...feed]);
    setDraft("");
  };
  const toggleLike = (id) => setFeed(feed.map((f) => f.id === id
    ? { ...f, likedByMe: !f.likedByMe, likes: f.likes + (f.likedByMe ? -1 : 1) } : f));
  const addComment = (id) => {
    const text = commentDraft.trim(); if (!text) return;
    setFeed(feed.map((f) => f.id === id ? { ...f, comments: [...f.comments, { user: "me", text }] } : f));
    setCommentDraft("");
  };
  const userOf = (uid) => uid === "me"
    ? { name: "You", handle: "you", avatar: "#3E5366" }
    : SEED_USERS.find((u) => u.id === uid) || { name: "Someone", handle: "someone", avatar: "#555" };
  const timeAgo = (ts) => {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + "m"; const h = Math.floor(m / 60);
    if (h < 24) return h + "h"; return Math.floor(h / 24) + "d";
  };
  const shelvedVerb = { books: "Shelved", restaurants: "Bookmarked", music: "Queued" }[domain.key] || "Saved";

  return (
    <div>
      <div className="eyebrow">The commons</div>
      <h2 className="h1" style={{ fontSize: 26, margin: "6px 0 4px" }}>The feed</h2>
      <p className="sub" style={{ margin: "0 0 14px" }}>
        A preview of the social layer with sample activity — your own posts stay on this device.
      </p>

      <div className="card" style={{ marginBottom: 8 }}>
        <textarea className="input" rows={2} placeholder={`What are you into? Recommend, react, ask…`}
          value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
          <span className="cat-no">{Object.values(shelf).filter((s) => s.status === "want").length} on your list</span>
          <button className="btn btn-hl" style={{ padding: "9px 16px" }} onClick={post} disabled={!draft.trim()}>
            <Send size={14} style={{ verticalAlign: "-2px" }} /> Post
          </button>
        </div>
      </div>

      {feed.map((f) => {
        const u = userOf(f.userId);
        const item = f.itemId ? domain.items.find((b) => b.id === f.itemId) : null;
        return (
          <div className="feeditem" key={f.id}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="avatar" style={{ background: u.avatar }}>{u.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 7 }}>
                  <span style={{ fontWeight: 600, fontSize: 14.5 }}>{u.name}</span>
                  <span className="cat-no">@{u.handle} · {timeAgo(f.ts)}</span>
                  {f.userId !== "me" && (
                    <span className="cat-no" style={{ marginLeft: "auto", flex: "none", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 7px" }}>demo</span>
                  )}
                </div>
                <p className="serif" style={{ fontSize: 15.5, lineHeight: 1.45, margin: "5px 0 0" }}>
                  {f.type === "rated" && item ? <>Rated <b>{item.title}</b> {"★".repeat(f.rating)}{" — "}</> :
                   f.type === "shelved" && item ? <>{shelvedVerb} <b>{item.title}</b>. </> : null}
                  {f.text}
                </p>
                {item && (
                  <button className="row" onClick={() => onOpen(item)} aria-label={`Open details for ${item.title}`}
                    style={{ marginTop: 10, gap: 11, background: "var(--paper2)", border: "1px solid var(--line)",
                      borderRadius: 10, padding: 9, width: "100%", cursor: "pointer", textAlign: "left" }}>
                    <Cover item={item} size="sm" />
                    <div>
                      <div className="serif" style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                      <div className="cat-no">{item.subtitle}</div>
                    </div>
                  </button>
                )}
                <div className="row" style={{ gap: 18, marginTop: 10 }}>
                  <button className={"iconbtn" + (f.likedByMe ? " on" : "")} onClick={() => toggleLike(f.id)}>
                    <Heart size={15} fill={f.likedByMe ? "currentColor" : "none"} /> {f.likes || 0}
                  </button>
                  <button className="iconbtn" onClick={() => setOpenComments(openComments === f.id ? null : f.id)}>
                    <MessageCircle size={15} /> {f.comments.length || 0}
                  </button>
                </div>
                {openComments === f.id && (
                  <div style={{ marginTop: 10 }}>
                    {f.comments.map((c, idx) => (
                      <div key={idx} className="row" style={{ alignItems: "flex-start", marginBottom: 7 }}>
                        <span className="cat-no" style={{ fontWeight: 600, color: "var(--ink)" }}>{userOf(c.user).name}</span>
                        <span style={{ fontSize: 13.5, color: "var(--ink2)" }}>{c.text}</span>
                      </div>
                    ))}
                    <div className="row" style={{ marginTop: 6 }}>
                      <input className="input" style={{ padding: "8px 10px" }} placeholder="Reply…"
                        value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addComment(f.id)} />
                      <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => addComment(f.id)}>Reply</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
