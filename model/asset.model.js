// models/AssetError.js
const mongoose = require("mongoose");

const assetErrorSchema = new mongoose.Schema({
  id: { type: String, default: "" },
  fileId: { type: String, default: "" },
  reason: { type: String, default: "" },
  message: { type: String, default: "" },
  status: { type: String, default: "" },
  fileSize: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

// Collection will be "asset_errors" in MongoDB
const AssetError = mongoose.model("AssetError", assetErrorSchema);

module.exports = AssetError;
