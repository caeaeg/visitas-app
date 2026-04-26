const mongoose = require("mongoose");

const BuildingSchema = new mongoose.Schema({
  code: String,
  address: String,
  floors: Number,
  unitsPerFloor: Number,
  hasGroundFloor: Boolean,
  hasDoorman: Boolean,

  // 🔽 nuevos campos
  territory: String,
  name: String,
  description: String
});

module.exports = mongoose.model("Building", BuildingSchema);


