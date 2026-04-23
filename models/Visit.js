const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema({
  departmentId: mongoose.Schema.Types.ObjectId,
  date: { type: Date, default: Date.now },
  status: String, // "ATENDIO" o "NO_EN_CASA"
  note: String
});

module.exports = mongoose.model("Visit", visitSchema);
