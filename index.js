const Issue = require("./models/Issue");
const Building = require("./models/Building");
const Department = require("./models/Department");
const Visit = require("./models/Visit");
const Report = require("./models/Report");

const express = require("express");
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


// 🔹 NEXT
app.get("/next/:buildingId", async (req, res) => {
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

    const lastVisit = await Visit.findOne({
      departmentId: dept._id
    }).sort({ date: -1 });

    res.json({ dept, lastVisit });

  } catch (err) {
    res.status(500).send("Error en NEXT");
  }
});

app.get("/admin/buildings", async (req, res) => {

  const page = Number(req.query.page) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;

  const sort = req.query.sort;

  let query = Building.find();

  // 🔽 ORDENAMIENTO
  if (sort === "territory") {
    query = query.sort({ territory: 1 });
  }

  if (sort === "recent") {
    query = query.sort({ updatedAt: -1 });
  }

  // ⚠ "most" lo dejamos simple por ahora
  // después lo podemos hacer pro con conteo real

  const buildings = await query
    .skip(skip)
    .limit(limit);

  const total = await Building.countDocuments();

  res.json({
    data: buildings,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

// 🔹 BUSCAR BUILDING
app.get("/building/:query", async (req, res) => {
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
});


// 🔹 CREAR BUILDING
app.post("/building", async (req, res) => {
  try {
    let { address, floors, unitsPerFloor, hasGroundFloor, hasDoorman } = req.body;

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

    const building = new Building({
      code: normalizedAddress,
      address: normalizedAddress,
      floors,
      unitsPerFloor,
      hasGroundFloor,
      hasDoorman
    });

    await building.save();

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let startFloor = hasGroundFloor ? 0 : 1;

    for (let f = startFloor; f <= floors; f++) {
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
    res.status(500).send("Error creando edificio");
  }
});


// 🔹 VISITA
app.post("/visit", async (req, res) => {
  try {
    const { departmentId, status, note } = req.body;

    if (!departmentId || !status) {
      return res.status(400).send("Datos incompletos");
    }

    const visit = new Visit({ departmentId, status, note });

    await visit.save();

    res.json(visit);

  } catch {
    res.status(500).send("Error guardando visita");
  }
});


// 🔹 HISTORY
app.get("/history/:buildingId", async (req, res) => {
  try {
    const departments = await Department.find({
      buildingId: req.params.buildingId
    });

    let total = departments.length;
    let atendidos = 0;
    let noAtendieron = 0;
    let nunca = 0;

    const detalle = [];

    for (let dept of departments) {
      const lastVisit = await Visit.findOne({
        departmentId: dept._id
      }).sort({ date: -1 });

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

  } catch {
    res.status(500).send("Error historial");
  }
});


// 🔹 EDITAR BUILDING
app.put("/building/:id", async (req, res) => {
  try {
    await Building.findByIdAndUpdate(req.params.id, req.body);
    res.send("Edificio actualizado");
  } catch {
    res.status(500).send("Error actualizando");
  }
});


// 🔹 TERRITORIO
app.get("/territory/:num", async (req, res) => {
  const buildings = await Building.find({
    territory: req.params.num
  });

  res.json(buildings);
});


// 🔹 ISSUES (SISTEMA LIMPIO)
app.post("/issues", async (req, res) => {
  const { buildingId, departmentId, type, description } = req.body;

  if (!buildingId || !type) {
    return res.status(400).send("Datos incompletos");
  }

  const issue = new Issue({
    buildingId,
    departmentId,
    type,
    description
  });

  await issue.save();
  res.json(issue);
});

app.get("/issues", async (req, res) => {

  const { status } = req.query;

  let filter = {};
  if (status) filter.status = status;

  const issues = await Issue.find(filter)
    .populate("buildingId")
    .sort({ createdAt: -1 });

  res.json(issues);
});

app.put("/issues/:id", async (req, res) => {
  const { status } = req.body;

  await Issue.findByIdAndUpdate(req.params.id, { status });

  res.send("Estado actualizado");
});

app.get("/stats", async (req, res) => {

  const buildings = await Building.countDocuments();

  const visits = await Visit.find();

  let atendio = visits.filter(v => v.status === "ATENDIO").length;
  let noCasa = visits.filter(v => v.status === "NO_EN_CASA").length;

  const totalVisits = visits.length;

  const visitados = await Visit.distinct("departmentId");

  res.json({
    totalEdificios: buildings,
    totalVisitas: totalVisits,
    atendio,
    noCasa,
    visitados: visitados.length
  });
});

// 🔹 BUILDING INFO (clave UX)
app.get("/building-info/:id", async (req, res) => {

  const building = await Building.findById(req.params.id);

  const deptIds = await Department.find({ buildingId: building._id }).distinct("_id");

  const lastVisit = await Visit.findOne({
    departmentId: { $in: deptIds }
  }).sort({ date: -1 });

  const issue = await Issue.findOne({
    buildingId: building._id,
    status: { $ne: "RESUELTO" }
  }).sort({ createdAt: -1 });

  res.json({
    building,
    lastVisit,
    issue
  });
});
