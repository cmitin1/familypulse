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
      className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      value={toInputDateTimeValue(value)}
      onChange={(e) => onChange(fromInputDateTimeValue(e.target.value))}
    />
  );
}
