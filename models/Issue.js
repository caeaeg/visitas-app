const mongoose = require("mongoose");

const IssueSchema = new mongoose.Schema({
  buildingId: String,
  departmentId: String,
  type: String, // ERROR_DATO | ACCESO | OTRO
  description: String,
  status: {
    type: String,
    default: "PENDIENTE" // PENDIENTE | RESUELTO
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Issue", IssueSchema);
