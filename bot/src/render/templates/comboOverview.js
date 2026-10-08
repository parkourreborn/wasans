import { contentWidth, footer, footerHeight, formatCount, header, nameText, numText, rankCell, table, tableHeight } from '../card.js';
import { svgDocument, text, theme } from '../theme.js';

// Every combo category's top few on one card, two boards per row.
// categories: [{ label, total, entries: [{ rank, name, combo }] }].
const GAP_X = 32;
const GAP_Y = 30;
const TITLE_H = 34;

export function renderComboOverviewCard({ categories, perCategory, omitted = 0 }) {
    const head = header({ eyebrow: 'Wasans · Combo leaderboards', title: 'Combos', meta: `Top ${perCategory} per category` });
    const boardWidth = (contentWidth - GAP_X) / 2;
    const boardHeight = TITLE_H + tableHeight(perCategory);
    const parts = [head.svg];

    categories.forEach((category, index) => {
        const column = index % 2;
        const rowIndex = Math.floor(index / 2);
        const x = theme.padding + column * (boardWidth + GAP_X);
        const y = head.bottom + 8 + rowIndex * (boardHeight + GAP_Y);

        parts.push(text(category.label, { x, y: y + 22, fill: theme.text, family: 'display', weight: 700, size: 24, letterSpacing: 0.6, upper: true }));
        if (category.total !== null) {
            parts.push(text(`${category.total} ranked`, { x: x + boardWidth, y: y + 22, fill: theme.subtle, anchor: 'end', family: 'display', weight: 600, size: 13, letterSpacing: 1, upper: true }));
        }

        const rows = category.entries;
        parts.push(
            table({
                top: y + TITLE_H,
                left: x,
                width: boardWidth,
                rows,
                emptyMessage: 'No approved combos yet.',
                columns: [
                    { label: 'Pos', width: 34, cell: (row, box) => rankCell(row.rank, box) },
                    { label: 'Player', flex: true, cell: (row, box) => nameText(row.name, box, { size: 16 }).svg },
                    { label: 'Combo', width: 110, align: 'right', cell: (row, box) => numText(formatCount(row.combo), box, { weight: 600 }) },
                ],
            }).svg,
        );
    });

    const rowsOfBoards = Math.max(Math.ceil(categories.length / 2), 1);
    const height = head.bottom + 8 + rowsOfBoards * boardHeight + (rowsOfBoards - 1) * GAP_Y + footerHeight() + 10;
    parts.push(footer(height, { right: omitted > 0 ? `+${omitted} more: /leaderboard board:<category>` : null }));

    return { svg: svgDocument(theme.width, height, parts.join('')), width: theme.width };
}
