import Link from "next/link";
import { AppBackground, LogoMark } from "@/components/AppBackground";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <AppBackground />
      <main className="nf">
        <div className="glass" data-not-found>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <LogoMark size={40} />
          </div>
          <div className="eyebrow">404</div>
          <h1>Page not found</h1>
          <p>This page does not exist or was moved.</p>
          <Link href="/" className="btn btn-primary">
            Back to the overview
          </Link>
        </div>
      </main>
    </>
  );
}
