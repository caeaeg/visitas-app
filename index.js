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
