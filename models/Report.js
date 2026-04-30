const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building"
  },
  message: String,
  date: Date,
  resolved: Boolean
});

module.exports = mongoose.model("Report", reportSchema);

