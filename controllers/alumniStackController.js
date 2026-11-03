const AlumniStack = require('../models/AlumniStack');

// Mock data for fallback
const mockAlumni = [
  {
    _id: '1',
    name: 'John Doe',
    iappudu: 'John Doe',
    batch: '2020',
    year: '2020',
    company: 'Tech Company',
    position: 'Software Engineer',
    location: 'Bangalore',
    image: '/images/alumni/john.jpg',
    achievements: ['Best Student Award', 'Hackathon Winner'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '2',
    name: 'Jane Smith',
    iappudu: 'Jane Smith',
    batch: '2019',
    year: '2019',
    company: 'Startup Inc',
    position: 'Product Manager',
    location: 'Hyderabad',
    image: '/images/alumni/jane.jpg',
    achievements: ['Leadership Award'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '3',
    name: 'Rahul Kumar',
    iappudu: 'Rahul Kumar',
    batch: '2021',
    year: '2021',
    company: 'Google',
    position: 'Data Scientist',
    location: 'Pune',
    image: '/images/alumni/rahul.jpg',
    achievements: ['Research Excellence', 'AI Innovation'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Get all active alumni stack entries with optional search and filters
exports.getAllAlumniStack = async (req, res) => {
  try {
    const { search, batch, year, company, position, location } = req.query;
    const filter = { isActive: true };

    if (batch) filter.batch = batch;
    if (year) filter.year = year;
    if (company) filter.company = new RegExp(company, 'i');
    if (position) filter.position = new RegExp(position, 'i');
    if (location) filter.location = new RegExp(location, 'i');

    if (search) {
      const text = new RegExp(search, 'i');
      filter.$or = [
        { name: text },
        { iappudu: text },
        { batch: text },
        { year: text },
        { company: text },
        { position: text },
        { location: text }
      ];
    }

    const alumniStack = await AlumniStack.find(filter).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: alumniStack
    });
  } catch (error) {
    console.log('DB error, using mock data:', error.message);
    // Fallback to mock data
    const search = req.query.search || '';
    const batch = req.query.batch || '';
    const year = req.query.year || '';
    const company = req.query.company || '';
    const position = req.query.position || '';
    const location = req.query.location || '';

    const filtered = mockAlumni.filter((alumni) => {
      if (!alumni.isActive) return false;
      const text = `${alumni.name} ${alumni.iappudu} ${alumni.batch} ${alumni.year} ${alumni.company} ${alumni.position} ${alumni.location}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (batch && alumni.batch !== batch) return false;
      if (year && alumni.year !== year) return false;
      if (company && !alumni.company.toLowerCase().includes(company.toLowerCase())) return false;
      if (position && !alumni.position.toLowerCase().includes(position.toLowerCase())) return false;
      if (location && !alumni.location.toLowerCase().includes(location.toLowerCase())) return false;
      return true;
    });

    res.json({
      success: true,
      data: filtered
    });
  }
};

// Get all alumni stack entries (including inactive) for admin
exports.getAllAlumniStackAdmin = async (req, res) => {
  try {
    const alumniStack = await AlumniStack.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: alumniStack
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching alumni stack',
      error: error.message
    });
  }
};

// Get single alumni stack entry by ID
exports.getAlumniStackById = async (req, res) => {
  try {
    const alumniStack = await AlumniStack.findById(req.params.id);
    if (!alumniStack) {
      return res.status(404).json({
        success: false,
        message: 'Alumni stack entry not found'
      });
    }
    res.json({
      success: true,
      data: alumniStack
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching alumni stack entry',
      error: error.message
    });
  }
};

// Create new alumni stack entry
exports.createAlumniStack = async (req, res) => {
  try {
    const alumniStack = new AlumniStack(req.body);
    await alumniStack.save();
    res.status(201).json({
      success: true,
      data: alumniStack,
      message: 'Alumni stack entry created successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating alumni stack entry',
      error: error.message
    });
  }
};

// Update alumni stack entry
exports.updateAlumniStack = async (req, res) => {
  try {
    const alumniStack = await AlumniStack.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!alumniStack) {
      return res.status(404).json({
        success: false,
        message: 'Alumni stack entry not found'
      });
    }
    
    res.json({
      success: true,
      data: alumniStack,
      message: 'Alumni stack entry updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating alumni stack entry',
      error: error.message
    });
  }
};

// Delete alumni stack entry (soft delete by setting isActive to false)
exports.deleteAlumniStack = async (req, res) => {
  try {
    const alumniStack = await AlumniStack.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );
    
    if (!alumniStack) {
      return res.status(404).json({
        success: false,
        message: 'Alumni stack entry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Alumni stack entry deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting alumni stack entry',
      error: error.message
    });
  }
};

// Hard delete alumni stack entry
exports.hardDeleteAlumniStack = async (req, res) => {
  try {
    const alumniStack = await AlumniStack.findByIdAndDelete(req.params.id);
    
    if (!alumniStack) {
      return res.status(404).json({
        success: false,
        message: 'Alumni stack entry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Alumni stack entry permanently deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting alumni stack entry',
      error: error.message
    });
  }
};
