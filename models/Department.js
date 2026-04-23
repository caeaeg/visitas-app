const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
  number: String,
  buildingId: mongoose.Schema.Types.ObjectId
});

module.exports = mongoose.model("Department", departmentSchema);
