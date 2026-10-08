import { formatAge, formatCount, formatDelta, formatScore, formatTime, nameText, numText, rankCell, tierText, wrBadge } from '../card.js';
import { theme } from '../theme.js';
import { renderListCard } from './list.js';

// The three boards share a shape -- position, player, then the board's own
// columns -- matching the site's /leaderboard, /trials/[slug] and combo
// boards. Rows: { rank, name, highlighted, ... } plus per-variant fields.

const pos = { label: 'Pos', width: 34, cell: (row, box) => rankCell(row.rank, box) };

function player({ wrBadgeFor = () => false } = {}) {
    return {
        label: 'Player',
        flex: true,
        cell: (row, box) => {
            const wr = wrBadgeFor(row);
            const name = nameText(row.name, box, { reserve: wr ? 52 : 0 });
            return name.svg + (wr ? wrBadge(box.x + name.width + 12, box.cy).svg : '');
        },
    };
}

const VARIANTS = {
    overall: [
        pos,
        player(),
        { label: 'Tier', width: 150, cell: (row, box) => (row.tier ? tierText(row.tier, box.x, box.baseline) : '') },
        {
            label: 'WRs',
            width: 50,
            cell: (row, box) => numText(row.wrs > 0 ? String(row.wrs) : '—', box, { align: 'left', fill: row.wrs > 0 ? theme.gold : theme.faint, size: 15 }),
        },
        { label: 'Score', width: 110, align: 'right', cell: (row, box) => numText(formatScore(row.score), box, { weight: 600 }) },
    ],
    trial: [
        pos,
        player({ wrBadgeFor: (row) => row.isWr }),
        { label: 'Set', width: 70, align: 'right', cell: (row, box) => numText(formatAge(row.date), box, { fill: theme.subtle, size: 14, weight: 400 }) },
        {
            label: 'Gap',
            width: 90,
            align: 'right',
            cell: (row, box) => numText(row.isWr ? '—' : formatDelta(row.gap), box, { fill: theme.subtle, size: 14, weight: 400 }),
        },
        { label: 'Score', width: 80, align: 'right', cell: (row, box) => numText(formatScore(row.score), box, { fill: theme.muted, size: 15, weight: 400 }) },
        {
            label: 'Time',
            width: 100,
            align: 'right',
            cell: (row, box) => numText(formatTime(row.time), box, { weight: 600, fill: row.isWr ? theme.gold : theme.text }),
        },
    ],
    combo: [
        pos,
        player(),
        { label: 'Set', width: 70, align: 'right', cell: (row, box) => numText(formatAge(row.date), box, { fill: theme.subtle, size: 14, weight: 400 }) },
        { label: 'Combo', width: 140, align: 'right', cell: (row, box) => numText(formatCount(row.combo), box, { weight: 600 }) },
    ],
};

export function renderLeaderboardCard({ variant, eyebrow, title, meta, subtitle, chips, rows, emptyMessage, footerRight }) {
    return renderListCard({
        eyebrow,
        title,
        meta,
        subtitle,
        chips,
        columns: VARIANTS[variant] || VARIANTS.overall,
        rows,
        highlight: (row) => Boolean(row.highlighted),
        emptyMessage: emptyMessage || 'No ranked players yet.',
        footerRight,
    });
}
