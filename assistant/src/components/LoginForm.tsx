"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (res.status === 429) setErr("Too many attempts from this address. Wait a minute and try again.");
      else setErr(j.error ?? "Sign-in failed");
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="glass signin" onSubmit={submit}>
      <h1>Sign in</h1>
      <div className="sub">Welcome back</div>
      <div style={{ display: "grid", gap: 12 }}>
        <div className="ifield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
          <input
            className="input"
            type="email"
            name="email"
            placeholder="Email"
            aria-label="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="ifield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
          <input
            className="input"
            type="password"
            name="password"
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className="form-err" role="alert" aria-live="assertive">
        {err}
      </div>
      <div className="mini" aria-label="Health endpoint example">
        <span className="k">GET</span> /api/health
        <br />
        <span className="c">{'{"ok":true,"service":"vaultic-assistant"}'}</span>
      </div>
    </form>
  );
}
