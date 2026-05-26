const Issue = require("./models/Issue");
const Building = require("./models/Building");
const Department = require("./models/Department");
const Visit = require("./models/Visit");
const express = require("express");
const {
  auth,
  requireRole,
  requireLogin
} = require("./auth");
const mongoose = require("mongoose");
const app = express();

app.use(express.json());
app.use(express.static("public"));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 Conectado a MongoDB"))
  .catch(err => console.log("❌ Error Mongo:", err.message));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor listo en puerto " + PORT);
});

app.post("/login", auth);

// 🔹 NEXT (Optimizado)
app.get(
  "/next/:buildingId",
  requireLogin,
  requireRole(["admin", "conductor", "predi"]),
  async (req, res) => {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const visits = await Visit.find({
        status: "ATENDIO",
        date: { $gte: sixMonthsAgo }
      });
      const blockedIds = visits.map(v => v.departmentId.toString());
      
      const departments = await Department.find({
        buildingId: req.params.buildingId,
        _id: { $nin: blockedIds }
      });
      
      if (!departments.length) {
        return res.json({ message: "NO_AVAILABLE" });
      }
      
      const dept = departments[Math.floor(Math.random() * departments.length)];
      const lastVisit = await Visit.findOne({ departmentId: dept._id }).sort({ date: -1 });
      
      res.json({ dept, lastVisit });
    } catch (err) {
      res.status(500).send("Error en NEXT");
    }
  }
);

// 🔹 ADMIN BUILDINGS (Actualizado)
app.get("/admin/buildings", requireLogin, requireRole(["admin", "conductor"]), async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const { territory, sort, search } = req.query; // Agregamos search

    let filter = {};
    if (territory) filter.territory = territory;
    // Si hay búsqueda, filtramos por dirección (case insensitive)
    if (search) filter.address = new RegExp(search, "i");

    let query = Building.find(filter);

    // Lógica de ordenamiento
    if (sort === "territory") query = query.sort({ territory: 1 });
    else if (sort === "recent") query = query.sort({ createdAt: -1 }); // "Recién agregados"
    else query = query.sort({ address: 1 });

    const buildings = await query.skip(skip).limit(limit);
    const total = await Building.countDocuments(filter);

    res.json({
      data: buildings,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).send("Error obteniendo edificios");
  }
});

// 🔹 BUSCAR BUILDING
app.get(
  "/building/:query",
  requireLogin,
  requireRole(["admin", "conductor", "predi"]),
  async (req, res) => {
    try {
      const query = req.params.query.trim().toLowerCase();
      const building = await Building.findOne({
        $or: [
          { code: new RegExp("^" + query + "$", "i") },
          { address: new RegExp(query, "i") }
        ]
      });
      if (!building) return res.json({ error: "NOT_FOUND" });
      res.json(building);
    } catch (err) {
      res.status(500).send("Error buscando edificio");
    }
  }
);

// 🔹 CREAR BUILDING (Arreglado el bug de pisos y preparado para Leaflet con lat/lng)
// 🔹 CREAR BUILDING (Arreglado: Ahora guarda address2, name y description sin perder datos)
app.post(
  "/building",
  requireLogin,
  requireRole(["admin", "conductor", "predi"]),
  async (req, res) => {
    try {
      // 🕵️‍♂️ AGREGADOS: address2, name, description al desempaquetar el req.body
      let { 
        address, 
        address2, 
        name, 
        description, 
        floors, 
        unitsPerFloor, 
        hasGroundFloor, 
        hasDoorman, 
        latitude, 
        longitude, 
        territory 
      } = req.body;

      if (!address || !floors || !unitsPerFloor) {
        return res.status(400).json({ error: "DATOS_INCOMPLETOS" });
      }
      
      floors = Number(floors);
      unitsPerFloor = Number(unitsPerFloor);
      if (floors <= 0 || unitsPerFloor <= 0) {
        return res.status(400).json({ error: "DATOS_INVALIDOS" });
      }
      
      const normalizedAddress = address.trim().toLowerCase();
      const existing = await Building.findOne({ address: normalizedAddress });
      if (existing) {
        return res.json({ message: "EXISTS", building: existing });
      }
      
      // 📦 Guardamos el edificio pasando absolutamente todos los campos a MongoDB
      const building = new Building({
        code: normalizedAddress,
        address: normalizedAddress,
        address2: address2 ? address2.trim() : "", // ⬅️ Guardado seguro
        name: name ? name.trim() : "",             // ⬅️ Guardado seguro
        description: description ? description.trim() : "", // ⬅️ Guardado seguro
        floors,
        unitsPerFloor,
        hasGroundFloor,
        hasDoorman,
        territory,
        latitude: latitude || null, // Para Leaflet
        longitude: longitude || null // Para Leaflet
      });
      await building.save();
      
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      
      // Corrección matemática: Si tiene PB, los pisos van de 1 a (floors - 1) para respetar el total de pisos reales.
      let startFloor = hasGroundFloor ? 0 : 1;
      let endFloor = hasGroundFloor ? floors - 1 : floors;
      
      for (let f = startFloor; f <= endFloor; f++) {
        for (let i = 0; i < unitsPerFloor; i++) {
          if (i >= letters.length) continue;
          const number = (f === 0 ? "PB" : f.toString()) + letters[i];
          await Department.create({
            number,
            buildingId: building._id
          });
        }
      }
      res.json({ message: "CREATED", building });
    } catch (err) {
      console.error("Error al crear edificio en backend:", err);
      res.status(500).send("Error creando edificio");
    }
  }
);

// 🔹 VISITA (¡Blindada contra el requerimiento de buildingId!)
app.post(
  "/visit",
  requireLogin,
  requireRole(["admin","conductor","predi"]),
  async (req, res) => {
    try {
      let { departmentId, status, note, buildingId } = req.body;

      // 1. Si viene departmentId pero falta buildingId, lo buscamos en la base de datos
      if (departmentId && !buildingId) {
        const deptoInfo = await Department.findById(departmentId);
        if (deptoInfo) {
          buildingId = deptoInfo.buildingId;
        }
      }

      // 2. Si venía desde el Admin con buildingId pero sin depto, buscamos el primer depto
      if (!departmentId && buildingId) {
        const primerDepto = await Department.findOne({ buildingId });
        if (primerDepto) {
          departmentId = primerDepto._id;
        }
      }

      // 3. Validación final estricta
      if (!departmentId || !status || !buildingId) {
        return res.status(400).send("Datos incompletos: se requiere departamento, edificio y estado.");
      }

      // 4. Creamos la visita asegurándonos de pasarle SÍ O SÍ el buildingId que exige tu modelo
      const visit = new Visit({ 
        departmentId, 
        buildingId, // <--- Esto es lo que hacía explotar a MongoDB
        status, 
        note 
      });

      await visit.save();
      res.json(visit);
    } catch (err) {
      console.error("❌ Error guardando visita en index.js:", err.message);
      res.status(500).send("Error guardando visita: " + err.message);
    }
  }
);

// 🔹 HISTORY (🚀 Ultra optimizado con un solo mapeo en memoria, cero lentitud en la calle)
app.get(
  "/history/:buildingId",
  requireLogin,
  requireRole(["admin", "conductor"]),
  async (req, res) => {
    try {
      const departments = await Department.find({ buildingId: req.params.buildingId });
      if (!departments.length) {
        return res.json({ total: 0, atendidos: 0, noAtendieron: 0, nunca: 0, progreso: 0, detalle: [] });
      }

      const deptIds = departments.map(d => d._id);
      
      // Traemos la última visita de cada departamento de un solo viaje a la base de datos
      const visits = await Visit.aggregate([
        { $match: { departmentId: { $in: deptIds } } },
        { $sort: { date: -1 } },
        { $group: { _id: "$departmentId", lastVisit: { $first: "$$ROOT" } } }
      ]);

      const visitsMap = {};
      visits.forEach(v => { visitsMap[v._id.toString()] = v.lastVisit; });

      let total = departments.length;
      let atendidos = 0;
      let noAtendieron = 0;
      let nunca = 0;
      const detalle = [];

      for (let dept of departments) {
        const lastVisit = visitsMap[dept._id.toString()];
        if (!lastVisit) nunca++;
        else if (lastVisit.status === "ATENDIO") atendidos++;
        else noAtendieron++;

        detalle.push({
          number: dept.number,
          lastStatus: lastVisit?.status,
          lastDate: lastVisit?.date,
          note: lastVisit?.note
        });
      }

      res.json({
        total,
        atendidos,
        noAtendieron,
        nunca,
        progreso: total ? Math.round((atendidos / total) * 100) : 0,
        detalle
      });
    } catch (err) {
      res.status(500).send("Error historial");
    }
  }
);

// 🔹 EDITAR BUILDING (Soporta latitud/longitud para el mapa y normaliza datos)
app.put(
  "/building/:id",
  requireLogin,
  requireRole(["admin", "conductor", "predi"]),
  async (req, res) => {
    try {
      // Clonamos el body para no alterar el objeto original directamente
      const datosActualizados = { ...req.body };

      // 🚨 NORMALIZACIÓN CLAVE: Si modifican la dirección, la pasamos a minúsculas igual que en el POST
      if (datosActualizados.address) {
        datosActualizados.address = datosActualizados.address.trim().toLowerCase();
        datosActualizados.code = datosActualizados.address; // Mantenemos el código sincronizado
      }

      // Aseguramos conversión limpia de tipos de datos antes de enviar a Mongo
      if (datosActualizados.latitude) datosActualizados.latitude = parseFloat(datosActualizados.latitude);
      if (datosActualizados.longitude) datosActualizados.longitude = parseFloat(datosActualizados.longitude);
      if (datosActualizados.territory) datosActualizados.territory = Number(datosActualizados.territory);

      console.log("👉 Datos normalizados listos para guardar:", datosActualizados);

      const actualizado = await Building.findByIdAndUpdate(
        req.params.id, 
        { $set: datosActualizados }, 
        { new: true }
      );
      console.log("💾 Guardado real en MongoDB:", actualizado);
      res.json({ message: "Edificio actualizado", data: actualizado });
    } catch (err) {
      console.error("Error en PUT /building:", err);
      res.status(500).json({ error: "Error actualizando" });
    }
  }
);

// 🔹 TERRITORIO
app.get(
  "/territory/:num",
  requireLogin,
  requireRole(["admin", "conductor", "predi"]),
  async (req, res) => {
    try {
      const buildings = await Building.find({ territory: req.params.num });
      res.json(buildings);
    } catch (err) {
      res.status(500).send("Error en territorio");
    }
  }
);


// 🔹 RUTA UNIFICADA PARA REPORTAR PROBLEMAS (Actualizada y Protegida)
app.post("/issues", requireLogin, async (req, res) => {
  try {
    // Recibimos los campos nuevos que viajan desde el formulario del Frontend
    const { buildingId, departmentId, type, description, reportedBy, status } = req.body;

    // Validación estricta en el Backend: si el id no viene o viene corrupto, respondemos con sutileza
    if (!buildingId || buildingId === "[object Object]") {
      return res.status(400).json({ error: "El ID del edificio enviado no es válido o está vacío." });
    }
    const nuevoIssue = new Issue({
      buildingId,
      departmentId,
      user: req.user?.username || "Predicador", // Usuario logueado en la sesión
      reportedBy: reportedBy || "Anónimo",       // Guarda quién escribió el reporte en el input
      type: type || "Otro",
      description: description,
      status: status || "PENDIENTE"              // Forzamos "PENDIENTE" por defecto si viene vacío
    });
    await nuevoIssue.save();
    res.status(201).json({ message: "Reporte guardado con éxito" });
  } catch (err) {
    // Esto te va a mostrar el error exacto en los logs de Render para que lo puedas auditar
    console.error("❌ Error guardando Issue en Base de Datos:", err.message);
    res.status(500).json({ error: "No se pudo procesar el reporte en la base de datos: " + err.message });
  }
});

app.get(
  "/issues",
  requireLogin,
  requireRole(["admin", "conductor"]),
  async (req, res) => {
    try {
      const { status } = req.query;
      let filter = {};
      if (status) filter.status = status;
      const issues = await Issue.find(filter).populate("buildingId").sort({ createdAt: -1 });
      res.json(issues);
    } catch (err) {
      res.status(500).send("Error listando issues");
    }
  }
);

app.put(
  "/issues/:id",
  requireLogin,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const { status } = req.body;
      await Issue.findByIdAndUpdate(req.params.id, { status });
      res.send("Estado actualizado");
    } catch (err) {
      res.status(500).send("Error actualizando issue");
    }
  }
);
// 🔹 ELIMINAR UN INCIDENTE ESPECÍFICO (Para limpiar reportes rotos o viejos)
app.delete(
  "/issues/:id",
  requireLogin,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const eliminado = await Issue.findByIdAndDelete(id);
      
      if (!eliminado) {
        return res.status(404).send("No se encontró el reporte a eliminar.");
      }
      
      res.send("Reporte eliminado con éxito de la base de datos.");
    } catch (err) {
      console.error("❌ Error en DELETE /issues:", err.message);
      res.status(500).send("Error eliminando el reporte: " + err.message);
    }
  }
);

// 🔹 STATS (Optimizado para bases de datos reales)
app.get(
  "/stats",
  requireLogin,
  requireRole(["admin", "conductor"]),
  async (req, res) => {
    try {
      const buildings = await Building.countDocuments();
      const atendio = await Visit.countDocuments({ status: "ATENDIO" });
      const noCasa = await Visit.countDocuments({ status: "NO_EN_CASA" });
      const totalVisits = await Visit.countDocuments();
      const visitados = await Visit.distinct("departmentId");
      
      res.json({
        totalEdificios: buildings,
        totalVisitas: totalVisits,
        atendio,
        noCasa,
        visitados: visitados.length
      });
    } catch (err) {
      res.status(500).send("Error en estadísticas");
    }
  }
);

// 🔹 BUILDING INFO (Actualizada para inyectar la lista de historial completa)
app.get(
  "/building-info/:id",
  requireLogin,
  requireRole(["admin", "conductor", "predi"]),
  async (req, res) => {
    try {
      const building = await Building.findById(req.params.id);
      if (!building) return res.status(404).send("Edificio no encontrado");

      // Buscamos todos los departamentos y sus IDs para este edificio
      const departments = await Department.find({ buildingId: building._id });
      const deptIds = departments.map(d => d._id);

      // Traemos las visitas asociadas a esos departamentos
      const lastVisit = await Visit.findOne({ departmentId: { $in: deptIds } }).sort({ date: -1 });
      const issue = await Issue.findOne({ buildingId: building._id, status: { $ne: "RESUELTO" } }).sort({ createdAt: -1 });
      
      // 🚀 INYECCIÓN CRUCIAL: Buscamos todas las visitas del edificio para alimentar el botón de Historial
      const rawVisits = await Visit.find({ departmentId: { $in: deptIds } }).sort({ date: -1 }).limit(50);
      
      // Creamos un mapa rápido en memoria para cruzar el ID del depto con su nombre legible (ej: "PB A", "1B")
      const deptoMap = {};
      departments.forEach(d => { deptoMap[d._id.toString()] = d.number; });

      // Transformamos el historial agregándole el número de puerta/departamento para que el Frontend lo renderice lindo
      const history = rawVisits.map(v => ({
        _id: v._id,
        date: v.date,
        status: v.status,
        notes: v.note,
        department: deptoMap[v.departmentId?.toString()] || "-"
      }));

      // Ahora enviamos todo junto de manera segura
      res.json({ building, lastVisit, issue, history });
    } catch (err) {
      console.error("❌ Error en GET /building-info:", err.message);
      res.status(500).send("Error obteniendo info de edificio");
    }
  }
);
