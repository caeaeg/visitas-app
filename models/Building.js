const mongoose = require("mongoose");

const BuildingSchema = new mongoose.Schema({
  // 🚀 OPTIMIZACIÓN CON ÍNDICES: Acelera las búsquedas en la calle cuando haya muchos datos
  code: { 
    type: String, 
    index: true 
  },
  address: { 
    type: String, 
    index: true 
  },
  address2: String,
  floors: Number,
  unitsPerFloor: Number,
  hasGroundFloor: Boolean,
  hasDoorman: Boolean,
  
  // 🔽 Campos actualizados y nuevos
  territory: { 
    type: Number, 
    index: true // También indexado porque se usa mucho para filtrar en el mapa y listas
  }, 
  name: String,
  description: String,

  // 📍 Coordenadas para el mapa
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


