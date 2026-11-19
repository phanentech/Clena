"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F3F5F9", color: "#0B1B33", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 24 }}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>This page didn&apos;t load</p>
          <p style={{ fontSize: 14, color: "#5B6B80" }}>Reload to try again. If you just updated the site, reloading picks up the new version.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ height: 44, borderRadius: 999, border: 0, background: "#0B1B33", color: "#fff", padding: "0 24px", fontSize: 14, fontWeight: 600 }}>Reload</button>
          {error.digest && <p style={{ fontSize: 11.5, color: "#8A96A8" }}>Error code {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
