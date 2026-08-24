import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./arena.css";

// Pitch Night — adapted from the Next.js pitch-night-package to this Vite SPA.
// Same Supabase project as the main site; arena_* tables come from
// pitch-night-migration.sql at the repo root.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const STARTING_BALANCE = 100000;
const PITCH_SECONDS = 60;
const PLAYER_KEY = "pitch-night-player";

const fmt = (n) => "$" + n.toLocaleString("en-US");

function getPlayer() {
  try {
    const raw = window.localStorage.getItem(PLAYER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePlayer(p) {
  window.localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
}

function Join({ nav }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getPlayer()) nav("/arena/play", { replace: true });
  }, [nav]);

  async function join(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .from("arena_players")
      .insert({ name: trimmed })
      .select("id, name")
      .single();
    if (error || !data) {
      setError("Couldn't join — check your connection and try again.");
      setBusy(false);
      return;
    }
    savePlayer({ id: data.id, name: data.name });
    nav("/arena/play", { replace: true });
  }

  return (
    <main className="arena-shell">
      <p className="kicker">Pitch Night</p>
      <h1 className="headline">
        You&rsquo;ve Got <em>{fmt(STARTING_BALANCE)}</em>. Invest It Well.
      </h1>
      <p className="sub">
        Enter your name to get your fund. Watch the 60-second pitches, back the
        ideas you believe in. The company that raises the most wins the night.
      </p>
      <form onSubmit={join}>
        <label className="flabel" htmlFor="pn-name">
          Your name
        </label>
        <input
          id="pn-name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First and last name"
          autoComplete="name"
          maxLength={60}
          required
        />
        <div style={{ marginTop: 16 }}>
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Joining…" : "Claim my $100,000"}
          </button>
        </div>
        {error && (
          <p className="sub" style={{ color: "var(--accent)" }}>
            {error}
          </p>
        )}
      </form>
    </main>
  );
}

function Play({ nav }) {
  const [player, setPlayer] = useState(null);
  const [rows, setRows] = useState([]);
  const [spent, setSpent] = useState(0);
  const [checkInput, setCheckInput] = useState("");
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  useEffect(() => {
    const p = getPlayer();
    if (!p) {
      nav("/arena", { replace: true });
      return;
    }
    setPlayer(p);
  }, [nav]);

  const refresh = useCallback(async () => {
    const p = getPlayer();
    if (!p) return;
    const [lb, inv] = await Promise.all([
      supabase.from("arena_leaderboard").select("*"),
      supabase.from("arena_investments").select("amount").eq("player_id", p.id),
    ]);
    if (lb.data) setRows(lb.data);
    if (inv.data) setSpent(inv.data.reduce((s, r) => s + r.amount, 0));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  const balance = STARTING_BALANCE - spent;
  const check = parseInt(checkInput.replace(/[^0-9]/g, ""), 10) || 0;

  async function invest(companyId, companyName) {
    if (!player || busy) return;
    if (check <= 0) {
      showToast("Type an amount first");
      return;
    }
    if (check > balance) {
      showToast("Not enough funds left");
      return;
    }
    setBusy(companyId);
    const { data, error } = await supabase.rpc("arena_invest", {
      p_player: player.id,
      p_company: companyId,
      p_amount: check,
    });
    setBusy(null);
    if (error || data !== "ok") {
      showToast(typeof data === "string" && data !== "ok" ? data : "Something went wrong");
      return;
    }
    showToast(`${fmt(check)} into ${companyName}`);
    refresh();
  }

  if (!player) return null;

  return (
    <main className="arena-shell">
      <div className="balancebar">
        <span className="who">{player.name}</span>
        <span className="bal money">{fmt(balance)}</span>
      </div>

      <div style={{ marginTop: 20 }}>
        <label className="kicker" htmlFor="pn-check">
          Your check size
        </label>
        <input
          id="pn-check"
          className="field"
          style={{ marginTop: 10 }}
          inputMode="numeric"
          value={checkInput}
          onChange={(e) => setCheckInput(e.target.value)}
          placeholder="Type any amount, e.g. 12500"
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <p className="kicker">The companies</p>
        {rows.length === 0 && (
          <p className="sub">No companies yet — pitches are coming.</p>
        )}
        {rows.map((r) => (
          <div className="card" key={r.id}>
            <h3>{r.name}</h3>
            <p className="founder">{r.founder}</p>
            {r.tagline && <p className="tagline">{r.tagline}</p>}
            <div className="row">
              <div>
                <div className="raised money">{fmt(r.raised)}</div>
                <div className="backers">
                  {r.backers} {r.backers === 1 ? "backer" : "backers"}
                </div>
              </div>
              <button
                type="button"
                className="btn btn--small"
                disabled={busy === r.id || check <= 0 || balance < check}
                onClick={() => invest(r.id, r.name)}
              >
                {busy === r.id ? "…" : check > 0 ? `Invest ${fmt(check)}` : "Invest"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <a
          className="btn btn--ghost"
          href="/arena/pitch"
          onClick={(e) => {
            e.preventDefault();
            nav("/arena/pitch");
          }}
        >
          Pitching tonight? Add your company
        </a>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Pitch({ nav }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getPlayer()) nav("/arena", { replace: true });
  }, [nav]);

  async function submit(e) {
    e.preventDefault();
    const p = getPlayer();
    const trimmed = name.trim();
    if (!p || !trimmed || busy) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("arena_companies").insert({
      player_id: p.id,
      name: trimmed,
      tagline: tagline.trim(),
    });
    if (error) {
      setError("Couldn't add your company — try again.");
      setBusy(false);
      return;
    }
    nav("/arena/play", { replace: true });
  }

  return (
    <main className="arena-shell">
      <p className="kicker">Add your company</p>
      <h1 className="headline">
        Sixty Seconds. <em>Make It Count.</em>
      </h1>
      <p className="sub">
        Put your company in the pool before you pitch. Investors will see it on
        their phones the moment you add it.
      </p>
      <form onSubmit={submit}>
        <label className="flabel" htmlFor="pn-company">
          Company or idea name
        </label>
        <input
          id="pn-company"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sparkli"
          maxLength={60}
          required
        />
        <label className="flabel" htmlFor="pn-tagline">
          One-liner (optional)
        </label>
        <input
          id="pn-tagline"
          className="field"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="What it does, in one sentence"
          maxLength={120}
        />
        <div style={{ marginTop: 16 }}>
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add to the pool"}
          </button>
        </div>
        {error && (
          <p className="sub" style={{ color: "var(--accent)" }}>
            {error}
          </p>
        )}
      </form>
      <div style={{ marginTop: 16 }}>
        <a
          className="btn btn--ghost"
          href="/arena/play"
          onClick={(e) => {
            e.preventDefault();
            nav("/arena/play");
          }}
        >
          Back to investing
        </a>
      </div>
    </main>
  );
}

function Board() {
  const [rows, setRows] = useState([]);
  const [joinUrl, setJoinUrl] = useState("");
  const [seconds, setSeconds] = useState(PITCH_SECONDS);
  const [running, setRunning] = useState(false);
  const tick = useRef(null);

  useEffect(() => {
    setJoinUrl(window.location.origin + "/arena");
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("arena_leaderboard").select("*");
    if (data) setRows(data);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  function startTimer() {
    setSeconds(PITCH_SECONDS);
    setRunning(true);
  }

  function resetTimer() {
    setRunning(false);
    setSeconds(PITCH_SECONDS);
  }

  const maxRaised = Math.max(1, ...rows.map((r) => r.raised));
  const totalRaised = rows.reduce((s, r) => s + r.raised, 0);

  const qrSrc = joinUrl
    ? "https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=svg&data=" +
      encodeURIComponent(joinUrl)
    : "";

  return (
    <main className="arena-shell arena-shell--wide">
      <p className="kicker">Pitch Night — Live</p>
      <h1 className="headline" style={{ marginBottom: 32 }}>
        The <em>Leaderboard</em>
      </h1>

      <div className="board">
        <div>
          <div className="qrcard">
            {qrSrc && <img src={qrSrc} alt="Scan to join Pitch Night" />}
            <p className="join">{joinUrl.replace(/^https?:\/\//, "")}</p>
          </div>

          <div className="timer">
            <p className="kicker">Pitch clock</p>
            <div
              className={"clock money" + (running && seconds <= 10 ? " low" : "")}
              style={{ marginTop: 8 }}
            >
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </div>
            <div className="tbtns">
              <button type="button" className="btn btn--small" onClick={startTimer}>
                Start 60s
              </button>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={resetTimer}
              >
                Reset
              </button>
            </div>
          </div>

          <p className="sub" style={{ marginTop: 20 }}>
            Total deployed: <span className="money">{fmt(totalRaised)}</span>
          </p>
        </div>

        <div>
          {rows.length === 0 && (
            <p className="sub">
              Waiting for the first company. Founders: scan the code, then tap
              &ldquo;Add your company.&rdquo;
            </p>
          )}
          {rows.map((r, i) => (
            <div className={"lb-row" + (i === 0 ? " first" : "")} key={r.id}>
              <div className="rank">{i + 1}</div>
              <div>
                <div className="lb-name">
                  {r.name}
                  {i === 0 && r.raised > 0 && (
                    <span className="leader-tag">Leader</span>
                  )}
                </div>
                <div className="lb-founder">{r.founder}</div>
                <div className="lb-bartrack">
                  <div
                    className="lb-bar"
                    style={{ width: `${(r.raised / maxRaised) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="lb-raised money">{fmt(r.raised)}</div>
                <div className="lb-backers">
                  {r.backers} {r.backers === 1 ? "backer" : "backers"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function Arena() {
  const [path, setPath] = useState(window.location.pathname);

  const nav = useCallback((to, opts = {}) => {
    if (opts.replace) {
      window.history.replaceState(null, "", to);
    } else {
      window.history.pushState(null, "", to);
    }
    setPath(to);
  }, []);

  useEffect(() => {
    document.title = "Pitch Night — Side Hustle Club";
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const clean = path.replace(/\/+$/, "") || "/arena";
  let screen;
  if (clean === "/arena/play") screen = <Play nav={nav} />;
  else if (clean === "/arena/pitch") screen = <Pitch nav={nav} />;
  else if (clean === "/arena/board") screen = <Board />;
  else screen = <Join nav={nav} />;

  return <div className="arena">{screen}</div>;
}
