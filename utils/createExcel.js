const XLSX = require("xlsx");
const path = require("path");

const EXCEL_PATH = path.join("/tmp/asset_errors.xlsx");

function createExcelFile(errors) {
    const worksheet = XLSX.utils.json_to_sheet(errors);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Errors");
    XLSX.writeFile(workbook, EXCEL_PATH);

    return EXCEL_PATH;
}

module.exports = { createExcelFile }