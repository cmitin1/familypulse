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
    <select
      className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Без исполнителя</option>
      {members.map((member) => (
        <option key={member.user.id} value={member.user.id}>
          {member.user.firstName || member.user.username || member.user.id}
        </option>
      ))}
    </select>
  );
}
