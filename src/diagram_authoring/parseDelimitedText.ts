/**
 * A small RFC 4180 style reader for the comma-separated files spreadsheets
 * produce.
 *
 * Hand-written rather than pulled from a package because the import only needs
 * three columns, and the whole surface here is quoting, embedded commas,
 * embedded newlines, and the line endings Excel writes.
 */

/** Splits CSV text into rows of raw cell strings, dropping a trailing newline. */
export function parseDelimitedText(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let isInsideQuotes = false;

    // A byte-order mark survives a spreadsheet export and would otherwise become
    // part of the first column name.
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

    const finishCell = () => {
        currentRow.push(currentCell);
        currentCell = '';
    };

    const finishRow = () => {
        finishCell();
        rows.push(currentRow);
        currentRow = [];
    };

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];

        if (isInsideQuotes) {
            if (character === '"') {
                // A doubled quote inside a quoted cell is a literal quote.
                if (source[index + 1] === '"') {
                    currentCell += '"';
                    index += 1;
                } else {
                    isInsideQuotes = false;
                }
            } else {
                currentCell += character;
            }
            continue;
        }

        if (character === '"' && currentCell === '') {
            isInsideQuotes = true;
        } else if (character === ',') {
            finishCell();
        } else if (character === '\r') {
            // Swallow CR so CRLF is one row break.
            if (source[index + 1] === '\n') index += 1;
            finishRow();
        } else if (character === '\n') {
            finishRow();
        } else {
            currentCell += character;
        }
    }

    // Whatever is left is a final row unless the file simply ended with a newline.
    if (currentCell !== '' || currentRow.length > 0) {
        finishRow();
    }

    return rows;
}

/** True when a row holds nothing but empty cells, as blank lines and stray commas do. */
export function isBlankRow(row: string[]): boolean {
    return row.every((cell) => cell.trim() === '');
}

/**
 * Reduces a heading to a comparable key, so `In Flow`, `in-flow`, and `IN_FLOW`
 * all name the same column.
 */
export function normalizeColumnName(columnName: string): string {
    return columnName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
