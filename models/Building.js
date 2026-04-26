const mongoose = require("mongoose");

const buildingSchema = new mongoose.Schema({
  code: String,
  address: String,
  floors: Number,
  unitsPerFloor: Number,
  hasGroundFloor: Boolean,
  hasDoorman: Boolean
});

module.exports = mongoose.model("Building", buildingSchema);
