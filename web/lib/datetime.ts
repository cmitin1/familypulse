export function formatDateTime(value?: string | null, timezone = "UTC") {
  if (!value) return "Без дедлайна";
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone
  }).format(date);
}

function ymdPartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "01");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "01");
  return { year, month, day };
}

function ordinalDay(date: Date, timezone: string) {
  const { year, month, day } = ymdPartsInTimezone(date, timezone);
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
}

export function daysUntilDue(dueDate?: string | null, timezone = "UTC") {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  return ordinalDay(due, timezone) - ordinalDay(new Date(), timezone);
}

export function toInputDateTimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromInputDateTimeValue(value?: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}
