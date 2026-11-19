import { NextResponse, type NextRequest } from "next/server";
import { CHECKOUT_GATEWAYS, confirmVerified, verifyPayment, type CheckoutGateway } from "@/lib/payments/gateways";

/**
 * Where the payment page sends the business back. The redirect itself proves
 * nothing: we verify with the provider before showing success.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const gateway = searchParams.get("gateway") as CheckoutGateway | null;
  const reference = searchParams.get("session_id") ?? searchParams.get("reference") ?? searchParams.get("tx_ref") ?? searchParams.get("trxref");
  const back = new URL("/app/settings/plan", origin);
  if (!gateway || !CHECKOUT_GATEWAYS.includes(gateway) || !reference) {
    back.searchParams.set("payment", "unknown");
    return NextResponse.redirect(back);
  }
  try {
    const verified = await verifyPayment(gateway, reference);
    if (!verified.ok) {
      back.searchParams.set("payment", "failed");
      return NextResponse.redirect(back);
    }
    await confirmVerified(verified, reference);
    back.searchParams.set("payment", "success");
  } catch {
    back.searchParams.set("payment", "pending");
  }
  return NextResponse.redirect(back);
}
