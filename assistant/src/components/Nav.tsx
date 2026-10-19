"use client";

import { useRouter } from "next/navigation";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const VaultMark = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z" /><circle cx="12" cy="10" r="2" /><path d="M12 12v3" /></svg>
);
const IconOverview = () => (
  <svg viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
const IconWorkbench = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" /></svg>
);
const IconDocs = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" /></svg>
);
const IconAudit = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></svg>
);
const IconSecurity = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);

export default function Nav({
  email,
  role,
  current,
}: {
  email: string;
  role: "admin" | "user";
  current?: "overview" | "workbench" | "documents" | "audit" | "security";
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const cls = (k: string) => "navitem" + (current === k ? " is-current" : "");

  return (
    <aside className="sidebar">
      <a href="/" className="brand"><span className="mark"><VaultMark /></span><span className="word">Vault<b>ic</b></span></a>

      <nav className="navlinks">
        <a href="/" className={cls("overview")}><IconOverview /> Overview</a>
        <a href="/workbench" className={cls("workbench")}><IconWorkbench /> Workbench</a>
        {role === "admin" && <a href="/documents" className={cls("documents")}><IconDocs /> Documents</a>}
        {role === "admin" && <a href="/audit" className={cls("audit")}><IconAudit /> Audit</a>}
        {role === "admin" && <a href="/security" className={cls("security")}><IconSecurity /> Security</a>}
      </nav>

      <div className="sidebar-spacer" />

      <div className="statbox">
        <div className="row"><span className="pulse" /> Local-only · zero egress</div>
        <div className="row"><span className="pulse" /> Air-gap compatible</div>
      </div>

      <div className="sidebar-foot">
        <span className="who"><b>{email}</b></span>
        <span className="role">{role}</span>
        <button className="btn" onClick={logout}>Log out</button>
      </div>
    </aside>
  );
}
