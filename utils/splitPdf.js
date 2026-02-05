const { PDFDocument } = require('pdf-lib');
const {
    DEFAULT_MAX_FILE_SIZE_MB,
} = require("../utils/widenService");
async function splitPdfBySize(pdfBuffer) {
    const MAX_FILE_SIZE_MB = parseInt(
        process.env.MAX_FILE_SIZE_MB || DEFAULT_MAX_FILE_SIZE_MB,
    );
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    console.log('-------splitting pdf pages---------')
    const sourcePdf = await PDFDocument.load(pdfBuffer);
    const totalPages = sourcePdf.getPageCount();

    const chunks = [];
    let currentChunk = await PDFDocument.create();
    let currentSize = 0;
    let chunkIndex = 1;

    for (let i = 0; i < totalPages; i++) {
        const [page] = await currentChunk.copyPages(sourcePdf, [i]);
        currentChunk.addPage(page);

        const tempBytes = await currentChunk.save();
        currentSize = tempBytes.length;

        if (currentSize > MAX_FILE_SIZE_BYTES) {
            // Remove last page
            currentChunk.removePage(currentChunk.getPageCount() - 1);

            // Save previous chunk
            const finalizedChunk = Buffer.from(await currentChunk.save());
            chunks.push({
                buffer: finalizedChunk,
                index: chunkIndex++,
            });

            // Start new chunk with current page
            currentChunk = await PDFDocument.create();
            const [newPage] = await currentChunk.copyPages(sourcePdf, [i]);
            currentChunk.addPage(newPage);
        }
    }

    // Save remaining pages
    if (currentChunk.getPageCount() > 0) {
        const finalChunk = Buffer.from(await currentChunk.save());
        chunks.push({
            buffer: finalChunk,
            index: chunkIndex,
        })
    }

    return chunks;
}

module.exports = { splitPdfBySize }