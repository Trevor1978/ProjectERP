import {
  type DueItem,
  formatItemLine,
  itemLink,
  itemTypeLabel,
} from "./dueItems.js";
import { formatDueForEmail } from "./digestTz.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sectionHtml(title: string, items: DueItem[]): string {
  if (items.length === 0) return "";
  const lis = items
    .map(
      (i) =>
        `<li><strong>${escapeHtml(itemTypeLabel(i.entityType))}</strong>: ` +
        `<a href="${escapeHtml(itemLink(i))}">${escapeHtml(i.title)}</a>` +
        ` — ${escapeHtml(formatDueForEmail(i.dueAt))}</li>`,
    )
    .join("\n");
  return `<h2>${escapeHtml(title)}</h2>\n<ul>\n${lis}\n</ul>`;
}

function sectionText(title: string, items: DueItem[]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (i) => `- ${formatItemLine(i)}\n  ${itemLink(i)}`,
  );
  return `${title}\n${lines.join("\n")}\n`;
}

export function buildDailyEmail(opts: {
  userName: string;
  dateLabel: string;
  items: DueItem[];
}): { subject: string; html: string; text: string } {
  const overdue = opts.items.filter((i) => i.bucket === "overdue");
  const today = opts.items.filter((i) => i.bucket === "today");
  const tomorrow = opts.items.filter((i) => i.bucket === "tomorrow");

  const subject = `Due today & tomorrow — ${opts.dateLabel}`;
  const html = [
    `<p>Hi ${escapeHtml(opts.userName)},</p>`,
    `<p>Here are your due items for today and tomorrow.</p>`,
    sectionHtml("Overdue", overdue),
    sectionHtml("Due today", today),
    sectionHtml("Due tomorrow", tomorrow),
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    `Hi ${opts.userName},`,
    "",
    "Here are your due items for today and tomorrow.",
    "",
    sectionText("Overdue", overdue),
    sectionText("Due today", today),
    sectionText("Due tomorrow", tomorrow),
  ]
    .filter((s) => s !== "")
    .join("\n");

  return { subject, html, text };
}

export function buildWeeklyEmail(opts: {
  userName: string;
  weekRangeLabel: string;
  items: DueItem[];
}): { subject: string; html: string; text: string } {
  const subject = `This week's due items — ${opts.weekRangeLabel}`;
  const html = [
    `<p>Hi ${escapeHtml(opts.userName)},</p>`,
    `<p>Here are items due this week (${escapeHtml(opts.weekRangeLabel)}).</p>`,
    sectionHtml("This week", opts.items),
  ].join("\n");

  const text = [
    `Hi ${opts.userName},`,
    "",
    `Here are items due this week (${opts.weekRangeLabel}).`,
    "",
    sectionText("This week", opts.items),
  ].join("\n");

  return { subject, html, text };
}
