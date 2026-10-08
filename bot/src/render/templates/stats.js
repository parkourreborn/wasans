import { avatar, contentWidth, footer, footerHeight, formatCount, formatDate, formatScore, formatTime, numText, statusBadge, table, tableHeight, tierText, wrBadge } from '../card.js';
import { fit, rect, styles, svgDocument, text, textWidth, theme } from '../theme.js';

// A player's profile sheet, modelled on the site's profile header: avatar,
// name, tier, score and rank, progress to the next tier, headline numbers,
// then their latest runs.
const LEFT = theme.padding;
const RIGHT = theme.width - theme.padding;
const AVATAR = 112;
const TILE_H = 96;

function tierBar(tier, next, score, y) {
    const parts = [rect({ x: LEFT, y, width: contentWidth, height: 6, fill: theme.surface3 })];
    const floor = tier.min;
    const ceiling = next ? next.tier.min : 1;
    const progress = next ? Math.min(Math.max((score - floor) / (ceiling - floor), 0), 1) : 1;
    parts.push(rect({ x: LEFT, y, width: Math.max(contentWidth * progress, 4), height: 6, fill: tier.color }));

    parts.push(tierText(tier, LEFT, y + 30, { size: 14 }));
    if (next) {
        const label = `${next.needed.toFixed(3)} to `;
        const labelStyle = styles.body(14, 400);
        const nextWidth = textWidth(next.tier.name, { family: 'display', weight: 700, size: 14, letterSpacing: 14 * 0.08, upper: true });
        parts.push(text(label, { x: RIGHT - nextWidth - 4, y: y + 30, fill: theme.muted, anchor: 'end', ...labelStyle }));
        parts.push(tierText(next.tier, RIGHT, y + 30, { size: 14, anchor: 'end' }));
    } else {
        parts.push(text('Top tier', { x: RIGHT, y: y + 30, fill: theme.muted, anchor: 'end', ...styles.body(14, 400) }));
    }
    return parts.join('');
}

function tiles(items, y) {
    const gap = 12;
    const width = (contentWidth - gap * (items.length - 1)) / items.length;

    return items
        .map((item, index) => {
            const x = LEFT + index * (width + gap);
            const valueStyle = styles.num(30, 600);
            const value = fit(item.value, valueStyle, width - 36);
            const parts = [
                rect({ x, y, width, height: TILE_H, fill: theme.surface, stroke: theme.line }),
                text(item.label, { x: x + 18, y: y + 32, fill: theme.subtle, ...styles.caps(14) }),
                text(value, { x: x + 18, y: y + 74, fill: item.color || theme.text, ...valueStyle }),
            ];
            if (item.suffix) {
                parts.push(text(item.suffix, { x: x + 18 + textWidth(value, valueStyle) + 8, y: y + 74, fill: theme.subtle, ...styles.body(15, 400) }));
            }
            return parts.join('');
        })
        .join('');
}

// {
//   name, avatarDataUri, tier, next, score, rank, totalPlayers, joined, badges: [string],
//   tiles: [{ label, value, suffix?, color? }],
//   recent: [{ state, label, value, date, kind, isWr }],
// }
export function renderStatsCard({ name, avatarDataUri, tier, next, score, rank, totalPlayers, joined, lastPb, tiles: tileItems, recent }) {
    const parts = [];
    const caps = styles.caps(15);

    parts.push(text('Player', { x: LEFT, y: 56, fill: theme.subtle, ...caps }));
    if (rank) {
        parts.push(text(totalPlayers ? `Rank #${rank} of ${formatCount(totalPlayers)}` : `Rank #${rank}`, { x: RIGHT, y: 56, fill: theme.subtle, anchor: 'end', ...caps }));
    }

    const top = 80;
    parts.push(avatar({ id: 'stats-avatar', x: LEFT, y: top, size: AVATAR, dataUri: avatarDataUri, name }));

    const scoreStyle = styles.num(52, 600);
    const scoreText = formatScore(score);
    const scoreWidth = textWidth(scoreText, scoreStyle);
    parts.push(text('Score', { x: RIGHT, y: top + 20, fill: theme.subtle, anchor: 'end', ...styles.caps(14) }));
    parts.push(text(scoreText, { x: RIGHT, y: top + 72, fill: theme.text, anchor: 'end', ...scoreStyle }));

    const nameX = LEFT + AVATAR + 24;
    const nameStyle = { family: 'display', weight: 700, size: 58 };
    parts.push(text(fit(name, nameStyle, RIGHT - scoreWidth - 32 - nameX), { x: nameX, y: top + 62, fill: theme.text, ...nameStyle }));

    // Tier, joined, last PB -- the site's profile meta line.
    let metaX = nameX;
    const metaY = top + 100;
    parts.push(tierText(tier, metaX, metaY, { size: 17 }));
    metaX += textWidth(tier.name, { family: 'display', weight: 700, size: 17, letterSpacing: 17 * 0.08, upper: true }) + 20;
    const metaStyle = styles.body(15, 400);
    for (const [label, value] of [['Joined', joined], ['Last PB', lastPb]]) {
        if (!value) continue;
        parts.push(text(`${label} `, { x: metaX, y: metaY, fill: theme.muted, ...metaStyle }));
        const labelWidth = textWidth(`${label} `, metaStyle);
        parts.push(text(value, { x: metaX + labelWidth, y: metaY, fill: theme.text, ...metaStyle }));
        metaX += labelWidth + textWidth(value, metaStyle) + 20;
    }

    let y = top + AVATAR + 32;
    parts.push(tierBar(tier, next, Number(score) || 0, y));
    y += 62;

    parts.push(tiles(tileItems, y));
    y += TILE_H + 36;

    parts.push(text('Latest runs', { x: LEFT, y, fill: theme.text, family: 'display', weight: 700, size: 22, letterSpacing: 0.6, upper: true }));
    y += 12;

    const recentTable = table({
        top: y,
        rows: recent,
        emptyMessage: 'No runs yet.',
        columns: [
            { label: 'Status', width: 112, cell: (row, box) => statusBadge(row.state, box.x, box.cy).svg },
            {
                label: 'Run',
                flex: true,
                cell: (row, box) => {
                    const style = { family: 'display', weight: 700, size: 19, letterSpacing: 0.6, upper: true };
                    const shown = fit(row.label, style, box.w - 60);
                    return text(shown, { x: box.x, y: box.baseline, fill: theme.text, ...style })
                        + (row.isWr ? wrBadge(box.x + textWidth(shown, style) + 10, box.cy, { size: 12 }).svg : '');
                },
            },
            { label: 'Date', width: 110, cell: (row, box) => text(formatDate(row.date), { x: box.x, y: box.baseline, fill: theme.subtle, ...styles.body(14, 400) }) },
            {
                label: 'Result',
                width: 120,
                align: 'right',
                cell: (row, box) => numText(row.kind === 'combo' ? formatCount(row.value) : formatTime(row.value), box, { weight: 600, fill: row.isWr ? theme.gold : theme.text }),
            },
        ],
    });
    parts.push(recentTable.svg);
    y += tableHeight(recent.length);

    const height = y + 12 + footerHeight();
    parts.push(footer(height));

    return { svg: svgDocument(theme.width, height, parts.join('')), width: theme.width };
}
