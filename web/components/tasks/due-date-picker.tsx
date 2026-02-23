"use client";

import { fromInputDateTimeValue, toInputDateTimeValue } from "@/lib/datetime";

export function DueDatePicker({
  value,
  onChange
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <input
      type="datetime-local"
      className="h-10 w-full rounded-md border border-border px-3 text-sm"
      value={toInputDateTimeValue(value)}
      onChange={(e) => onChange(fromInputDateTimeValue(e.target.value))}
    />
  );
}
