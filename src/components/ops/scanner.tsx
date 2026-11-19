"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global { interface Window { BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector } }

/**
 * Camera scanner for bag QR codes, barcodes and order numbers. Uses the browser's
 * BarcodeDetector where available (Chrome/Android); otherwise the typed field is used.
 */
export function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "on" | "unsupported" | "denied">("idle");

  useEffect(() => {
    if (state !== "on") return;
    let stream: MediaStream | null = null;
    let stop = false;
    let detector: Detector | null = null;
    (async () => {
      try {
        detector = new window.BarcodeDetector!({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "data_matrix"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stop || !video.current || !detector) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) { onCode(found[0].rawValue.trim()); return; }
          } catch { /* frame not ready */ }
          setTimeout(tick, 250);
        };
        tick();
      } catch {
        setState("denied");
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [state, onCode]);

  const start = () => {
    if (typeof window === "undefined" || !window.BarcodeDetector || !navigator.mediaDevices) { setState("unsupported"); return; }
    setState("on");
  };

  if (state === "on") {
    return (
      <div className="relative overflow-hidden rounded-xl bg-navy-950">
        <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-brand-400" />
        <button type="button" onClick={() => setState("idle")} className="absolute end-2 top-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-black/50 px-3 text-xs font-semibold text-white">
          <CameraOff className="size-4" />Stop
        </button>
      </div>
    );
  }
  return (
    <div>
      <button type="button" onClick={start} className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface text-[14px] font-semibold text-navy-900 active:bg-subtle">
        <Camera className="size-7" />Scan with camera
      </button>
      {state === "unsupported" && <p className="mt-2 text-xs text-muted">This browser can&apos;t scan codes. Type the code below instead (Chrome on Android supports scanning).</p>}
      {state === "denied" && <p className="mt-2 text-xs text-danger-600">Camera access was blocked. Allow the camera in your browser settings, or type the code.</p>}
    </div>
  );
}
