const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building" },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },

  type: String,
  description: String,

  status: {
    type: String,
    enum: ["PENDIENTE", "EN_PROCESO", "RESUELTO"],
    default: "PENDIENTE"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Issue", issueSchema);

