import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./arena.css";
import "./swap.css";

// Hustle Swap — founders upload their company, the wheel hands each one to
// someone else, and they rebrand it with the prompt below. Same Supabase
// project as the main site; swap_* tables and the hustle-swap bucket come
// from hustle-swap-migration.sql at the repo root.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const BUCKET = "hustle-swap";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // matches the bucket's file_size_limit
const AUTHOR_KEY = "hustle-swap-author";
const CLAUDE_CODE_URL = "https://claude.com/product/claude-code";

const TABS = [
  { path: "/swap", label: "Submit" },
  { path: "/swap/companies", label: "Companies" },
  { path: "/swap/wheel", label: "Wheel" },
  { path: "/swap/prompt", label: "Prompt" },
  { path: "/swap/feed", label: "Feed" },
];

const BRAND_PROMPT = `You are a senior brand designer who has just been hired to rebrand a business I'm taking over. Build a complete brand system for it, presented as one polished, scrollable brand book I can show to a team.

THE BUSINESS
- Name: [business name, or "needs a new name"]
- What it does, in one sentence: [...]
- Who the customers are: [...]
- What's wrong with the current brand: [...]
- What I want people to feel: [3 words, e.g. "friendly, sharp, trustworthy"]
- Brands I admire, and why: [2–3 examples]
- Existing assets I'm keeping: [logo file, colors, name, or "nothing, start fresh"]

BEFORE YOU DESIGN
Ask me up to 5 questions if anything above is missing or vague. Don't guess the audience or the product.
If I give you a logo or any asset, use it exactly as provided. Don't redraw or "improve" it unless I ask.

WHAT TO DELIVER, IN THIS ORDER
1. Cover: logo, name, tagline.
2. The idea: one paragraph on who this brand is for, plus three rules that run everything.
3. Logo: primary, reversed, and one accent version; horizontal and stacked lockups; clear space; minimum size; 5 "don't" examples.
4. Mascot (if it fits the brand): a name, a short personality, 5–7 expressions each tied to a real moment in the business (greeting, working, success, error...), how it talks with sample lines, and rules for when it appears.
5. Color: a small palette, 2–3 core colors plus one accent, with hex codes, what each is for, rough proportions, and contrast notes.
6. Type: a display font and a body font, both free, with a size scale and one sentence on why the pairing fits.
7. Voice: three tone rules, a primary tagline, 4–5 alternates with a note on where each is used, 5–7 short punchlines for social or ads, a "before → after" rewrite table, and a words-we-use / words-we-avoid list.
8. Applications: show the brand working on real things: app icon or storefront sign, website hero, a social post, a phone screen, and merch or packaging.

HOW TO WORK
- Commit to one strong direction. Don't give me five weak options.
- Keep it simple: fewer colors, fewer words, one clear idea per page.
- Write real copy for this business. No lorem ipsum, no generic filler.
- If a fact is missing, like a price or address, put [BRACKETS] around it instead of making it up.
- When you're done, tell me in 3 sentences what you decided and what I should double-check.`;

function getAuthor() {
  try {
    return window.localStorage.getItem(AUTHOR_KEY) || "";
  } catch {
    return "";
  }
}

function saveAuthor(name) {
  try {
    window.localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    // private mode — the name just won't be remembered
  }
}

function normalizeUrl(raw) {
  const s = raw.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

function prettyUrl(url) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function fmtBytes(n) {
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function fileExt(name) {
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return (ext || "file").slice(0, 5).toUpperCase();
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return new Date(iso).toLocaleDateString();
}

async function uploadFile(folder, file) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { name: file.name, url: data.publicUrl, size: file.size, type: file.type };
}

function useCompanies(intervalMs = 4000) {
  const [companies, setCompanies] = useState(null); // null until the first load lands
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("swap_companies")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      setError("Couldn't load companies — retrying.");
      return;
    }
    setError("");
    setCompanies(data);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { companies: companies || [], loaded: companies !== null, error, refresh };
}

// ─── Submit ─────────────────────────────────────────────────────

function Submit({ nav }) {
  const [name, setName] = useState("");
  const [founder, setFounder] = useState(getAuthor);
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState(null);
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logoRef = useRef(null);
  const filesRef = useRef(null);

  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => logoPreview && URL.revokeObjectURL(logoPreview), [logoPreview]);

  function addFiles(list) {
    const picked = Array.from(list);
    const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) {
      setError(`Over 50 MB, skipped: ${tooBig.map((f) => f.name).join(", ")}`);
    } else {
      setError("");
    }
    setFiles((cur) => [...cur, ...picked.filter((f) => f.size <= MAX_FILE_BYTES)]);
  }

  function pickLogo(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Logo needs to be an image (PNG, JPG, SVG…).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Logo is over 50 MB.");
      return;
    }
    setError("");
    setLogo(file);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy || !name.trim() || !founder.trim()) return;
    setBusy(true);
    setError("");
    const folder = crypto.randomUUID();
    const total = files.length + (logo ? 1 : 0);
    let done = 0;
    try {
      let logoUrl = null;
      if (logo) {
        setStatus(`Uploading ${++done} of ${total}…`);
        logoUrl = (await uploadFile(folder, logo)).url;
      }
      const uploaded = [];
      for (const f of files) {
        setStatus(`Uploading ${++done} of ${total}…`);
        uploaded.push(await uploadFile(folder, f));
      }
      setStatus("Saving…");
      const { error } = await supabase.from("swap_companies").insert({
        name: name.trim(),
        founder: founder.trim(),
        website: normalizeUrl(website),
        description: description.trim(),
        logo_url: logoUrl,
        files: uploaded,
      });
      if (error) throw new Error(error.message);
      saveAuthor(founder.trim());
      nav("/swap/companies");
    } catch (err) {
      setError(`Upload failed — ${err.message}. Nothing was saved; try again.`);
      setStatus("");
      setBusy(false);
    }
  }

  return (
    <>
      <p className="kicker">Hustle Swap</p>
      <h1 className="headline">
        Hand Over <em>Your Hustle.</em>
      </h1>
      <p className="sub">
        Upload your company and everything someone would need to rebrand it: logo,
        website, decks, docs, photos. The wheel decides who gets it.
      </p>

      <form onSubmit={submit}>
        <label className="flabel" htmlFor="sw-name">Company name</label>
        <input id="sw-name" className="field" value={name} maxLength={80} required
          onChange={(e) => setName(e.target.value)} placeholder="e.g. Sparkli" />

        <label className="flabel" htmlFor="sw-founder">Your name</label>
        <input id="sw-founder" className="field" value={founder} maxLength={80} required
          autoComplete="name" onChange={(e) => setFounder(e.target.value)}
          placeholder="First and last name" />

        <label className="flabel" htmlFor="sw-site">Website (optional)</label>
        <input id="sw-site" className="field" value={website} inputMode="url"
          autoCapitalize="off" autoCorrect="off"
          onChange={(e) => setWebsite(e.target.value)} placeholder="yourcompany.com" />

        <label className="flabel" htmlFor="sw-desc">What it does (optional)</label>
        <textarea id="sw-desc" className="field sw-textarea" value={description}
          maxLength={500} rows={3} onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two sentences" />

        <label className="flabel">Logo (optional)</label>
        <input ref={logoRef} type="file" accept="image/*" hidden
          onChange={(e) => { pickLogo(e.target.files[0]); e.target.value = ""; }} />
        {logo ? (
          <div className="sw-filerow">
            <img className="sw-logo-preview" src={logoPreview} alt="" />
            <span className="sw-filename">{logo.name}</span>
            <button type="button" className="sw-x" onClick={() => setLogo(null)}
              aria-label="Remove logo">×</button>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => logoRef.current.click()}>
            Choose logo
          </button>
        )}

        <label className="flabel">Materials (optional)</label>
        <p className="sw-hint">PDF, DOCX, PPTX, JPEG, PNG, anything. Up to 50 MB each.</p>
        <input ref={filesRef} type="file" multiple hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {files.map((f, i) => (
          <div className="sw-filerow" key={i + f.name}>
            <span className="sw-ext">{fileExt(f.name)}</span>
            <span className="sw-filename">{f.name}</span>
            <span className="sw-size">{fmtBytes(f.size)}</span>
            <button type="button" className="sw-x" aria-label={`Remove ${f.name}`}
              onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="btn btn--ghost" style={{ marginTop: 8 }}
          onClick={() => filesRef.current.click()}>
          {files.length ? "Add more files" : "Attach files"}
        </button>

        <div style={{ marginTop: 28 }}>
          <button className="btn" type="submit" disabled={busy || !name.trim() || !founder.trim()}>
            {busy ? status || "Submitting…" : "Submit my company"}
          </button>
        </div>
        {error && <p className="sub sw-error">{error}</p>}
      </form>
    </>
  );
}

// ─── Companies ──────────────────────────────────────────────────

function CompanyCard({ c, highlight }) {
  return (
    <div className={"card sw-company" + (highlight ? " sw-company--hl" : "")}>
      <div className="sw-company-head">
        {c.logo_url ? (
          <img className="sw-logo" src={c.logo_url} alt={`${c.name} logo`} />
        ) : (
          <div className="sw-logo sw-logo--empty">{c.name.slice(0, 1).toUpperCase()}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <h3>{c.name}</h3>
          <p className="founder">{c.founder}</p>
        </div>
      </div>
      {c.description && <p className="tagline">{c.description}</p>}
      {c.website && (
        <a className="sw-link" href={c.website} target="_blank" rel="noopener noreferrer">
          {prettyUrl(c.website)} ↗
        </a>
      )}
      {c.files?.length > 0 && (
        <div className="sw-files">
          {c.files.map((f) => (
            <a className="sw-filerow sw-filerow--link" key={f.url} href={f.url}
              target="_blank" rel="noopener noreferrer" download={f.name}>
              <span className="sw-ext">{fileExt(f.name)}</span>
              <span className="sw-filename">{f.name}</span>
              <span className="sw-size">{fmtBytes(f.size)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Companies({ nav }) {
  const { companies, loaded, error } = useCompanies();
  if (!loaded && !error) return <p className="sub">Loading…</p>;
  return (
    <>
      <p className="kicker">In the pool</p>
      <h1 className="headline">
        {companies.length} <em>{companies.length === 1 ? "Company" : "Companies"}</em>
      </h1>
      {error && <p className="sub sw-error">{error}</p>}
      {companies.length === 0 && !error && (
        <p className="sub">Nothing yet. Be the first to submit.</p>
      )}
      {[...companies].reverse().map((c) => <CompanyCard key={c.id} c={c} />)}
      <div style={{ marginTop: 24 }}>
        <button type="button" className="btn btn--ghost" onClick={() => nav("/swap")}>
          Submit a company
        </button>
      </div>
    </>
  );
}

// ─── Wheel ──────────────────────────────────────────────────────

const WHEEL_COLORS = ["#e76e6e", "#1c1c22", "#b84b4b", "#2a2a32"];
const SPIN_MS = 5200;

function polar(r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

function Wheel() {
  const { companies } = useCompanies(5000);
  const [mode, setMode] = useState("companies");
  const [custom, setCustom] = useState("");
  const [removeWinners, setRemoveWinners] = useState(true);
  const [picked, setPicked] = useState([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  // Snapshot of the slices taken at spin time, so a company submitted mid-spin
  // (or the winner being removed) can't redraw the wheel under the pointer.
  const [frozen, setFrozen] = useState(null);

  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const all = useMemo(() => {
    if (mode === "companies") return companies.map((c) => ({ key: c.id, label: c.name, company: c }));
    return custom.split("\n").map((s) => s.trim()).filter(Boolean)
      .map((s, i) => ({ key: `${i}:${s}`, label: s }));
  }, [mode, companies, custom]);

  const live = removeWinners ? all.filter((e) => !picked.includes(e.key)) : all;
  const entries = frozen || live;
  const n = entries.length;
  const seg = n ? 360 / n : 360;

  function spin() {
    if (spinning || live.length < 2) return;
    const pool = live;
    const slice = 360 / pool.length;
    const i = Math.floor(Math.random() * pool.length);
    // Land the pointer (at 12 o'clock) inside segment i, away from its edges.
    const jitter = (Math.random() - 0.5) * slice * 0.7;
    const target = (((360 - (i + 0.5) * slice + jitter) % 360) + 360) % 360;
    const current = ((rotation % 360) + 360) % 360;
    const next = rotation + 360 * 6 + ((target - current + 360) % 360);
    setWinner(null);
    setFrozen(pool);
    setSpinning(true);
    setRotation(next);
    setTimeout(() => {
      setSpinning(false);
      setWinner(pool[i]);
      if (removeWinners) setPicked((p) => [...p, pool[i].key]);
    }, reducedMotion ? 50 : SPIN_MS);
  }

  const label = (s) => (s.length > 18 ? s.slice(0, 17) + "…" : s);

  return (
    <>
      <p className="kicker">Hustle Swap</p>
      <h1 className="headline">
        Spin the <em>Wheel</em>
      </h1>

      <div className="sw-seg" role="group" aria-label="Wheel entries">
        <button type="button" className={"chip" + (mode === "companies" ? " on" : "")}
          onClick={() => { setMode("companies"); setFrozen(null); }}>Companies</button>
        <button type="button" className={"chip" + (mode === "custom" ? " on" : "")}
          onClick={() => { setMode("custom"); setFrozen(null); }}>Custom list</button>
      </div>
      {mode === "custom" && (
        <textarea className="field sw-textarea" rows={4} value={custom}
          style={{ marginTop: 12 }} onChange={(e) => { setCustom(e.target.value); setFrozen(null); setWinner(null); }}
          placeholder={"One entry per line\nAlex\nJordan\nSam"} />
      )}

      <div className="sw-wheel-wrap">
        <div className="sw-pointer" aria-hidden="true" />
        <svg viewBox="0 0 200 200" className="sw-wheel" role="img"
          aria-label={`Wheel with ${n} entries`}
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning && !reducedMotion
              ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.2, 1)`
              : "none",
          }}>
          {n === 0 && <circle cx="100" cy="100" r="98" fill="#1c1c22" />}
          {n === 1 && <circle cx="100" cy="100" r="98" fill={WHEEL_COLORS[0]} />}
          {n > 1 && entries.map((e, i) => {
            const [x1, y1] = polar(98, i * seg);
            const [x2, y2] = polar(98, (i + 1) * seg);
            const large = seg > 180 ? 1 : 0;
            // n ≡ 1 (mod 4) would put the first slice's color next to itself
            return (
              <path key={e.key}
                d={`M100 100 L${x1} ${y1} A98 98 0 ${large} 1 ${x2} ${y2} Z`}
                fill={WHEEL_COLORS[n % 4 === 1 && i === n - 1 ? 2 : i % 4]}
                stroke="#0b0b0f" strokeWidth="0.6" />
            );
          })}
          {entries.map((e, i) => {
            const mid = n === 1 ? 0 : (i + 0.5) * seg;
            return (
              <text key={e.key + "t"} x="100" y="100" fill="#f1f1f3"
                fontSize={n > 16 ? 5 : n > 8 ? 6.5 : 8} fontWeight="600"
                fontFamily="Inter, sans-serif" textAnchor="end" dominantBaseline="middle"
                transform={`rotate(${mid - 90} 100 100) translate(88 0)`}>
                {label(e.label)}
              </text>
            );
          })}
          <circle cx="100" cy="100" r="9" fill="#0b0b0f" stroke="#e76e6e" strokeWidth="1.5" />
        </svg>
      </div>

      <button type="button" className="btn" onClick={spin} disabled={spinning || live.length < 2}>
        {spinning ? "Spinning…" : live.length < 2 ? "Need at least 2 entries" : "Spin"}
      </button>

      {winner && (
        <div className="pitchnow sw-winner" aria-live="polite">
          <p className="kicker">The wheel picked</p>
          <div className="pitchnow-name">{winner.label}</div>
          {winner.company && (
            <div className="pitchnow-founder">from {winner.company.founder}</div>
          )}
        </div>
      )}
      {winner?.company && <CompanyCard c={winner.company} highlight />}

      <label className="sw-check">
        <input type="checkbox" checked={removeWinners}
          onChange={(e) => { setRemoveWinners(e.target.checked); setFrozen(null); }} />
        Take winners off the wheel
      </label>
      {picked.length > 0 && (
        <button type="button" className="btn btn--ghost btn--small" style={{ marginTop: 8 }}
          onClick={() => { setPicked([]); setWinner(null); setFrozen(null); }}>
          Put all {picked.length} back on the wheel
        </button>
      )}
    </>
  );
}

// ─── Prompt ─────────────────────────────────────────────────────

function Prompt() {
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(BRAND_PROMPT);
    } catch {
      // Clipboard API blocked (http, old Safari) — select the text so they can copy by hand
      const range = document.createRange();
      range.selectNodeContents(preRef.current);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <p className="kicker">The brief</p>
      <h1 className="headline">
        Rebrand It <em>With Claude.</em>
      </h1>
      <p className="sub">
        Copy this into your own Claude Code session, fill in the brackets with the
        company you got from the wheel, and attach their logo and materials.
      </p>
      <div style={{ marginTop: 20 }}>
        <button type="button" className="btn" onClick={copy}>
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>
      <pre ref={preRef} className="sw-prompt">{BRAND_PROMPT}</pre>
      <div className="card sw-help">
        <h3>Don&rsquo;t have Claude Code yet?</h3>
        <p className="tagline">Install it, sign in, then paste the prompt into a new session.</p>
        <a className="sw-link" href={CLAUDE_CODE_URL} target="_blank" rel="noopener noreferrer">
          Get Claude Code ↗
        </a>
      </div>
    </>
  );
}

// ─── Feed ───────────────────────────────────────────────────────

function Feed() {
  const [posts, setPosts] = useState(null); // null until the first load lands
  const [author, setAuthor] = useState(getAuthor);
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("swap_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setLoadError("Couldn't load the feed — retrying.");
      return;
    }
    setLoadError("");
    setPosts(data);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function post(e) {
    e.preventDefault();
    if (busy || !author.trim() || !body.trim()) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("swap_posts").insert({
      author: author.trim(),
      body: body.trim(),
      link: normalizeUrl(link),
    });
    setBusy(false);
    if (error) {
      setError("Couldn't post — check your connection and try again.");
      return;
    }
    saveAuthor(author.trim());
    setBody("");
    setLink("");
    refresh();
  }

  return (
    <>
      <p className="kicker">Live</p>
      <h1 className="headline">
        The <em>Feed</em>
      </h1>
      <p className="sub">Links, files, updates: anything the room needs to see.</p>

      <form onSubmit={post} className="card">
        <label className="flabel" htmlFor="sw-author" style={{ marginTop: 0 }}>Your name</label>
        <input id="sw-author" className="field" value={author} maxLength={60} required
          autoComplete="name" onChange={(e) => setAuthor(e.target.value)} />
        <label className="flabel" htmlFor="sw-body">Post</label>
        <textarea id="sw-body" className="field sw-textarea" rows={3} value={body}
          maxLength={1000} required onChange={(e) => setBody(e.target.value)}
          placeholder="What does everyone need to know?" />
        <label className="flabel" htmlFor="sw-link">Link (optional)</label>
        <input id="sw-link" className="field" value={link} inputMode="url"
          autoCapitalize="off" autoCorrect="off"
          onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        <div style={{ marginTop: 16 }}>
          <button className="btn" type="submit" disabled={busy || !author.trim() || !body.trim()}>
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
        {error && <p className="sub sw-error">{error}</p>}
      </form>

      {loadError && <p className="sub sw-error">{loadError}</p>}
      {posts === null && !loadError && <p className="sub" style={{ marginTop: 24 }}>Loading…</p>}
      {posts?.length === 0 && !loadError && (
        <p className="sub" style={{ marginTop: 24 }}>No posts yet.</p>
      )}
      {posts?.map((p) => (
        <div className="sw-post" key={p.id}>
          <div className="sw-post-meta">
            <span className="sw-post-author">{p.author}</span>
            <span>{timeAgo(p.created_at)}</span>
          </div>
          <p className="sw-post-body">{p.body}</p>
          {p.link && (
            <a className="sw-link" href={p.link} target="_blank" rel="noopener noreferrer">
              {prettyUrl(p.link)} ↗
            </a>
          )}
        </div>
      ))}
    </>
  );
}

// ─── Shell ──────────────────────────────────────────────────────

export default function Swap() {
  const [path, setPath] = useState(window.location.pathname);

  const nav = useCallback((to) => {
    window.history.pushState(null, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = "Hustle Swap — Side Hustle Club";
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const clean = path.replace(/\/+$/, "") || "/swap";
  let screen;
  if (clean === "/swap/companies") screen = <Companies nav={nav} />;
  else if (clean === "/swap/wheel") screen = <Wheel />;
  else if (clean === "/swap/prompt") screen = <Prompt />;
  else if (clean === "/swap/feed") screen = <Feed />;
  else screen = <Submit nav={nav} />;

  return (
    <div className="arena">
      <nav className="sw-tabs" aria-label="Hustle Swap">
        <a className="sw-home" href="/">SHC</a>
        {TABS.map((t) => (
          <a key={t.path} href={t.path}
            className={"sw-tab" + (clean === t.path ? " on" : "")}
            aria-current={clean === t.path ? "page" : undefined}
            onClick={(e) => { e.preventDefault(); nav(t.path); }}>
            {t.label}
          </a>
        ))}
      </nav>
      <main className="arena-shell sw-shell">{screen}</main>
    </div>
  );
}
