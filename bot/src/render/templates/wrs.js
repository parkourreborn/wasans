import { formatAge, formatDate, formatDays, formatDelta, formatTime, nameText, numText } from '../card.js';
import { fit, styles, text, theme } from '../theme.js';
import { renderListCard } from './list.js';

const trialColumn = {
    label: 'Trial',
    width: 200,
    cell: (row, box) => {
        const style = { family: 'display', weight: 700, size: 19, letterSpacing: 0.6, upper: true };
        return text(fit(row.trial, style, box.w), { x: box.x, y: box.baseline, fill: row.retired ? theme.subtle : theme.text, ...style });
    },
};

// Every trial's current record. Rows: { trial, holder, time, date, retired }.
export function renderWrsCard({ rows, meta, footerRight }) {
    return renderListCard({
        eyebrow: 'Wasans · World records',
        title: 'World records',
        meta,
        columns: [
            trialColumn,
            { label: 'Holder', flex: true, cell: (row, box) => nameText(row.holder, box, { size: 16 }).svg },
            { label: 'Standing', width: 90, align: 'right', cell: (row, box) => numText(formatAge(row.date), box, { fill: theme.subtle, size: 14, weight: 400 }) },
            { label: 'Time', width: 110, align: 'right', cell: (row, box) => numText(formatTime(row.time), box, { weight: 600, fill: theme.gold }) },
        ],
        rows,
        emptyMessage: 'No world records yet.',
        footerRight,
    });
}

// One trial's chain of records, newest first. Rows:
// { date, holder, time, improvement, stoodDays, current }.
export function renderWrHistoryCard({ trial, rows, meta, footerRight }) {
    return renderListCard({
        eyebrow: 'World record history',
        title: trial,
        meta,
        columns: [
            { label: 'Set', width: 110, cell: (row, box) => text(formatDate(row.date), { x: box.x, y: box.baseline, fill: theme.muted, ...styles.body(14, 400) }) },
            { label: 'Holder', flex: true, cell: (row, box) => nameText(row.holder, box, { size: 16 }).svg },
            {
                label: 'Improvement',
                width: 110,
                align: 'right',
                cell: (row, box) => numText(row.improvement === null ? 'First' : formatDelta(row.improvement), box, { fill: theme.subtle, size: 14, weight: 400 }),
            },
            {
                label: 'Stood',
                width: 90,
                align: 'right',
                cell: (row, box) => numText(row.current ? `${formatDays(row.stoodDays)}+` : formatDays(row.stoodDays), box, { fill: theme.subtle, size: 14, weight: 400 }),
            },
            {
                label: 'Time',
                width: 100,
                align: 'right',
                cell: (row, box) => numText(formatTime(row.time), box, { weight: 600, fill: row.current ? theme.gold : theme.text }),
            },
        ],
        rows,
        emptyMessage: 'No approved runs on this trial yet.',
        footerRight,
    });
}
