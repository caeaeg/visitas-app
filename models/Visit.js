const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema({
  // Conexión obligatoria con el edificio visitado
  buildingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Building", 
    required: true 
  },
  
  // Relación opcional con el departamento específico
  departmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Department" 
  },
  
  // Nombre del predicador que hizo la visita
  user: { 
    type: String 
  },
  
  // Fecha de la visita
  date: { 
    type: Date, 
    default: Date.now 
  },
  
  // Estado estandarizado de cómo le fue
  status: { 
    type: String, 
    enum: ["ATENDIO", "NO_EN_CASA", "OCUPADO", "REVISITAR"], 
    required: true 
  },
  
  // Notas que deja el predicador
  note: { 
    type: String 
  }
}, { 
  timestamps: true // Esto nos da automáticamente createdAt y updatedAt
});

// Cierre definitivo y protegido
module.exports = mongoose.models.Visit || mongoose.model("Visit", visitSchema);
