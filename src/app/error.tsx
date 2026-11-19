"use client";

import { useEffect } from "react";

/** Any page that fails. The most common cause in production: the page was opened before a new
 *  version was deployed, so its forms point at code that no longer exists. A full reload fixes it. */
export default function RootError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = /Server Action|failed to find|Failed to fetch|ChunkLoadError|Loading chunk/i.test(error.message ?? "");
  useEffect(() => {
    // reload once automatically when the page is simply out of date
    if (stale && !sessionStorage.getItem("clena-reloaded")) { sessionStorage.setItem("clena-reloaded", "1"); window.location.reload(); }
    else sessionStorage.removeItem("clena-reloaded");
  }, [stale]);
  return (
    <main className="grid min-h-dvh place-items-center bg-[#F3F5F9] p-6 text-[#0B1B33]">
      <div className="max-w-sm text-center">
        <p className="text-[18px] font-semibold">{stale ? "A new version of Clena is ready" : "This page didn't load"}</p>
        <p className="mt-1 text-[14px] text-[#5B6B80]">{stale ? "Reload to continue. Anything you saved is safe." : "Reload to try again. If it keeps happening, send us the code below."}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-full bg-[#0B1B33] px-6 text-[14px] font-semibold text-white">Reload</button>
          <a href="/auth/continue" className="inline-flex h-11 items-center rounded-full border border-[#DCE2EB] bg-white px-5 text-[14px] font-medium">Go to my account</a>
        </div>
        {error.digest && <p className="mt-4 text-[11.5px] text-[#8A96A8]">Error code {error.digest}</p>}
      </div>
    </main>
  );
}
