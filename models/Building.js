const mongoose = require("mongoose");

const BuildingSchema = new mongoose.Schema({
  code: String,
  address: String,
  address2: String,
  floors: Number,
  unitsPerFloor: Number,
  hasGroundFloor: Boolean,
  hasDoorman: Boolean,
  
  // 🔽 Campos actualizados y nuevos
  territory: Number, // Lo cambiamos a Number para que el filtro por número funcione bien
  name: String,
  description: String,

  // 📍 Coordenadas para el mapa (¡Esto es lo que faltaba!)
  latitude: {
    type: Number,
    default: null
  },
  longitude: {
    type: Number,
    default: null
  }
}, { 
  timestamps: true // Esto añade automáticamente createdAt y updatedAt (útil para el filtro de "Recién agregados")
});

module.exports = mongoose.models.Building || mongoose.model("Building", BuildingSchema);


