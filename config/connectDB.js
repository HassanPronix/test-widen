// db.js
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI; // replace with your URI

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");
  }
}

module.exports = connectDB;
