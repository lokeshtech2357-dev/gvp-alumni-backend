const ContentSection = require('../models/ContentSection');
const mongoose = require('mongoose');

const defaultSections = [
  {
    sectionId: 'overview',
    title: 'Overview',
    body: 'Welcome to Gayatri Grads Association. We are committed to connecting alumni and preserving our heritage through events, engagement and support for current students.',
  },
  {
    sectionId: 'messages',
    title: "Messages by GVP's Chief Patrons",
    body: 'Hear inspiring messages from our chief patrons who guide the association with wisdom and vision for the future.',
  },
  {
    sectionId: 'governing-body',
    title: 'Governing Body',
    body: 'Our governing body is composed of experienced leaders and alumni champions dedicated to transparency, growth, and community support.',
  },
  {
    sectionId: 'heritage-center',
    title: 'GVP Heritage Center',
    body: 'The GVP Heritage Center preserves our history, shares alumni stories, and celebrates achievements across generations.',
  },
];

const isDbConnected = () =>
  mongoose.connection && mongoose.connection.readyState === 1;

async function ensureSections() {
  const count = await ContentSection.countDocuments();
  if (count === 0) {
    await ContentSection.insertMany(defaultSections);
  }
}

exports.getAllSections = async (req, res) => {
  // Fallback: return built-in sections when DB is not available
  if (!isDbConnected()) {
    return res.json({ success: true, data: defaultSections });
  }
  try {
    await ensureSections();
    const sections = await ContentSection.find().sort({ sectionId: 1 });
    res.json({ success: true, data: sections });
  } catch (err) {
    console.log('DB error fetching content sections, using defaults:', err.message);
    return res.json({ success: true, data: defaultSections });
  }
};

exports.getSection = async (req, res) => {
  // Fallback: find section in defaultSections when DB is not available
  if (!isDbConnected()) {
    const section = defaultSections.find(s => s.sectionId === req.params.sectionId);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    return res.json({ success: true, data: section });
  }
  try {
    await ensureSections();
    const section = await ContentSection.findOne({ sectionId: req.params.sectionId });
    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }
    res.json({ success: true, data: section });
  } catch (err) {
    console.log('DB error fetching content section, using defaults:', err.message);
    const section = defaultSections.find(s => s.sectionId === req.params.sectionId);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    return res.json({ success: true, data: section });
  }
};

exports.updateSection = async (req, res) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database not connected. Cannot save changes.' });
  }
  try {
    const { title, body } = req.body;
    const section = await ContentSection.findOneAndUpdate(
      { sectionId: req.params.sectionId },
      { title, body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }

    res.json({ success: true, data: section, message: 'Section updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
