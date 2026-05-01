const Issue = require("./models/Issue");
const Building = require("./models/Building");
const Department = require("./models/Department");
const Visit = require("./models/Visit");

// 👇 NUEVO MODELO (tenés que crearlo después)
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

  if (departments.length === 0) {
    return res.json({ message: "NO_AVAILABLE" });
  }

  const dept = departments[Math.floor(Math.random() * departments.length)];

  const lastVisit = await Visit.findOne({
    departmentId: dept._id
  }).sort({ date: -1 });

  res.json({ dept, lastVisit });
});


// 🔹 BUSCAR BUILDING
app.get("/building/:query", async (req, res) => {
  const query = req.params.query.trim().toLowerCase();

  const building = await Building.findOne({
    $or: [
      { code: new RegExp("^" + query + "$", "i") },
      { address: new RegExp(query, "i") }
    ]
  });

  if (!building) {
    return res.json({ error: "NOT_FOUND" });
  }

  res.json(building);
});


// 🔹 CREAR BUILDING
app.post("/building", async (req, res) => {
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
});


// 🔹 GUARDAR VISITA
app.post("/visit", async (req, res) => {
  const { departmentId, status, note } = req.body;

  if (!departmentId || !status) {
    return res.status(400).send("Datos incompletos");
  }

  const visit = new Visit({
    departmentId,
    status,
    note
  });

  await visit.save();

  res.json(visit);
});


// 🔹 HISTORY
app.get("/history/:buildingId", async (req, res) => {
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
});


// 🔹 EDITAR VISITA
app.put("/visit/:id", async (req, res) => {
  const { note } = req.body;

  await Visit.findByIdAndUpdate(req.params.id, { note });

  res.send("Visita actualizada");
});


// 🔹 EDITAR BUILDING
app.put("/building/:id", async (req, res) => {

  const {
    address,
    address2,
    territory,
    name,
    description
  } = req.body;

  await Building.findByIdAndUpdate(req.params.id, {
    address,
    address2,
    territory,
    name,
    description
  });

  res.send("Edificio actualizado");
});


// 🔹 BUSCAR PARA EDITAR (ADMIN)
app.get("/admin/search-buildings", async (req, res) => {

  const q = req.query.q;

  if (!q) return res.json([]);

  const buildings = await Building.find({
    $or: [
      { address: new RegExp(q, "i") },
      { territory: new RegExp(q, "i") }
    ]
  }).limit(20);

  res.json(buildings);
});


// 🔹 TERRITORIO
app.get("/territory/:num", async (req, res) => {
  const buildings = await Building.find({
    territory: req.params.num
  });

  res.json(buildings);
});


// 🔹 REPORTAR PROBLEMA
app.post("/report", async (req, res) => {

  const { buildingId, message } = req.body;

  const report = new Report({
    building: buildingId,
    message,
    date: new Date(),
    resolved: false
  });

  await report.save();

  res.send("Reporte enviado");
});


// 🔹 VER REPORTES
app.get("/reports", async (req, res) => {

  const reports = await Report.find()
    .populate("building")
    .sort({ date: -1 });

  res.json(reports);
});


// 🔹 RESOLVER REPORTE
app.put("/report/:id/resolve", async (req, res) => {

  await Report.findByIdAndUpdate(req.params.id, {
    resolved: true
  });

  res.send("Resuelto");
});


// 🔹 IMPORTADOR
app.get("/import-sheet", async (req, res) => {

  try {

    const response = await fetch("https://opensheet.elk.sh/1nTPjRGrYIGb69-u6ficD9pHRQDjMbVauXeW_Q6HyFaU/visitas-app");
    const data = await response.json();

    for (let item of data) {

      const address = item.DIRECCION?.trim();
      const floors = Number(item.FLOORS || 0);
      const unitsPerFloor = Number(item.UNITS || 2);

      if (!address || floors <= 0) continue;

      const exists = await Building.findOne({
        address: address.toLowerCase()
      });

      if (exists) continue;

      const building = new Building({
        code: address.toLowerCase(),
        address: address.toLowerCase(),
        floors,
        unitsPerFloor,
        hasGroundFloor: true,
        hasDoorman: false,
        territory: item.TERRITORY || "",
        name: item.NAME || "",
        description: item.DESCRIPTION || ""
      });

      await building.save();

      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

      for (let f = 0; f <= floors; f++) {
        for (let i = 0; i < unitsPerFloor; i++) {

          if (i >= letters.length) continue;

          const number =
            (f === 0 ? "PB" : f.toString()) + letters[i];

          await Department.create({
            number,
            buildingId: building._id
          });
        }
      }
    }

    res.send("Importación completada 🚀");

  } catch (err) {
    console.error(err);
    res.status(500).send("Error importando");
  }
});
