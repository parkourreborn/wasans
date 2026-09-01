// Layout pieces the list-style templates share: the header block, the row
// strips, and the footer. Each command template still assembles its own SVG so
// it stays free to lay a row out however it wants.

import { escapeXml, fitText, pill, rect, text, theme } from './theme.js';

export const layout = {
    padding: 32,
    headerHeight: 140,
    rowHeight: 56,
    rowGap: 8,
    footerHeight: 54,
};

export const contentWidth = theme.width - layout.padding * 2;

export function cardHeight(rowCount) {
    const rows = Math.max(rowCount, 1);
    const rowsHeight = rows * layout.rowHeight + (rows - 1) * layout.rowGap;
    return layout.headerHeight + rowsHeight + layout.footerHeight + layout.padding;
}

export function header({ eyebrow, title, subtitle, badge = null }) {
    const parts = [
        text(String(eyebrow).toUpperCase(), {
            x: layout.padding,
            y: 52,
            size: 12,
            weight: 900,
            fill: theme.accent,
            letterSpacing: 2.4,
        }),
        // The badge sits in the top right, so the title has to stop short of it.
        text(fitText(title, 34, contentWidth - (badge ? 170 : 24), 900), {
            x: layout.padding,
            y: 92,
            size: 34,
            weight: 900,
            fill: theme.text,
        }),
    ];

    if (subtitle) {
        parts.push(
            text(fitText(subtitle, 15, contentWidth - 24), {
                x: layout.padding,
                y: 118,
                size: 15,
                weight: 500,
                fill: theme.muted,
            }),
        );
    }

    if (badge) {
        parts.push(
            pill(badge, {
                x: theme.width - layout.padding,
                y: 40,
                anchor: 'end',
                height: 32,
                size: 13,
                fill: theme.accentSoft,
                stroke: theme.accentDim,
                color: '#ff8a8a',
            }),
        );
    }

    parts.push(rect({ x: layout.padding, y: layout.headerHeight - 14, width: contentWidth, height: 1, fill: theme.panelBorder }));

    return parts.join('');
}

export function rowY(index) {
    return layout.headerHeight + index * (layout.rowHeight + layout.rowGap);
}

export function rowPanel(index, { highlight = false } = {}) {
    return rect({
        x: layout.padding,
        y: rowY(index),
        width: contentWidth,
        height: layout.rowHeight,
        rx: 14,
        fill: highlight ? theme.panelStrong : theme.panel,
        stroke: highlight ? theme.accentDim : theme.panelBorder,
    });
}

// Rank chip on the left of a row: a filled medal disc for the podium, a flat
// numeric label for everyone else.
export function rankBadge(index, rank) {
    const cy = rowY(index) + layout.rowHeight / 2;
    const cx = layout.padding + 40;
    const medal = [theme.gold, theme.silver, theme.bronze][rank - 1];

    if (medal) {
        return [
            `<circle cx="${cx}" cy="${cy}" r="17" fill="${medal}" />`,
            text(String(rank), { x: cx, y: cy + 6, size: 16, weight: 900, fill: '#14140f', anchor: 'middle' }),
        ].join('');
    }

    return [
        `<circle cx="${cx}" cy="${cy}" r="17" fill="${theme.panelStrong}" stroke="${theme.panelBorder}" stroke-width="1" />`,
        text(rank === null || rank === undefined ? '–' : String(rank), {
            x: cx,
            y: cy + 5,
            size: 14,
            weight: 700,
            fill: theme.muted,
            anchor: 'middle',
        }),
    ].join('');
}

export function stateDot(state) {
    const normalized = String(state || '').toLowerCase();
    if (normalized.startsWith('approv')) return theme.approved;
    if (normalized.startsWith('den')) return theme.denied;
    if (normalized.startsWith('pend')) return theme.pending;
    return theme.dim;
}

export function emptyState(message) {
    const y = rowY(0);
    return [
        rect({
            x: layout.padding,
            y,
            width: contentWidth,
            height: layout.rowHeight,
            rx: 14,
            fill: theme.panel,
            stroke: theme.panelBorder,
        }),
        text(message, {
            x: theme.width / 2,
            y: y + layout.rowHeight / 2 + 6,
            size: 16,
            weight: 500,
            fill: theme.muted,
            anchor: 'middle',
        }),
    ].join('');
}

export function footer(height, { left = 'wasans.tully.sh', right = null }) {
    const y = height - layout.padding - 8;
    const parts = [
        text(left, { x: layout.padding, y, size: 13, weight: 600, fill: theme.dim, letterSpacing: 0.8 }),
    ];

    if (right) {
        parts.push(text(right, { x: theme.width - layout.padding, y, size: 13, weight: 600, fill: theme.dim, anchor: 'end' }));
    }

    return parts.join('');
}

export { escapeXml };
