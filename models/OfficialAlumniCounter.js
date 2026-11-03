const mongoose = require('mongoose');

const officialAlumniCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, default: 0 },
});

module.exports = mongoose.model('OfficialAlumniCounter', officialAlumniCounterSchema);
