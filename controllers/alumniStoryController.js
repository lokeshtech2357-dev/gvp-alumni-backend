const AlumniStory = require('../models/AlumniStory');

exports.getAllStories = async (req, res) => {
  try {
    const stories = await AlumniStory.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllStoriesAdmin = async (req, res) => {
  try {
    const stories = await AlumniStory.find().sort({ createdAt: -1 });
    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStory = async (req, res) => {
  try {
    const { name, batch, branch, currentRole, company, summary, story, imageUrl, isActive } = req.body;
    const newStory = new AlumniStory({
      name,
      batch,
      branch,
      currentRole,
      company,
      summary,
      story,
      imageUrl,
      isActive: typeof isActive === 'boolean' ? isActive : true,
    });
    await newStory.save();
    res.status(201).json({ success: true, data: newStory, message: 'Story added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStory = async (req, res) => {
  try {
    const { name, batch, branch, currentRole, company, summary, story, imageUrl, isActive } = req.body;
    const updatedStory = await AlumniStory.findByIdAndUpdate(
      req.params.id,
      {
        name,
        batch,
        branch,
        currentRole,
        company,
        summary,
        story,
        imageUrl,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true }
    );

    if (!updatedStory) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    res.json({ success: true, data: updatedStory, message: 'Story updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteStory = async (req, res) => {
  try {
    const story = await AlumniStory.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    story.isActive = false;
    await story.save();
    res.json({ success: true, data: story, message: 'Story archived successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.hardDeleteStory = async (req, res) => {
  try {
    const story = await AlumniStory.findByIdAndDelete(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    res.json({ success: true, data: story, message: 'Story deleted permanently' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
