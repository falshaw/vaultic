"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, LayoutGrid, Link2, LogOut, Menu, MessageSquareText, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { AppBackground, LogoMark, WordMark } from "@/components/AppBackground";
import { ThemeToggle } from "@/components/ThemeToggle";

type Role = "admin" | "user";
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/workbench", label: "Workbench", icon: MessageSquareText },
];
// Admin-only pages: the server pages also redirect non-admins, this only hides the links.
const ADMIN: NavItem[] = [
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/audit", label: "Audit", icon: Link2 },
  { href: "/security", label: "Security", icon: ShieldCheck },
];

function isOn(href: string, path: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function initials(email: string) {
  const parts = email.split("@")[0].split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

function NavLinks({ role, path, onNavigate }: { role: Role; path: string; onNavigate?: () => void }) {
  const render = (item: NavItem) => {
    const on = isOn(item.href, path);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={`side-link${on ? " on" : ""}`}
        aria-current={on ? "page" : undefined}
      >
        <Icon aria-hidden />
        {item.label}
      </Link>
    );
  };
  return (
    <>
      {MAIN.map(render)}
      {role === "admin" && (
        <>
          <div className="side-sec eyebrow">Admin</div>
          {ADMIN.map(render)}
        </>
      )}
    </>
  );
}

export default function Shell({ email, role, children }: { email: string; role: Role; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const who = (
    <div className="who">
      <span className="av" aria-hidden>{initials(email)}</span>
      <div>
        <div className="name" title={email}>{email}</div>
        <div className="faint" style={{ fontSize: 12 }}>{role}</div>
      </div>
    </div>
  );
  const signOutBtn = (
    <button type="button" className="link-btn" onClick={signOut}>
      <LogOut aria-hidden /> Sign out
    </button>
  );

  return (
    <>
      <AppBackground />
      <div className="stage">
        <aside className="rail glass" aria-label="Main">
          <Link href="/" className="brand">
            <LogoMark />
            <WordMark />
          </Link>
          <nav className="side-nav" aria-label="Main navigation">
            <NavLinks role={role} path={path} />
          </nav>
          <div className="side-foot">
            {who}
            <div className="foot-row">
              {signOutBtn}
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <header className="topbar glass">
          <div className="topbar-row">
            <Link href="/" className="brand">
              <LogoMark size={32} />
              <WordMark />
            </Link>
            <ThemeToggle />
            <button
              type="button"
              className="theme-btn"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {open ? <X aria-hidden /> : <Menu aria-hidden />}
            </button>
          </div>
          {open && (
            <div id="mobile-nav" className="mobile-nav">
              <nav className="side-nav" aria-label="Main navigation">
                <NavLinks role={role} path={path} onNavigate={() => setOpen(false)} />
              </nav>
              <div className="foot-row">
                {who}
                {signOutBtn}
              </div>
            </div>
          )}
        </header>

        <main className="panel glass">{children}</main>
      </div>
    </>
  );
}
