import { NextResponse, type NextRequest } from "next/server";
import { confirmVerified, verifyPayment, verifyWebhookSignature } from "@/lib/payments/gateways";

/** stripe webhook: signature checked, then the payment is re-verified with stripe before the invoice is marked paid. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  try {
    if (!(await verifyWebhookSignature("stripe", raw, request.headers))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    const event = JSON.parse(raw);
    const reference = event.type === "checkout.session.completed" ? event.data?.object?.id : null;
    if (!reference) return NextResponse.json({ received: true });
    const verified = await verifyPayment("stripe", reference);
    if (verified.ok) await confirmVerified(verified, reference);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("stripe webhook", (e as Error).message);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
