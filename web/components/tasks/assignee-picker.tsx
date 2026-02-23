"use client";

type Member = {
  user: { id: string; firstName?: string | null; username?: string | null };
};

export function AssigneePicker({
  members,
  values,
  onChange
}: {
  members: Member[];
  values: string[];
  onChange: (value: string[]) => void;
}) {
  const memberIds = members.map((member) => member.user.id);
  const allSelected = memberIds.length > 0 && memberIds.every((id) => values.includes(id));

  function toggleMember(userId: string) {
    if (values.includes(userId)) {
      onChange(values.filter((id) => id !== userId));
    } else {
      onChange([...values, userId]);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-input bg-card p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onChange(e.target.checked ? memberIds : [])}
        />
        <span>Все</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.length === 0}
          onChange={(e) => {
            if (e.target.checked) onChange([]);
          }}
        />
        <span>Без исполнителя</span>
      </label>
      <div className="space-y-1">
        {members.map((member) => (
          <label key={member.user.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.includes(member.user.id)}
              onChange={() => toggleMember(member.user.id)}
            />
            <span>{member.user.firstName || member.user.username || member.user.id}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
