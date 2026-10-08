import { formatCount, formatDate, formatTime, nameText, numText, statusBadge, wrBadge } from '../card.js';
import { fit, styles, text, textWidth, theme } from '../theme.js';
import { renderListCard } from './list.js';

// A list of runs, newest first: status, trial (or combo category), player,
// date and the time (or combo count) on the right. Rows:
// { state, label, player, date, value, isWr, kind: 'trial' | 'combo' }.
export function renderSubmissionsCard({ eyebrow, title, meta, chips, rows, emptyMessage, footerRight, kind = 'trial', showPlayer = true }) {
    const columns = [
        { label: 'Status', width: 112, cell: (row, box) => statusBadge(row.state, box.x, box.cy).svg },
        {
            label: kind === 'combo' ? 'Category' : 'Trial',
            width: showPlayer ? 200 : 360,
            flex: !showPlayer,
            cell: (row, box) => {
                const style = { family: 'display', weight: 700, size: 19, letterSpacing: 0.6, upper: true };
                const reserve = row.isWr ? 50 : 0;
                const shown = fit(row.label, style, box.w - reserve);
                const parts = [text(shown, { x: box.x, y: box.baseline, fill: theme.text, ...style })];
                if (row.isWr) parts.push(wrBadge(box.x + textWidth(shown, style) + 10, box.cy, { size: 12 }).svg);
                return parts.join('');
            },
        },
    ];

    if (showPlayer) {
        columns.push({ label: 'Player', flex: true, cell: (row, box) => nameText(row.player, box, { size: 16 }).svg });
    }

    columns.push(
        { label: 'Date', width: 110, cell: (row, box) => text(formatDate(row.date), { x: box.x, y: box.baseline, fill: theme.subtle, ...styles.body(14, 400) }) },
        {
            label: kind === 'combo' ? 'Combo' : 'Time',
            width: 120,
            align: 'right',
            cell: (row, box) =>
                numText(kind === 'combo' ? formatCount(row.value) : formatTime(row.value), box, {
                    weight: 600,
                    fill: row.isWr ? theme.gold : row.state === 'denied' ? theme.subtle : theme.text,
                }),
        },
    );

    return renderListCard({
        eyebrow,
        title,
        meta,
        chips,
        columns,
        rows,
        emptyMessage: emptyMessage || 'No runs match these filters.',
        footerRight,
    });
}

