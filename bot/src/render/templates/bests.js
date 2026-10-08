import { contentWidth, footer, footerHeight, header, numText, table, tableHeight, wrBadge } from '../card.js';
import { fit, svgDocument, text, textWidth, theme } from '../theme.js';

// A player's best on every trial (or combo category) as a checklist, the
// empty ones included. More than eight rows splits into two columns so the
// whole set fits on one card. Rows: { label, value, score, isWr }, with
// value null for "no run yet".
const COLUMN_GAP = 32;

function columns({ withScore, valueLabel }) {
    const list = [
        {
            label: 'Trial',
            flex: true,
            cell: (row, box) => {
                const style = { family: 'display', weight: 700, size: 18, letterSpacing: 0.5, upper: true };
                const shown = fit(row.label, style, box.w - (row.isWr ? 48 : 0));
                return text(shown, { x: box.x, y: box.baseline, fill: row.value ? theme.text : theme.subtle, ...style })
                    + (row.isWr ? wrBadge(box.x + textWidth(shown, style) + 10, box.cy, { size: 12 }).svg : '');
            },
        },
    ];

    if (withScore) {
        list.push({
            label: 'Score',
            width: 64,
            align: 'right',
            cell: (row, box) => numText(row.value ? row.score : '—', box, { fill: row.value ? theme.muted : theme.faint, size: 15, weight: 400 }),
        });
    }

    list.push({
        label: valueLabel,
        width: 96,
        align: 'right',
        cell: (row, box) => numText(row.value || '—', box, { weight: 600, fill: row.isWr ? theme.gold : row.value ? theme.text : theme.faint }),
    });

    return list;
}

export function renderBestsCard({ eyebrow, title, meta, rows, withScore = true, valueLabel = 'Time', firstLabel = 'Trial', emptyMessage, footerRight }) {
    const head = header({ eyebrow, title, meta });
    const top = head.bottom + 8;
    const split = rows.length > 8;
    const perColumn = split ? Math.ceil(rows.length / 2) : rows.length;
    const columnWidth = split ? (contentWidth - COLUMN_GAP) / 2 : contentWidth;
    const defs = columns({ withScore, valueLabel });
    defs[0].label = firstLabel;

    const parts = [head.svg];
    const halves = split ? [rows.slice(0, perColumn), rows.slice(perColumn)] : [rows];
    halves.forEach((half, index) => {
        parts.push(
            table({
                top,
                rows: half,
                columns: defs,
                left: theme.padding + index * (columnWidth + COLUMN_GAP),
                width: columnWidth,
                emptyMessage: emptyMessage || 'Nothing here yet.',
            }).svg,
        );
    });

    const height = top + tableHeight(perColumn) + footerHeight() + 6;
    parts.push(footer(height, { right: footerRight }));

    return { svg: svgDocument(theme.width, height, parts.join('')), width: theme.width };
}
