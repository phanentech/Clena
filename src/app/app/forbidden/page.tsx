import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <Card>
      <EmptyState icon={<ShieldAlert />} title="You don't have access to this page"
        description="Your role in this business doesn't include this area. Ask the business owner if you need access."
        action={<Button asChild variant="outline"><Link href="/app/dashboard">Back to dashboard</Link></Button>} />
    </Card>
  );
}
