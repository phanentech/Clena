"use client";

import { useActionState, useRef, useState } from "react";
import { House, ImageUp, Plus, Trash2 } from "lucide-react";
import { Alert, Card, CardHeader, Field, Input, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/app/auth/actions";
import { cn } from "@/lib/utils";
import { saveBranding } from "../portal-actions";

type Branding = Record<string, string | boolean | null | undefined>;

const PRESETS: { name: string; p: string; s: string; a: string }[] = [
  { name: "Clena", p: "#0B1B33", s: "#1E88A8", a: "#12C08A" },
  { name: "Lagoon", p: "#0F3D5C", s: "#2A9DB8", a: "#F5B841" },
  { name: "Violet", p: "#2E1F6B", s: "#6A5AE0", a: "#9EE6C9" },
  { name: "Forest", p: "#143D2C", s: "#2F8F5B", a: "#E8C547" },
  { name: "Ruby", p: "#4A1020", s: "#C2384C", a: "#F7B267" },
  { name: "Charcoal", p: "#1C1F24", s: "#56606E", a: "#3DD6C6" },
];

function on(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.42 ? "#0B1B33" : "#FFFFFF";
}

/** Downscale an uploaded logo in the browser so it stays small (max 256 px). */
async function toLogoData(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 256 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", 0.9);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ColorField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} htmlFor={name}>
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface p-1 pr-3">
        <input id={name} type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} aria-label={`${label} hex`} className="w-full bg-transparent text-[13px] tnum focus:outline-none" />
      </div>
    </Field>
  );
}

export function BrandingForm({ businessName, branding }: { businessName: string; branding: Branding }) {
  const [state, action] = useActionState<FormState, FormData>(saveBranding, undefined);
  const [p, setP] = useState(String(branding.primary_color ?? "#0B1B33").toUpperCase());
  const [s, setS] = useState(String(branding.secondary_color ?? "#1E88A8").toUpperCase());
  const [a, setA] = useState(String(branding.accent_color ?? "#12C08A").toUpperCase());
  const [corner, setCorner] = useState(String(branding.corner_style ?? "rounded"));
  const [name, setName] = useState(String(branding.app_name ?? ""));
  const [tagline, setTagline] = useState(String(branding.tagline ?? ""));
  const [logo, setLogo] = useState<string | null>((branding.logo_data as string) ?? null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const valid = (h: string) => /^#[0-9a-fA-F]{6}$/.test(h);
  const radius = corner === "square" ? 8 : corner === "soft" ? 14 : 20;
  const shown = name || businessName;
  const vars = { "--pp": valid(p) ? p : "#0B1B33", "--ps": valid(s) ? s : "#1E88A8", "--pa": valid(a) ? a : "#12C08A", "--pr": `${radius}px` } as React.CSSProperties;

  return (
    <form action={action} className="grid gap-5 xl:grid-cols-[1fr_320px]" noValidate>
      <div className="grid gap-5">
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        <Card>
          <CardHeader title="Logo and name" description="Shown at the top of your customer app and on sign-in screens." />
          <div className="grid gap-4 p-4">
            <div className="flex items-center gap-4">
              <div className="grid size-16 place-items-center overflow-hidden rounded-xl border border-line bg-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                {logo ? <img src={logo} alt="Your logo" className="size-full object-contain p-1" /> : <ImageUp className="size-6 text-faint" />}
              </div>
              <div className="grid gap-1.5">
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-xs font-semibold hover:bg-subtle">{logo ? "Replace logo" : "Upload logo"}</button>
                  {logo && <button type="button" onClick={() => { setLogo(null); setLogoChanged(true); }} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-danger-600 hover:bg-danger-50"><Trash2 className="size-3.5" />Remove</button>}
                </div>
                <p className="text-xs text-muted">PNG, JPG or WebP. Square works best. We resize it for you.</p>
                {logoError && <p className="text-xs text-danger-600">{logoError}</p>}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Logo file"
                onChange={async (e) => {
                  const f = e.target.files?.[0]; setLogoError(null);
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) { setLogoError("Choose an image under 5 MB"); return; }
                  try { setLogo(await toLogoData(f)); setLogoChanged(true); } catch { setLogoError("That image couldn't be read"); }
                }} />
              {logoChanged && logo && <input type="hidden" name="logo_data" value={logo} />}
              {logoChanged && !logo && <input type="hidden" name="remove_logo" value="1" />}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="App name" htmlFor="app_name" hint={`Leave empty to use “${businessName}”.`}><Input id="app_name" name="app_name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Tagline" htmlFor="tagline"><Input id="tagline" name="tagline" maxLength={80} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Fresh clothes, delivered" /></Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Colours" description="Clena's navy, teal and green are the default. Pick a preset or enter your own." />
          <div className="grid gap-4 p-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((x) => (
                <button key={x.name} type="button" onClick={() => { setP(x.p); setS(x.s); setA(x.a); }}
                  className={cn("flex items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-3 text-xs font-medium", p === x.p && s === x.s ? "border-navy-900" : "border-line")}>
                  <span className="flex"><span className="size-5 rounded-l-full" style={{ background: x.p }} /><span className="size-5" style={{ background: x.s }} /><span className="size-5 rounded-r-full" style={{ background: x.a }} /></span>
                  {x.name}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField label="Main colour" name="primary_color" value={p} onChange={setP} />
              <ColorField label="Second colour" name="secondary_color" value={s} onChange={setS} />
              <ColorField label="Highlight colour" name="accent_color" value={a} onChange={setA} />
            </div>
            <Field label="Corners" htmlFor="corner_style">
              <input type="hidden" name="corner_style" value={corner} />
              <div className="flex gap-2">
                {[["rounded", "Rounded", 14], ["soft", "Soft", 8], ["square", "Square", 3]].map(([k, l, r]) => (
                  <button key={k as string} type="button" onClick={() => setCorner(k as string)} aria-pressed={corner === k}
                    className={cn("flex h-9 items-center gap-2 border bg-surface px-3 text-xs font-medium", corner === k ? "border-navy-900" : "border-line")} style={{ borderRadius: r as number }}>
                    {l as string}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Receipts and footer" />
          <div className="grid gap-4 p-4">
            <Field label="Receipt footer" htmlFor="receipt_footer"><Textarea id="receipt_footer" name="receipt_footer" maxLength={200} defaultValue={String(branding.receipt_footer ?? "")} placeholder="Thank you for choosing us!" /></Field>
            <label className="flex items-center justify-between gap-4 text-[13px]">
              <span><span className="block font-medium">Show “Powered by Clena”</span><span className="block text-xs text-muted">A small line at the bottom of your customer app.</span></span>
              <input type="checkbox" name="show_powered_by" defaultChecked={branding.show_powered_by !== false} className="size-4 accent-brand-500" />
            </label>
          </div>
        </Card>
        <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save brand</SubmitButton></div>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-xs font-medium text-muted">Preview</p>
        <div style={vars} className="mx-auto w-[300px] overflow-hidden rounded-[34px] border-[6px] border-navy-950 bg-[#F3F5F9] shadow-[0_20px_50px_rgb(11_27_51/0.18)]">
          <div className="px-4 pb-10 pt-5 text-white [background:linear-gradient(135deg,var(--pp)_0%,var(--pp)_35%,var(--ps)_130%)]">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview */}
              {logo ? <img src={logo} alt="" className="size-7 rounded-lg bg-white object-contain p-0.5" /> : <span className="grid size-7 place-items-center rounded-lg bg-white text-[10px] font-bold" style={{ color: "var(--pp)" }}>{shown.slice(0, 2).toUpperCase()}</span>}
              <span className="truncate text-[13px] font-semibold">{shown}</span>
            </div>
            <p className="mt-4 text-[18px] font-semibold leading-tight">Hi Ada,</p>
            <p className="text-[11px] opacity-75">{tagline || "What can we take care of today?"}</p>
          </div>
          <div className="-mt-5 rounded-t-[22px] bg-[#F3F5F9] p-3">
            <div className="grid grid-cols-2 gap-2">
              {["Wash & fold", "Dry cleaning"].map((t) => (
                <div key={t} className="border border-[#E6EAF1] bg-white p-2.5" style={{ borderRadius: "var(--pr)" }}>
                  <span className="block size-7 rounded-md" style={{ background: "color-mix(in srgb, var(--ps) 14%, white)" }} />
                  <span className="mt-2 block text-[10px] font-semibold" style={{ color: "var(--ps)" }}>₦1,500 per kg</span>
                  <span className="block text-[11px] font-semibold text-[#0E1A2B]">{t}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 border border-[#E6EAF1] bg-white p-2.5" style={{ borderRadius: "var(--pr)" }}>
              <span className="text-[11px] font-semibold text-[#0E1A2B]">Your order is washing</span>
              <div className="relative mt-2 h-1 rounded-full bg-[#E9EDF3]"><div className="absolute inset-y-0 left-0 w-1/2 rounded-full" style={{ background: "linear-gradient(90deg, var(--ps), var(--pa))" }} /></div>
            </div>
            <div className="mt-2 grid h-9 place-items-center rounded-full text-[11px] font-semibold" style={{ background: "var(--pa)", color: valid(a) ? on(a) : "#0B1B33" }}>Book a pickup</div>
          </div>
          <div className="flex items-center justify-around border-t border-[#E6EAF1] bg-white py-2">
            <House className="size-4" style={{ color: "var(--pp)" }} />
            <span className="grid size-8 -translate-y-2 place-items-center rounded-full text-white" style={{ background: "linear-gradient(135deg, var(--pp), var(--ps))" }}><Plus className="size-4" /></span>
            <span className="size-4 rounded-full border-2 border-[#C9D1DC]" />
          </div>
        </div>
      </div>
    </form>
  );
}
