const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
  number: String, // Ejemplo: "1A", "402"
  buildingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Building", // Conexión oficial con el modelo Building
    required: true 
  }
});

module.exports = mongoose.model("Department", departmentSchema);
