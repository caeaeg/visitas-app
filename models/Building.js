const mongoose = require("mongoose");

const buildingSchema = new mongoose.Schema({
  code: String,
  address: String
});

module.exports = mongoose.model("Building", buildingSchema);
