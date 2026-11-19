"use client";

import { useOptimistic, useTransition } from "react";
import { setPlatformRolePermission } from "../actions";

export function RoleToggle({ role, permission, enabled, locked }: { role: string; permission: string; enabled: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(enabled);
  return (
    <input type="checkbox" checked={on} disabled={locked || pending} aria-label={`${role}: ${permission}`}
      className="size-4 cursor-pointer accent-navy-900 disabled:cursor-not-allowed"
      onChange={(e) => {
        const next = e.target.checked;
        const fd = new FormData();
        fd.set("role", role); fd.set("permission", permission); fd.set("enabled", String(next));
        start(async () => { setOn(next); await setPlatformRolePermission(undefined, fd); });
      }} />
  );
}
