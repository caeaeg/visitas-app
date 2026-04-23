const Building = require("./models/Building");
const Department = require("./models/Department");
const Visit = require("./models/Visit");

const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 Conectado a MongoDB"))
  .catch(err => console.log("❌ Error Mongo:", err.message));

app.get("/", (req, res) => {
  res.send("Servidor funcionando 🚀");
});

app.listen(3000, () => {
  console.log("Servidor listo en puerto 3000");
});
app.get("/next/:buildingId", async (req, res) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const visits = await Visit.find({
    date: { $gte: sixMonthsAgo }
  });

  const visitedDeptIds = visits.map(v => v.departmentId.toString());

  const dept = await Department.findOne({
    buildingId: req.params.buildingId,
    _id: { $nin: visitedDeptIds }
  });

  if (!dept) {
    return res.send("No hay departamentos disponibles");
  }

  res.json(dept);
});
