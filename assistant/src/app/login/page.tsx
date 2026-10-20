import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppBackground, LogoMark, WordMark } from "@/components/AppBackground";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const FEATS = [
  {
    title: "Cited answers",
    text: "Each answer links to the passages it used.",
    tone: "accent",
    icon: <><path d="M7 8h10M7 12h6" /><path d="M4 4h16v12H9l-5 4z" /></>,
  },
  {
    title: "PII redacted",
    text: "Emails, phones, IBANs and cards masked at ingest.",
    tone: "teal",
    icon: <><rect x="4" y="10" width="16" height="4" rx="1" /><path d="M4 6h10M4 18h7" /></>,
  },
  {
    title: "Hash-chained audit",
    text: "SHA-256 chain, verified on the Audit page.",
    tone: "amber",
    icon: <path d="M9 7h-2a4 4 0 000 8h2M15 7h2a4 4 0 010 8h-2M8 11h8" />,
  },
  {
    title: "No egress",
    text: "No external API on the answer path.",
    tone: "red",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  },
];

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <>
      <AppBackground />
      <ThemeToggle className="theme-float" />
      <div className="login-stage">
        <section className="intro glass">
          <div className="brand">
            <LogoMark size={38} />
            <WordMark />
          </div>
          <div className="copy">
            <div className="eyebrow">Private document AI</div>
            <h1>
              Ask your documents,
              <br />
              <em>keep them in-house.</em>
            </h1>
            <p>
              Answers questions from the documents you upload, with the passages cited, using a local model. Every
              exchange goes into a hash-chained audit log.
            </p>
            <div className="feats">
              {FEATS.map((f) => (
                <div className="feat" key={f.title}>
                  <div className="ic" style={{ background: `var(--${f.tone}-soft)`, color: `var(--${f.tone})` }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      {f.icon}
                    </svg>
                  </div>
                  <div>
                    <b>{f.title}</b>
                    <small>{f.text}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="dots">
            <span style={{ "--c": "var(--ink-45)" } as React.CSSProperties}>Runs locally</span>
            <span style={{ "--c": "var(--accent)" } as React.CSSProperties}>MIT licensed</span>
            <span style={{ "--c": "var(--teal)" } as React.CSSProperties}>Admin + user roles</span>
          </div>
        </section>

        <section className="login-right">
          <div className="login-box">
            <LoginForm />
          </div>
          <div className="login-note">Open source · github.com/falshaw/vaultic</div>
        </section>
      </div>
    </>
  );
}
