import { cardHeight, emptyState, footer, header, layout, rowPanel, rowY } from '../card.js';
import { fitText, pill, rect, svgDocument, text, theme } from '../theme.js';

// Personal bests always list every trial, including the ones with no time yet,
// so the card doubles as a "what's left to run" checklist.
const TRIAL_X = layout.padding + 22;

export function renderPbsCard({ player, entries = [], page = 1, totalPages = 1, completed = 0, totalTrials = 0 }) {
    const height = cardHeight(entries.length);

    const body = [
        header({
            eyebrow: 'WASANS · Personal Bests',
            title: player,
            subtitle: `${completed} of ${totalTrials} trials completed`,
            badge: `Page ${page}/${totalPages}`,
        }),
    ];

    if (entries.length === 0) {
        body.push(emptyState('No personal bests found for this player.'));
    }

    entries.forEach((entry, index) => {
        const centerY = rowY(index) + layout.rowHeight / 2;
        const hasTime = Boolean(entry.time);

        body.push(rowPanel(index, { highlight: Boolean(entry.isWorldRecord) }));
        body.push(
            rect({
                x: layout.padding + 1,
                y: rowY(index) + 12,
                width: 3,
                height: layout.rowHeight - 24,
                rx: 1.5,
                fill: hasTime ? theme.accent : theme.panelBorder,
            }),
        );
        body.push(
            text(fitText(entry.trial, 18, 320, 700), {
                x: TRIAL_X,
                y: centerY + 6,
                size: 18,
                weight: 700,
                fill: hasTime ? theme.text : theme.dim,
            }),
        );

        if (entry.isWorldRecord) {
            body.push(
                pill('WORLD RECORD', {
                    x: TRIAL_X + 340,
                    y: centerY - 11,
                    height: 22,
                    size: 10,
                    paddingX: 10,
                    fill: theme.accentSoft,
                    stroke: theme.accentDim,
                    color: '#ff8a8a',
                }),
            );
        }

        body.push(
            text(hasTime ? entry.time : 'No PB', {
                x: theme.width - layout.padding - 20,
                y: centerY + 7,
                size: 19,
                weight: 900,
                fill: hasTime ? theme.accent : theme.dim,
                anchor: 'end',
            }),
        );
    });

    body.push(footer(height, { right: `${completed}/${totalTrials} trials` }));

    return { svg: svgDocument(theme.width, height, body.join('')), width: theme.width };
}
