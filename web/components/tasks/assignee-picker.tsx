"use client";

type Member = {
  user: { id: string; firstName?: string | null; username?: string | null };
};

export function AssigneePicker({
  members,
  value,
  onChange
}: {
  members: Member[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select className="h-10 w-full rounded-md border border-border px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Без исполнителя</option>
      {members.map((member) => (
        <option key={member.user.id} value={member.user.id}>
          {member.user.firstName || member.user.username || member.user.id}
        </option>
      ))}
    </select>
  );
}
