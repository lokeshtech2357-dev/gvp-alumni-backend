const OfficialAlumniRecord = require('../models/OfficialAlumniRecord');
const OfficialAlumniCounter = require('../models/OfficialAlumniCounter');

const sequenceKey = 'official-alumni-record';

module.exports = async (count) => {
  if (!Number.isInteger(count) || count < 1) return [];
  const existingCounter = await OfficialAlumniCounter.exists({ _id: sequenceKey });
  if (!existingCounter) {
    const [existingCount, maximum] = await Promise.all([
      OfficialAlumniRecord.countDocuments(),
      OfficialAlumniRecord.findOne({ recordId: { $exists: true } }).sort({ recordId: -1 }).select('recordId').lean(),
    ]);
    const initialSequence = Math.max(existingCount, maximum?.recordId || 0);
    try {
      await OfficialAlumniCounter.findOneAndUpdate(
        { _id: sequenceKey },
        { $max: { sequence: initialSequence } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      await OfficialAlumniCounter.updateOne({ _id: sequenceKey }, { $max: { sequence: initialSequence } });
    }
  }
  const counter = await OfficialAlumniCounter.findOneAndUpdate(
    { _id: sequenceKey },
    { $inc: { sequence: count } },
    { new: true },
  );
  return Array.from({ length: count }, (_, index) => counter.sequence - count + index + 1);
};
