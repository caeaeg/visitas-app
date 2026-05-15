const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building", required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  user: { type: String }, // Guardamos el nombre o ID del predicador que hizo la visita
  date: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ["ATENDIO", "NO_EN_CASA", "OCUPADO", "REVISITAR"], // Estandarizamos estados
    required: true 
  },
  note: String
}, { timestamps: true }); // Nos da automáticamente createdAt y updatedAt

module.exports = mongoose.model("Visit", visitSchema);
