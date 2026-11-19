import { createElement } from "react";
import {
  BedDouble, Blinds, Building2, Car, Droplets, Footprints, House, Shirt, Sofa, Sparkles, SprayCan, WashingMachine, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const RULES: [RegExp, LucideIcon][] = [
  [/dry ?clean|suit|shirt|iron|press|starch|agbada|gown/i, Shirt],
  [/duvet|bed|blanket|sheet|pillow/i, BedDouble],
  [/shoe|sneaker|trainer/i, Footprints],
  [/curtain|blind/i, Blinds],
  [/sofa|couch|upholster|chair/i, Sofa],
  [/car|vehicle|engine|tyre|tire|detail|wax|polish/i, Car],
  [/office|commercial|facility/i, Building2],
  [/home|house|room|apartment|shortlet|kitchen|bath/i, House],
  [/carpet|rug|deep|fumigat|disinfect/i, SprayCan],
  [/wash|laundry|kg|fold|rinse/i, WashingMachine],
  [/steam|water/i, Droplets],
];

export function iconFor(name: string, industry?: string | null): LucideIcon {
  for (const [re, icon] of RULES) if (re.test(name)) return icon;
  if (industry === "car_wash") return Car;
  if (industry === "laundry") return WashingMachine;
  if (industry?.includes("clean")) return SprayCan;
  return Sparkles;
}

/** A tinted tile with an icon that suits the service. */
export function ServiceIcon({ name, industry, className, size = "md" }: { name: string; industry?: string | null; className?: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-16 [&_svg]:size-8" : size === "sm" ? "size-9 [&_svg]:size-[18px]" : "size-12 [&_svg]:size-6";
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-[calc(var(--p-radius)*0.7)] bg-[color-mix(in_srgb,var(--p-secondary)_12%,white)] text-[var(--p-secondary)]", box, className)}>
      {createElement(iconFor(name, industry), { strokeWidth: 1.6 })}
    </span>
  );
}
