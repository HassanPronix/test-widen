// appendErrorRow.js
const AssetError = require("../model/asset.model");
const {connectDB} = require('../config/connectDB')


async function appendErrorRow(row) {
  await connectDB()
  const normalized = {
    id: row.id || "",
    fileId: row.fileId || "",
    reason: row.reason || "",
    message: row.message || "",
    status: row.status || "",
    fileSize: row.fileSize ?? "",
  };

  try {
    const doc = new AssetError(normalized);
    // console.log(doc)
    await doc.save();
    // optional: console.log("Logged error to MongoDB:", normalized.id);
  } catch (err) {
    console.error("Failed to append to MongoDB:", err);
  }
}

module.exports = { appendErrorRow };
