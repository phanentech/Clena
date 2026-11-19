import { NextResponse, type NextRequest } from "next/server";
import { confirmVerified, verifyPayment, verifyWebhookSignature } from "@/lib/payments/gateways";

/** paystack webhook: signature checked, then the payment is re-verified with paystack before the invoice is marked paid. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  try {
    if (!(await verifyWebhookSignature("paystack", raw, request.headers))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    const event = JSON.parse(raw);
    const reference = event.event === "charge.success" ? event.data?.reference : null;
    if (!reference) return NextResponse.json({ received: true });
    const verified = await verifyPayment("paystack", reference);
    if (verified.ok) await confirmVerified(verified, reference);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("paystack webhook", (e as Error).message);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
