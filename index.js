const Building = require("./models/Building");
const Department = require("./models/Department");
const Visit = require("./models/Visit");

const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());
app.use(express.static("public"));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 Conectado a MongoDB"))
  .catch(err => console.log("❌ Error Mongo:", err.message));

app.listen(3000, () => {
  console.log("Servidor listo en puerto 3000");
});


// 🔹 NEXT (lógica principal)
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

  res.json({
    dept,
    lastVisit
  });
});


// 🔹 BUSCAR BUILDING (sin importar mayúsculas)
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


// 🔹 CREAR BUILDING (con validación + anti-duplicado)
app.post("/building", async (req, res) => {
  let { address, floors, unitsPerFloor, hasGroundFloor, hasDoorman } = req.body;

  // 🔒 validaciones básicas
  if (!address || !floors || !unitsPerFloor) {
    return res.status(400).json({ error: "DATOS_INCOMPLETOS" });
  }

  floors = Number(floors);
  unitsPerFloor = Number(unitsPerFloor);

  if (floors <= 0 || unitsPerFloor <= 0) {
    return res.status(400).json({ error: "DATOS_INVALIDOS" });
  }

  // 🔤 normalizar dirección
  const normalizedAddress = address.trim().toLowerCase();

  // 🔍 evitar duplicados
  const existing = await Building.findOne({
    address: normalizedAddress
  });

  if (existing) {
    return res.json({
      message: "EXISTS",
      building: existing
    });
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

      if (i >= letters.length) continue; // límite seguridad

      const number =
        (f === 0 ? "PB" : f.toString()) + letters[i];

      const dept = new Department({
        number,
        buildingId: building._id
      });

      await dept.save();
    }
  }

  res.json({
    message: "CREATED",
    building
  });
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

  res.send("Visita guardada");
});


// 🔹 TEST RÁPIDO (opcional)
app.get("/ping", (req, res) => {
  res.send("pong");
});

// parte de admin
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

    if (!lastVisit) {
      nunca++;
    } else if (lastVisit.status === "ATENDIO") {
      atendidos++;
    } else {
      noAtendieron++;
    }

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

  const result = [];

  for (let dept of departments) {
    const lastVisit = await Visit.findOne({
      departmentId: dept._id
    }).sort({ date: -1 });

    result.push({
      number: dept.number,
      lastStatus: lastVisit?.status,
      lastDate: lastVisit?.date,
      note: lastVisit?.note
    });
  }

  res.json(result);
});

