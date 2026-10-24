"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/users";

export interface UserRow {
  id: string;
  email: string;
  role: "admin" | "user";
  disabled: boolean;
  locked: boolean;
  createdAt: string;
}

type Msg = { tone: "ok" | "bad"; text: string } | null;

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error ?? "That did not work. Try again." };
}

function UserControls({ u, isSelf, onDone }: { u: UserRow; isSelf: boolean; onDone: (m: Msg) => void }) {
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pw, setPw] = useState("");

  async function change(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const r = await send(`/api/users/${u.id}`, "PATCH", body);
    setBusy(false);
    onDone(r.ok ? { tone: "ok", text: ok } : { tone: "bad", text: r.error ?? "Failed" });
    if (r.ok) {
      setResetting(false);
      setPw("");
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <select
        className="input"
        style={{ width: "auto", padding: "4px 8px", fontSize: 12.5 }}
        aria-label={`Role of ${u.email}`}
        value={u.role}
        disabled={busy || isSelf}
        onChange={(e) => change({ role: e.target.value }, `${u.email} is now ${e.target.value}.`)}
      >
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      {!isSelf && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() => change({ disabled: !u.disabled }, `${u.email} ${u.disabled ? "enabled" : "disabled"}.`)}
        >
          {u.disabled ? "Enable" : "Disable"}
        </button>
      )}
      {u.locked && (
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => change({ unlock: true }, `${u.email} unlocked.`)}>
          Unlock
        </button>
      )}
      {resetting ? (
        <form
          style={{ display: "flex", gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            change({ password: pw }, `New password set for ${u.email}.`);
          }}
        >
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            style={{ width: 170, padding: "4px 8px", fontSize: 12.5 }}
            aria-label={`New password for ${u.email}`}
            placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !pw}>Set</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setResetting(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setResetting(true)}>
          Reset password
        </button>
      )}
    </div>
  );
}

export default function UsersAdmin({ users, selfId }: { users: UserRow[]; selfId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const done = (m: Msg) => {
    setMsg(m);
    router.refresh();
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await send("/api/users", "POST", { email, password, role });
    setBusy(false);
    if (r.ok) {
      setEmail("");
      setPassword("");
      setRole("user");
      done({ tone: "ok", text: `${email} created. Pass the password on yourself; Vaultic sends no email.` });
    } else setMsg({ tone: "bad", text: r.error ?? "Failed" });
  }

  return (
    <>
      <form className="tile" onSubmit={create} aria-labelledby="new-user-title" style={{ display: "grid", gap: 14 }}>
        <h2 id="new-user-title">Add a user</h2>
        <div className="ingest-grid">
          <div className="field">
            <label className="label" htmlFor="new-email">Email</label>
            <input id="new-email" className="input" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="new-password">Password ({MIN_PASSWORD_LENGTH}+ characters)</label>
            <input id="new-password" className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="new-role">Role</label>
            <select id="new-role" className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <span className="faint" style={{ fontSize: 12, marginTop: 6 }}>
              {role === "admin" ? "Every page and document." : "Asks questions; sees documents visible to all users."}
            </span>
          </div>
        </div>
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !email || !password}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>

      {msg && (
        <p role="status" className={msg.tone === "bad" ? "form-err" : "muted"} style={{ margin: "12px 0" }}>
          {msg.text}
        </p>
      )}

      <section className="tile" aria-label="Users" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Added (UTC)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="src" style={{ whiteSpace: "nowrap" }}>{u.email}</span>
                    {u.id === selfId && <span className="faint"> (you)</span>}
                  </td>
                  <td>
                    {u.disabled ? (
                      <span className="badge b-grey">disabled</span>
                    ) : u.locked ? (
                      <span className="badge b-red">locked</span>
                    ) : (
                      <span className="badge b-teal">active</span>
                    )}
                  </td>
                  <td className="when">{u.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td>
                    <UserControls u={u} isSelf={u.id === selfId} onDone={done} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
