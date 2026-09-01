import { cardHeight, emptyState, footer, header, layout, rowPanel, rowY } from '../card.js';
import { fitText, rect, svgDocument, text, theme } from '../theme.js';

// World records are trial-first: the trial name owns a fixed left column so the
// list scans vertically as "which trial", then "who holds it", then "how fast".
const TRIAL_X = layout.padding + 22;
const TRIAL_COLUMN = 210;
const TIME_COLUMN = 150;

export function renderWrsCard({ records = [], page = 1, totalPages = 1, total = null }) {
    const height = cardHeight(records.length);
    const holderX = TRIAL_X + TRIAL_COLUMN;
    const holderLimit = theme.width - layout.padding - TIME_COLUMN - holderX;

    const body = [
        header({
            eyebrow: 'WASANS',
            title: 'World Records',
            subtitle: 'The current fastest time on every trial',
            badge: `Page ${page}/${totalPages}`,
        }),
    ];

    if (records.length === 0) {
        body.push(emptyState('No world records found.'));
    }

    records.forEach((record, index) => {
        const centerY = rowY(index) + layout.rowHeight / 2;

        body.push(rowPanel(index));
        body.push(
            rect({ x: layout.padding + 1, y: rowY(index) + 12, width: 3, height: layout.rowHeight - 24, rx: 1.5, fill: theme.accent }),
        );
        body.push(
            text(fitText(record.trial, 18, TRIAL_COLUMN - 24, 700), {
                x: TRIAL_X,
                y: centerY + 6,
                size: 18,
                weight: 700,
                fill: theme.text,
            }),
        );
        body.push(
            text(fitText(record.holder, 17, holderLimit, 500), {
                x: holderX,
                y: centerY + 6,
                size: 17,
                weight: 500,
                fill: theme.muted,
            }),
        );
        body.push(
            text(record.time, {
                x: theme.width - layout.padding - 20,
                y: centerY + 7,
                size: 19,
                weight: 900,
                fill: theme.accent,
                anchor: 'end',
            }),
        );
    });

    body.push(footer(height, { right: total === null ? null : `${total} record${total === 1 ? '' : 's'}` }));

    return { svg: svgDocument(theme.width, height, body.join('')), width: theme.width };
}
