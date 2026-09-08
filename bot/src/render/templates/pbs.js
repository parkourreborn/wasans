import { cardHeight, emptyState, footer, header, layout, rowPanel, rowY } from '../card.js';
import { fitText, pill, rect, svgDocument, text, theme } from '../theme.js';

// Personal bests always list every trial, including the ones with no time yet,
// so the card doubles as a "what's left to run" checklist.
//
// Rows are label/value pairs rather than trial/time specifically, so combo
// bests (category + combo count) render through the same template. `trial` and
// `time` stay accepted as the trial-side names.
const TRIAL_X = layout.padding + 22;

export function renderPbsCard({
    player,
    entries = [],
    page = 1,
    totalPages = 1,
    completed = 0,
    totalTrials = 0,
    eyebrow = 'WASANS · Personal Bests',
    noun = 'trials',
    verb = 'completed',
    emptyMessage = 'No personal bests found for this player.',
    emptyValue = 'No PB',
}) {
    const height = cardHeight(entries.length);

    const body = [
        header({
            eyebrow,
            title: player,
            subtitle: `${completed} of ${totalTrials} ${noun} ${verb}`,
            badge: `Page ${page}/${totalPages}`,
        }),
    ];

    if (entries.length === 0) {
        body.push(emptyState(emptyMessage));
    }

    entries.forEach((entry, index) => {
        const centerY = rowY(index) + layout.rowHeight / 2;
        const label = entry.label ?? entry.trial;
        const value = entry.value ?? entry.time;
        const hasTime = Boolean(value);

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
            text(fitText(label, 18, 320, 700), {
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
            text(hasTime ? value : emptyValue, {
                x: theme.width - layout.padding - 20,
                y: centerY + 7,
                size: 19,
                weight: 900,
                fill: hasTime ? theme.accent : theme.dim,
                anchor: 'end',
            }),
        );
    });

    body.push(footer(height, { right: `${completed}/${totalTrials} ${noun}` }));

    return { svg: svgDocument(theme.width, height, body.join('')), width: theme.width };
}
