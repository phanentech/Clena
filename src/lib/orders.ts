export const PAYMENT_TONE = { unpaid: "danger", partially_paid: "warning", paid: "success", refunded: "neutral" } as const;
export const PAYMENT_LABEL = { unpaid: "Unpaid", partially_paid: "Part-paid", paid: "Paid", refunded: "Refunded" } as const;
export type PaymentStatus = keyof typeof PAYMENT_TONE;

export const PRICING_UNIT: Record<string, string> = {
  fixed: "", per_item: "per item", per_kg: "per kg", per_vehicle: "per vehicle",
  per_room: "per room", per_hour: "per hour", per_sqm: "per m²", quote: "quote",
};
export const QUANTITY_LABEL: Record<string, string> = {
  fixed: "Qty", per_item: "Items", per_kg: "Kg", per_vehicle: "Vehicles",
  per_room: "Rooms", per_hour: "Hours", per_sqm: "m²", quote: "Qty",
};
