# ProjectERP UI style guide

Visual language follows the [Tesla.com design reference](https://thejennlee.com/tesla-style-guide): minimal chrome, high contrast typography, restrained color, and tight radii.

## Tokens (Tailwind)

Defined in `apps/web/tailwind.config.js`:

| Token | Use |
|-------|-----|
| `tesla-text` | Primary copy (`#171a20`) |
| `tesla-text-secondary` | Labels, hints (`#5c5e62`) |
| `tesla-border` | Dividers, inputs (`#e8e8e8`) |
| `tesla-muted` | Subtle backgrounds (`#f4f4f4`) |

## Typography

- Stack: **Gotham**, **Helvetica Neue**, Helvetica, Arial, sans-serif (see `tailwind.config.js` `fontFamily.sans`).
- Headings: medium weight, slight letter-spacing (`tracking-tight` / `tracking-wide` for labels).
- Body: `text-sm` in tables; `antialiased` on `body` (`index.css`).

## Components

- **Buttons**: `rounded-sm`, dark primary (`bg-tesla-text text-white`) or white secondary with `border-tesla-border`.
- **Tables**: white surface, `border-tesla-border`, header row `bg-tesla-muted` or `bg-slate-100` in legacy workspace tables.
- **Forms**: full-width inputs, `border-tesla-border`, labels `text-tesla-text-secondary`.

## Reports

RFQ/PO and machine service reports use inline HTML with the same palette and Helvetica stack (`procurementReport.ts`, `machineServiceReport.ts`). Print via browser **Print → Save as PDF**.

## Migrating legacy screens

Prefer `tesla-*` tokens over `slate-*` when touching workspace chrome (sidebar, filters, detail views).
