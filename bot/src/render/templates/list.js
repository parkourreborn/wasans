import { footer, footerHeight, header, table, tableHeight } from '../card.js';
import { svgDocument, theme } from '../theme.js';

// Every table-shaped card: the page header, a hairline table, the footer.
// Templates only describe their columns.
export function renderListCard({ eyebrow, title, meta, subtitle, chips, columns, rows, highlight, emptyMessage, footerRight }) {
    const head = header({ eyebrow, title, meta, subtitle, chips });
    const top = head.bottom + 8;
    const height = top + tableHeight(rows.length) + footerHeight() + 6;
    const body = table({ top, columns, rows, highlight, emptyMessage });

    return {
        svg: svgDocument(theme.width, height, head.svg + body.svg + footer(height, { right: footerRight })),
        width: theme.width,
    };
}
