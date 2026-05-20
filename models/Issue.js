const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema({
  buildingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Building",
    required: true 
  },
  departmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Department" 
  },
  // ✨ Contexto extra por si se reporta un depto específico (ej: "2B")
  departmentNumber: { 
    type: String 
  },

  type: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  
  // ✨ Guardamos el nombre del predicador que generó el reporte
  reportedBy: { 
    type: String, 
    required: true 
  },

  // ✨ Mantenemos tus enums en mayúsculas para no romper tu base de datos actual
  status: {
    type: String,
    enum: ["PENDIENTE", "EN_PROCESO", "RESUELTO"],
    default: "PENDIENTE"
  },

  // 🕒 Esto registra automáticamente la fecha y hora exacta del reporte
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.Issue || mongoose.model("Issue", issueSchema);
