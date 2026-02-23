# FamilyPulse UI Design Spec (MVP, Light Only)

## 1) Color tokens

- `background`: app canvas, very light gray (`--background`)
- `card`: surfaces/cards (`--card`)
- `foreground`: primary text, near-black (`--foreground`)
- `muted` + `muted-foreground`: secondary surfaces and helper text
- `border` / `input` / `ring`: separators, input borders, focus rings
- `primary`: primary CTA/action
- `success`, `warning`, `danger`: semantic badges/alerts/states

Rules:
- Base screen always has explicit light background.
- Text on light surfaces uses `foreground`/`muted-foreground` only (no low-contrast gray-on-white).
- Status colors are used for meaning only (not as default text color).

## 2) Typography

- Page title: `text-xl font-semibold tracking-tight`
- Section title: `text-base font-semibold`
- Body: `text-sm`
- Supporting/meta text: `text-sm text-muted-foreground`
- Micro/meta inside dense cells: `text-xs text-muted-foreground`

Rules:
- Minimum readable body size on mobile: `text-sm`.
- Avoid `text-xs` for primary content; use only for secondary metadata.

## 3) Spacing scale

- Base spacing uses Tailwind scale: `2 / 3 / 4 / 6`
- Screen vertical rhythm: `space-y-4`
- Card content rhythm: `space-y-3`
- Compact grouped controls: `gap-2`
- Interactive container padding: at least `p-3` (`p-4` by default)

## 4) Component standards

- **Card**: rounded-xl, bordered, white surface, subtle shadow.
- **Button**: minimum height 44px (`h-11`), clear primary/outline/secondary states.
- **Badge**: semantic variants (`default/success/warning/danger/outline`) with high contrast.
- **Input/Select**: minimum height 44px, visible border, focus ring (`ring` token).
- **Tabs**: segmented control style with active contrast.
- **Table**: bordered container + clear header background + row separators.
- **Sheet/Dialog**: rounded top, safe-area bottom padding, readable forms.

## 5) Screen patterns

- **TaskCard**: title -> assignee/meta -> due/status badges -> actions.
- **Summary by assignee**: compact readable table, click row action to expand task list.
- **Forms**: explicit `label + field`, clear disabled state and loading text.
- **Empty states**: dashed block with helper text + contextual action button.
- **Loading**: skeletons for cards/lists, no jumping layout.

## 6) Mobile and Telegram Mini App notes

- Tap targets: buttons/inputs/select >= 44px.
- No horizontal scrolling for page-level content.
- Respect safe area for bottom navigation and sheets.
- UI remains readable independently from Telegram theme background colors.
