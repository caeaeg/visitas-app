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

// 🔹 NEXT (corregido)
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

// 🔹 TEST DATA
app.get("/test-data", async (req, res) => {
  const building = new Building({
    code: "B1",
    address: "Calle Falsa 123"
  });

  await building.save();

  const dept1 = new Department({
    number: "1A",
    buildingId: building._id
  });

  const dept2 = new Department({
    number: "2B",
    buildingId: building._id
  });

  await dept1.save();
  await dept2.save();

  res.json({ building, dept1, dept2 });
});

// 🔹 GUARDAR VISITA
app.post("/visit", async (req, res) => {
  const { departmentId, status, note } = req.body;

  const visit = new Visit({
    departmentId,
    status,
    note
  });

  await visit.save();

  res.send("Visita guardada");
});

// 🔹 BUSCAR BUILDING
app.post("/building", async (req, res) => {
  const { address, floors, unitsPerFloor, hasGroundFloor, hasDoorman } = req.body;

  // 🔍 buscar si ya existe (por dirección)
  const existing = await Building.findOne({
    address: new RegExp("^" + address + "$", "i")
  });

  if (existing) {
    return res.json({
      message: "EXISTS",
      building: existing
    });
  }

  const building = new Building({
    code: address,
    address,
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

// 🔹 CREAR BUILDING + DEPARTAMENTOS
app.post("/building", async (req, res) => {
  const { address, floors, unitsPerFloor, hasGroundFloor, hasDoorman } = req.body;

  const building = new Building({
    code: address,
    address,
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
      const number =
        (f === 0 ? "PB" : f.toString()) + letters[i];

      const dept = new Department({
        number,
        buildingId: building._id
      });

      await dept.save();
    }
  }

  res.json(building);
});

