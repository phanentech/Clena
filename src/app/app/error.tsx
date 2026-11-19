"use client";

import { AlertTriangle } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState icon={<AlertTriangle />} title="Something went wrong"
        description={error.digest ? `Reference: ${error.digest}` : "Please try again. If it keeps happening, contact support."}
        action={<Button onClick={reset} variant="outline">Try again</Button>} />
    </Card>
  );
}
