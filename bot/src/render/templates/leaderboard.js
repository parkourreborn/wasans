import { cardHeight, emptyState, footer, header, layout, rankBadge, rowPanel, rowY } from '../card.js';
import { fitText, pill, svgDocument, text, textWidth, theme } from '../theme.js';

// Rows read "rank · player · stat". The stat column is reserved on the right so
// a long player name gets ellipsised instead of colliding with it.
const STAT_COLUMN = 180;
const NAME_X = layout.padding + 72;
const WR_PILL_WIDTH = 46;

export function renderLeaderboardCard({
    trial = null,
    entries = [],
    page = 1,
    totalPages = 1,
    total = null,
    emptyMessage = 'No leaderboard entries found.',
}) {
    const height = cardHeight(entries.length);
    const nameLimit = theme.width - layout.padding - STAT_COLUMN - NAME_X;

    const body = [
        header({
            eyebrow: trial ? 'WASANS · Trial Leaderboard' : 'WASANS',
            title: trial || 'Overall Leaderboard',
            subtitle: trial ? `Fastest recorded times on ${trial}` : 'Ranked by total score across every trial',
            badge: `Page ${page}/${totalPages}`,
        }),
    ];

    if (entries.length === 0) {
        body.push(emptyState(emptyMessage));
    }

    entries.forEach((entry, index) => {
        const centerY = rowY(index) + layout.rowHeight / 2;
        const isWr = Boolean(entry.isWorldRecord);
        const name = fitText(entry.name, 19, isWr ? nameLimit - WR_PILL_WIDTH : nameLimit, 600);

        body.push(rowPanel(index, { highlight: isWr }));
        body.push(rankBadge(index, entry.rank));
        body.push(text(name, { x: NAME_X, y: centerY + 7, size: 19, weight: 600, fill: theme.text }));

        if (isWr) {
            body.push(
                pill('WR', {
                    x: NAME_X + textWidth(name, 19, 600) + 12,
                    y: centerY - 11,
                    height: 22,
                    size: 11,
                    paddingX: 9,
                    fill: theme.accentSoft,
                    stroke: theme.accentDim,
                    color: '#ff8a8a',
                }),
            );
        }

        body.push(
            text(entry.stat, {
                x: theme.width - layout.padding - 20,
                y: centerY + 7,
                size: 19,
                weight: 900,
                fill: entry.unranked ? theme.dim : theme.accent,
                anchor: 'end',
            }),
        );
    });

    body.push(
        footer(height, {
            right: total === null ? null : `${total} ranked player${total === 1 ? '' : 's'}`,
        }),
    );

    return { svg: svgDocument(theme.width, height, body.join('')), width: theme.width };
}
