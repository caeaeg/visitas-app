const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema({
  // Relación con el edificio (Obligatorio)
  buildingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Building", 
    required: true 
  },
  
  // Relación opcional con un departamento (si el problema es en un depto específico)
  departmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Department" 
  },

  // Quién reportó el problema (nombre de usuario)
  user: { type: String },

  // Categoría del problema
  type: { 
    type: String, 
    enum: ["ERROR_DATO", "ACCESO", "DEPARTAMENTO_INEXISTENTE", "OTRO"],
    default: "ERROR_DATO"
  },

  // Explicación detallada
  description: { type: String, required: true },

  // Gestión del administrador
  status: {
    type: String,
    enum: ["PENDIENTE", "EN_PROCESO", "RESUELTO"],
    default: "PENDIENTE"
  },

  // Notas del administrador al resolverlo
  adminNotes: { type: String }

}, { 
  timestamps: true // Esto crea 'createdAt' (fecha de reporte) y 'updatedAt' (fecha de resolución)
});

module.exports = mongoose.model("Issue", issueSchema);
