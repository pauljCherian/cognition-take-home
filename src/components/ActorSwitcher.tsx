"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function ActorSwitcher({ users, current }: { users: { id: string; name: string; role: string }[]; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">Signed in as</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await fetch("/api/actor", { method: "POST", body: JSON.stringify({ id }) });
            router.refresh();
          });
        }}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </label>
  );
}
