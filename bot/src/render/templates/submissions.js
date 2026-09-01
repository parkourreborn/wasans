import { cardHeight, emptyState, footer, header, layout, rowPanel, rowY, stateDot } from '../card.js';
import { fitText, pill, svgDocument, text, theme } from '../theme.js';

// A submission row leads with a state dot so pending/denied entries are
// scannable at a glance, then trial, player, and the time on the right.
const DOT_X = layout.padding + 26;
const TRIAL_X = layout.padding + 48;
const TRIAL_COLUMN = 200;
const TIME_COLUMN = 150;

export function renderSubmissionsCard({
    player = null,
    submissions = [],
    page = 1,
    totalPages = 1,
    total = null,
}) {
    const height = cardHeight(submissions.length);
    const playerX = TRIAL_X + TRIAL_COLUMN;
    const playerLimit = theme.width - layout.padding - TIME_COLUMN - playerX - 90;

    const body = [
        header({
            eyebrow: 'WASANS',
            title: player ? `${player}'s Submissions` : 'Recent Submissions',
            subtitle: player ? 'Newest runs first' : 'The newest runs across every player',
            badge: `Page ${page}/${totalPages}`,
        }),
    ];

    if (submissions.length === 0) {
        body.push(emptyState(player ? 'No submissions found for this player.' : 'No submissions found.'));
    }

    submissions.forEach((submission, index) => {
        const centerY = rowY(index) + layout.rowHeight / 2;
        const color = stateDot(submission.state);

        body.push(rowPanel(index));
        body.push(`<circle cx="${DOT_X}" cy="${centerY}" r="5" fill="${color}" />`);
        body.push(
            text(fitText(submission.trial, 18, TRIAL_COLUMN - 20, 700), {
                x: TRIAL_X,
                y: centerY + 6,
                size: 18,
                weight: 700,
                fill: theme.text,
            }),
        );
        body.push(
            text(fitText(submission.player, 16, playerLimit, 500), {
                x: playerX,
                y: centerY + 6,
                size: 16,
                weight: 500,
                fill: theme.muted,
            }),
        );
        body.push(
            pill(String(submission.state).toUpperCase(), {
                x: theme.width - layout.padding - TIME_COLUMN + 10,
                y: centerY - 11,
                anchor: 'end',
                height: 22,
                size: 10,
                paddingX: 10,
                fill: theme.panelStrong,
                stroke: theme.panelBorder,
                color,
            }),
        );
        body.push(
            text(submission.time, {
                x: theme.width - layout.padding - 20,
                y: centerY + 7,
                size: 18,
                weight: 900,
                fill: theme.accent,
                anchor: 'end',
            }),
        );
    });

    body.push(footer(height, { right: total === null ? null : `${total} submission${total === 1 ? '' : 's'}` }));

    return { svg: svgDocument(theme.width, height, body.join('')), width: theme.width };
}
