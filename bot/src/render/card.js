// Layout pieces every card shares, mirroring the site's building blocks: the
// page header (caps eyebrow over a big condensed title), the hairline table
// (caps column labels, zebra rows, magenta "this one" row), medal rank chips,
// status / WR / PB badges and tier labels.

import { nameInitials } from './avatar.js';
import { escapeXml, fit, hline, rect, styles, text, textWidth, theme } from './theme.js';

export const contentWidth = theme.width - theme.padding * 2;
const LEFT = theme.padding;
const RIGHT = theme.width - theme.padding;

export const ROW_HEIGHT = 50;
const TABLE_HEAD = 38;
const FOOTER_HEIGHT = 58;

// ---- header -------------------------------------------------------------

function chip({ label, value }, x, y) {
    const labelStyle = styles.caps(13);
    const valueStyle = styles.body(14, 500);
    const shownValue = fit(value, valueStyle, 260);
    const width = 12 + textWidth(label, labelStyle) + 8 + textWidth(shownValue, valueStyle) + 12;

    return {
        width,
        svg: [
            rect({ x, y, width, height: 28, rx: 4, fill: theme.surface, stroke: theme.lineStrong }),
            text(label, { x: x + 12, y: y + 19, fill: theme.subtle, ...labelStyle }),
            text(shownValue, { x: x + 12 + textWidth(label, labelStyle) + 8, y: y + 19, fill: theme.text, ...valueStyle }),
        ].join(''),
    };
}

// Returns { svg, bottom }. `chips` are the active filters, shown the way the
// site shows "Filtering by" pills.
export function header({ eyebrow, title, meta = null, subtitle = null, chips = [], titleSize = 60, titleColor = theme.text }) {
    const parts = [];
    const eyebrowStyle = styles.caps(15);

    parts.push(text(fit(eyebrow, eyebrowStyle, contentWidth - 260), { x: LEFT, y: 56, fill: theme.subtle, ...eyebrowStyle }));
    if (meta) parts.push(text(meta, { x: RIGHT, y: 56, fill: theme.subtle, anchor: 'end', ...eyebrowStyle }));

    const titleStyle = styles.title(titleSize);
    const titleY = 56 + titleSize * 0.95;
    parts.push(text(fit(title, titleStyle, contentWidth), { x: LEFT, y: titleY, fill: titleColor, ...titleStyle }));

    let bottom = titleY + 22;

    if (subtitle) {
        const style = styles.body(16, 400);
        parts.push(text(fit(subtitle, style, contentWidth), { x: LEFT, y: bottom + 8, fill: theme.muted, ...style }));
        bottom += 26;
    }

    if (chips.length > 0) {
        let x = LEFT;
        for (const item of chips) {
            const built = chip(item, x, bottom);
            if (x + built.width > RIGHT) break;
            parts.push(built.svg);
            x += built.width + 8;
        }
        bottom += 28 + 18;
    }

    return { svg: parts.join(''), bottom: bottom + 4 };
}

// ---- table --------------------------------------------------------------

const COLUMN_GAP = 20;
const ROW_INSET = 12;

function layoutColumns(columns, left = LEFT, width = contentWidth) {
    const fixed = columns.reduce((sum, column) => sum + (column.flex ? 0 : column.width), 0);
    const gaps = COLUMN_GAP * (columns.length - 1);
    const flexWidth = Math.max(width - fixed - gaps, 60);

    let x = left;
    return columns.map((column) => {
        const w = column.flex ? flexWidth : column.width;
        const placed = { ...column, x, w };
        x += w + COLUMN_GAP;
        return placed;
    });
}

// columns: [{ label, width | flex, align: 'left' | 'right', cell(row, box) }]
// where box = { x, w, right, cy, baseline }. Returns { svg, bottom }.
export function table({ top, columns, rows, highlight = () => false, emptyMessage = 'Nothing here yet.', left = LEFT, width = contentWidth, zebra = true }) {
    // Cells sit inside the row like the site's px-3, clear of the highlight bar.
    const placed = layoutColumns(columns, left + ROW_INSET, width - ROW_INSET * 2);
    const parts = [];

    for (const column of placed) {
        if (!column.label) continue;
        const style = styles.caps(13);
        const right = column.align === 'right';
        parts.push(text(column.label, { x: right ? column.x + column.w : column.x, y: top + 25, fill: theme.subtle, anchor: right ? 'end' : 'start', ...style }));
    }
    parts.push(hline(left, top + TABLE_HEAD, width));

    let y = top + TABLE_HEAD + 1;

    if (rows.length === 0) {
        const style = styles.body(16, 400);
        parts.push(text(emptyMessage, { x: left + width / 2, y: y + 46, fill: theme.muted, anchor: 'middle', ...style }));
        return { svg: parts.join(''), bottom: y + 76 };
    }

    rows.forEach((row, index) => {
        const lit = highlight(row);
        if (lit) {
            parts.push(rect({ x: left, y, width, height: ROW_HEIGHT, fill: theme.primaryTint }));
            parts.push(rect({ x: left, y, width: 3, height: ROW_HEIGHT, fill: theme.primary }));
        } else if (zebra && index % 2 === 1) {
            parts.push(rect({ x: left, y, width, height: ROW_HEIGHT, fill: theme.surface }));
        }

        const cy = y + ROW_HEIGHT / 2;
        for (const column of placed) {
            parts.push(column.cell(row, { x: column.x, w: column.w, right: column.x + column.w, cy, baseline: cy + 6 }) || '');
        }

        parts.push(hline(left, y + ROW_HEIGHT - 1, width, theme.rowLine));
        y += ROW_HEIGHT;
    });

    return { svg: parts.join(''), bottom: y };
}

export function tableHeight(rowCount) {
    return TABLE_HEAD + 1 + (rowCount === 0 ? 76 : rowCount * ROW_HEIGHT);
}

// ---- cells and badges ---------------------------------------------------

const MEDALS = { 1: theme.gold, 2: theme.silver, 3: theme.bronze };

// A leaderboard position: a filled medal chip for the top three, a plain
// number for everyone else (site: components/site/rank-cell.tsx).
export function rankCell(rank, { x, cy }) {
    const medal = MEDALS[rank];
    if (medal) {
        return [
            rect({ x, y: cy - 12, width: 30, height: 24, fill: medal }),
            text(String(rank), { x: x + 15, y: cy + 5, fill: theme.background, anchor: 'middle', ...styles.num(14, 600) }),
        ].join('');
    }

    return text(rank ? String(rank) : '—', { x: x + 15, y: cy + 5, fill: rank ? theme.muted : theme.subtle, anchor: 'middle', ...styles.num(15, 400) });
}

export function nameText(name, { x, w, baseline }, { size = 17, fill = theme.text, reserve = 0 } = {}) {
    const style = styles.body(size, 500);
    const shown = fit(name, style, w - reserve);
    return { svg: text(shown, { x, y: baseline, fill, ...style }), width: textWidth(shown, style) };
}

export function numText(value, { x, right, baseline }, { align = 'right', fill = theme.text, size = 17, weight = 500 } = {}) {
    return text(value, { x: align === 'right' ? right : x, y: baseline, fill, anchor: align === 'right' ? 'end' : 'start', ...styles.num(size, weight) });
}

export function tierText(tier, x, y, { size = 15, anchor = 'start' } = {}) {
    return text(tier.name, { x, y, fill: tier.color, anchor, family: 'display', weight: 700, size, letterSpacing: size * 0.08, upper: true });
}

const ICONS = {
    approved: (x, cy, color) => `<path d="M${x} ${cy} l3.5 3.5 l6.5 -7" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
    pending: (x, cy, color) =>
        `<circle cx="${x + 5}" cy="${cy}" r="5.2" fill="none" stroke="${color}" stroke-width="1.5" /><path d="M${x + 5} ${cy - 2.8} v2.8 l2 1.4" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />`,
    denied: (x, cy, color) =>
        `<path d="M${x} ${cy - 5} l10 10 M${x + 10} ${cy - 5} l-10 10" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />`,
};

const STATUS = {
    approved: { label: 'Approved', color: theme.success, fill: '#0e1f14', stroke: '#2a5c38' },
    pending: { label: 'Pending', color: theme.muted, fill: 'none', stroke: theme.lineStrong },
    denied: { label: 'Denied', color: theme.destructive, fill: '#26100f', stroke: '#6b2a28' },
};

export function normalizeState(state) {
    const value = String(state || '').toLowerCase();
    return value === 'approved' || value === 'denied' ? value : 'pending';
}

// Returns { svg, width } so callers can line things up after it.
export function statusBadge(state, x, cy, { size = 13 } = {}) {
    const key = normalizeState(state);
    const { label, color, fill, stroke } = STATUS[key];
    const style = styles.caps(size);
    const height = size + 11;
    const width = 8 + 11 + 6 + textWidth(label, style) + 8;

    return {
        width,
        svg: [
            rect({ x, y: cy - height / 2, width, height, fill, stroke }),
            ICONS[key](x + 8, cy, color),
            text(label, { x: x + 8 + 11 + 6, y: cy + size * 0.36, fill: color, ...style }),
        ].join(''),
    };
}

export function wrBadge(x, cy, { size = 13 } = {}) {
    const style = styles.caps(size);
    const height = size + 11;
    const width = textWidth('WR', style) + 16;
    return {
        width,
        svg: rect({ x, y: cy - height / 2, width, height, fill: theme.gold })
            + text('WR', { x: x + 8, y: cy + size * 0.36, fill: theme.background, ...style }),
    };
}

export function pbBadge(x, cy, { size = 13 } = {}) {
    const style = styles.caps(size);
    const height = size + 11;
    const width = textWidth('PB', style) + 16;
    return {
        width,
        svg: rect({ x, y: cy - height / 2, width, height, stroke: theme.faint })
            + text('PB', { x: x + 8, y: cy + size * 0.36, fill: theme.text, ...style }),
    };
}

// ---- avatar -------------------------------------------------------------

export function avatar({ id, x, y, size, dataUri, name }) {
    const rx = Math.max(3, size * 0.05);
    if (dataUri) {
        return [
            `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" /></clipPath>`,
            rect({ x, y, width: size, height: size, rx, fill: theme.surface3 }),
            `<image x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" xlink:href="${escapeXml(dataUri)}" />`,
        ].join('');
    }

    return [
        rect({ x, y, width: size, height: size, rx, fill: theme.surface3, stroke: theme.line }),
        text(nameInitials(name), { x: x + size / 2, y: y + size * 0.64, fill: theme.muted, anchor: 'middle', family: 'display', weight: 700, size: size * 0.42, upper: true }),
    ].join('');
}

// ---- footer -------------------------------------------------------------

export function footerHeight() {
    return FOOTER_HEIGHT;
}

export function footer(height, { right = null } = {}) {
    const y = height - 24;
    const style = styles.caps(13);
    const parts = [
        hline(LEFT, height - FOOTER_HEIGHT + 10, contentWidth),
        text('wasans.tully.sh', { x: LEFT, y, fill: theme.faint, ...style }),
    ];
    if (right) parts.push(text(right, { x: RIGHT, y, fill: theme.subtle, anchor: 'end', ...style }));
    return parts.join('');
}

// ---- formatting ---------------------------------------------------------

export function formatTime(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num.toFixed(3) : '—';
}

export function formatScore(value) {
    const num = Number(value);
    return value !== null && value !== undefined && Number.isFinite(num) ? num.toFixed(3) : '—';
}

// A signed difference with a real minus sign, like the site's formatDelta.
export function formatDelta(value) {
    const num = Number(value);
    if (value === null || value === undefined || !Number.isFinite(num)) return '—';
    const magnitude = Math.abs(num).toFixed(3);
    if (Number(magnitude) === 0) return '0.000';
    return `${num > 0 ? '+' : '−'}${magnitude}`;
}

export function formatCount(value) {
    const num = Number(value);
    return value !== null && value !== undefined && Number.isFinite(num) ? num.toLocaleString('en-US') : '—';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(unixSeconds) {
    const seconds = Number(unixSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const date = new Date(seconds * 1000);
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// "today", "41d", "5mo", "2y" -- the site's formatAge.
export function formatAge(unixSeconds, now = Date.now() / 1000) {
    const seconds = Number(unixSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const days = Math.max(0, Math.floor((now - seconds) / 86400));
    if (days < 1) return 'today';
    if (days < 100) return `${days}d`;
    if (days < 730) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
}

export function formatDays(days) {
    if (days < 1) return '<1d';
    if (days < 100) return `${days}d`;
    if (days < 730) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
}
