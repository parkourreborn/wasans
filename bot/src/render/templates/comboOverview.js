import { contentWidth, footer, header, layout } from '../card.js';
import { fitText, rect, svgDocument, text, theme } from '../theme.js';

// The combo board's front page: every active category stacked, each showing its
// top few holders. Unlike the list cards this has no uniform row grid — the
// height is summed from the sections — so it doesn't use cardHeight/rowY.

const SECTION_LABEL_HEIGHT = 36;
const ROW_HEIGHT = 42;
const ROW_GAP = 6;
const SECTION_GAP = 20;
const COUNT_COLUMN = 130;
const NAME_X = layout.padding + 58;

function sectionHeight(rowCount) {
    const rows = Math.max(rowCount, 1);
    return SECTION_LABEL_HEIGHT + rows * ROW_HEIGHT + (rows - 1) * ROW_GAP;
}

function miniRankBadge(x, cy, rank) {
    const medal = [theme.gold, theme.silver, theme.bronze][rank - 1];

    if (medal) {
        return [
            `<circle cx="${x}" cy="${cy}" r="13" fill="${medal}" />`,
            text(String(rank), { x, y: cy + 5, size: 13, weight: 900, fill: '#14140f', anchor: 'middle' }),
        ].join('');
    }

    return [
        `<circle cx="${x}" cy="${cy}" r="13" fill="${theme.panelStrong}" stroke="${theme.panelBorder}" stroke-width="1" />`,
        text(String(rank), { x, y: cy + 4, size: 12, weight: 700, fill: theme.muted, anchor: 'middle' }),
    ].join('');
}

export function renderComboOverviewCard({ categories = [], perCategory = 3, omitted = 0 }) {
    const height =
        layout.headerHeight
        + categories.reduce((sum, category) => sum + sectionHeight(category.entries.length), 0)
        + Math.max(categories.length - 1, 0) * SECTION_GAP
        + layout.footerHeight
        + layout.padding;

    const totalRanked = categories.reduce((sum, category) => sum + (category.total || 0), 0);

    const body = [
        header({
            eyebrow: 'WASANS · Combo Leaderboards',
            title: 'Combo Board',
            subtitle:
                categories.length === 0
                    ? 'No combo categories are currently active'
                    : `Top ${perCategory} in each of ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`
                      + (omitted > 0 ? ` · ${omitted} more via /combos category` : ''),
            badge: 'Overview',
        }),
    ];

    let y = layout.headerHeight;

    categories.forEach((category, categoryIndex) => {
        if (categoryIndex > 0) y += SECTION_GAP;

        body.push(
            text(String(category.label).toUpperCase(), {
                x: layout.padding,
                y: y + 20,
                size: 12,
                weight: 900,
                fill: theme.accent,
                letterSpacing: 2,
            }),
        );

        if (category.total !== null && category.total !== undefined) {
            body.push(
                text(`${category.total} ranked`, {
                    x: theme.width - layout.padding,
                    y: y + 20,
                    size: 12,
                    weight: 600,
                    fill: theme.dim,
                    anchor: 'end',
                }),
            );
        }

        const rowsTop = y + SECTION_LABEL_HEIGHT;

        if (category.entries.length === 0) {
            body.push(
                rect({
                    x: layout.padding,
                    y: rowsTop,
                    width: contentWidth,
                    height: ROW_HEIGHT,
                    rx: 12,
                    fill: theme.panel,
                    stroke: theme.panelBorder,
                }),
                text('No approved combos yet', {
                    x: theme.width / 2,
                    y: rowsTop + ROW_HEIGHT / 2 + 5,
                    size: 14,
                    weight: 500,
                    fill: theme.muted,
                    anchor: 'middle',
                }),
            );
        }

        category.entries.forEach((entry, index) => {
            const rowTop = rowsTop + index * (ROW_HEIGHT + ROW_GAP);
            const centerY = rowTop + ROW_HEIGHT / 2;

            body.push(
                rect({
                    x: layout.padding,
                    y: rowTop,
                    width: contentWidth,
                    height: ROW_HEIGHT,
                    rx: 12,
                    fill: index === 0 ? theme.panelStrong : theme.panel,
                    stroke: index === 0 ? theme.accentDim : theme.panelBorder,
                }),
            );
            body.push(miniRankBadge(layout.padding + 30, centerY, entry.rank));
            body.push(
                text(fitText(entry.name, 17, theme.width - layout.padding - COUNT_COLUMN - NAME_X, 600), {
                    x: NAME_X,
                    y: centerY + 6,
                    size: 17,
                    weight: 600,
                    fill: theme.text,
                }),
            );
            body.push(
                text(entry.stat, {
                    x: theme.width - layout.padding - 18,
                    y: centerY + 6,
                    size: 17,
                    weight: 900,
                    fill: theme.accent,
                    anchor: 'end',
                }),
            );
        });

        y = rowsTop + sectionHeight(category.entries.length) - SECTION_LABEL_HEIGHT;
    });

    body.push(
        footer(height, {
            right: `${totalRanked} combo best${totalRanked === 1 ? '' : 's'}`,
        }),
    );

    return { svg: svgDocument(theme.width, height, body.join('')), width: theme.width };
}
