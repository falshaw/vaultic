"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-row controls on the Documents page: `part="access"` is who can retrieve
 * it (the Access column), `part="delete"` removes it (the Actions column).
 */
export default function DocumentActions({
  id,
  name,
  visibility,
  quarantined,
  part,
}: {
  id: string;
  name: string;
  visibility: string;
  quarantined: boolean;
  part: "access" | "delete";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}`, init);
      if (res.status === 401) return router.push("/login");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That did not work. Try again.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {part === "access" && !quarantined && (
          <select
            className="input"
            style={{ width: "auto", padding: "4px 8px", fontSize: 12.5 }}
            aria-label={`Who can retrieve ${name}`}
            value={visibility}
            disabled={busy}
            onChange={(e) =>
              call({
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ visibility: e.target.value }),
              })
            }
          >
            <option value="all">All users</option>
            <option value="admin">Admins only</option>
          </select>
        )}
        {part === "access" && quarantined && <span className="faint">not indexed</span>}
        {part === "delete" && (confirming ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ background: "var(--red)" }}
              disabled={busy}
              onClick={() => call({ method: "DELETE" })}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label={`Delete ${name}`}
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        ))}
      </div>
      {confirming && !busy && (
        <span className="faint" style={{ fontSize: 11.5 }}>
          {quarantined ? "Removes the quarantine record." : "Removes the document and its chunks from retrieval."}
        </span>
      )}
      {error && (
        <span className="form-err" role="alert" style={{ fontSize: 12 }}>
          {error}
        </span>
      )}
    </div>
  );
}
