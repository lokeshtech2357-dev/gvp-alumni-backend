const Subscriber = require('../models/Subscriber');

exports.createSubscriber = async (req, res) => {
  try {
    const { email, name, source } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const existed = await Subscriber.findOne({ email: email.toLowerCase().trim() });
    if (existed) return res.status(200).json({ success: true, data: existed, message: 'Already subscribed' });

    const sub = new Subscriber({ email: email.toLowerCase().trim(), name, source, confirmed: true });
    await sub.save();
    res.status(201).json({ success: true, data: sub, message: 'Subscribed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllSubscribers = async (req, res) => {
  try {
    const list = await Subscriber.find().sort({ subscribedAt: -1 });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteSubscriber = async (req, res) => {
  try {
    const sub = await Subscriber.findByIdAndDelete(req.params.id);
    if (!sub) return res.status(404).json({ success: false, message: 'Subscriber not found' });
    res.json({ success: true, data: sub, message: 'Subscriber removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
