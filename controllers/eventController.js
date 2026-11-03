const Event = require('../models/Event');
const Notification = require('../models/Notification');
const { sendMail, getAdminEmail } = require('../utils/mail');

const makeNoticeTitle = (event) => `Upcoming Event: ${event.title}`;
const makeNoticeLink = (event) => `/upcoming-events#${event._id}`;

// Mock data for fallback
const mockEvents = [
  // Removed seeded 'Alumni Meet 2024' per request
  // Tech Workshop removed per user request
  // Cultural Festival removed per user request
];

// Get all active events
exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find({ isActive: true }).sort({ date: 1 });
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.log('DB error, using mock data:', error.message);
    // Fallback to mock data
    res.json({
      success: true,
      data: mockEvents.filter(event => event.isActive)
    });
  }
};

// Get all events (including inactive) for admin
exports.getAllEventsAdmin = async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
};

// Get single event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching event',
      error: error.message
    });
  }
};

// Register for event
exports.registerForEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || !event.isActive) {
      return res.status(404).json({ success: false, message: 'Event not available for registration' });
    }

    const { name, email, phone, organization, message } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required for registration' });
    }

    const eventDate = new Date(event.date);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (eventDate < todayStart) {
      return res.status(400).json({ success: false, message: 'Cannot register for past events' });
    }

    const alreadyRegistered = event.registrations?.some((registration) => registration.email.toLowerCase() === email.toLowerCase());
    if (alreadyRegistered) {
      return res.status(400).json({ success: false, message: 'This email has already registered for the event' });
    }

    if (event.maxParticipants && event.registrations?.length >= event.maxParticipants) {
      return res.status(400).json({ success: false, message: 'This event is fully booked' });
    }

    event.registrations = event.registrations || [];
    const registration = { name, email, phone, organization, message };
    event.registrations.push(registration);
    await event.save();

    const adminSubject = `New registration for ${event.title}`;
    const adminText = `New registration details:\n\nEvent: ${event.title}\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nOrganization: ${organization || 'N/A'}\nMessage:\n${message || 'N/A'}`;
    const adminHtml = `<h2>New Event Registration</h2><p><strong>Event:</strong> ${event.title}</p><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone || 'N/A'}</p><p><strong>Organization:</strong> ${organization || 'N/A'}</p><p><strong>Message:</strong><br/>${(message || 'N/A').replace(/\n/g, '<br/>')}</p>`;

    const visitorSubject = `Your registration is confirmed for ${event.title}`;
    const visitorText = `Hi ${name},\n\nThank you for registering for ${event.title}. We have received your RSVP and will share event details with you soon.\n\nEvent: ${event.title}\nDate: ${new Date(event.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}\nLocation: ${event.location || 'To be confirmed'}\n\nRegards,\nGVP Alumni Team`;
    const visitorHtml = `<p>Hi ${name},</p><p>Thank you for registering for <strong>${event.title}</strong>. We have received your RSVP and will share event details with you soon.</p><p><strong>Event:</strong> ${event.title}<br/><strong>Date:</strong> ${new Date(event.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}<br/><strong>Location:</strong> ${event.location || 'To be confirmed'}</p><p>Regards,<br/>GVP Alumni Team</p>`;

    await Promise.allSettled([
      sendMail({ to: getAdminEmail(), subject: adminSubject, text: adminText, html: adminHtml }),
      sendMail({ to: email, subject: visitorSubject, text: visitorText, html: visitorHtml })
    ]);

    res.status(201).json({ success: true, data: registration, message: 'Registration confirmed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error registering for event', error: error.message });
  }
};

// Get registrations for single event
exports.getEventRegistrations = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({
      success: true,
      data: event.registrations || []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching registrations', error: error.message });
  }
};

// Create new event
exports.createEvent = async (req, res) => {
  try {
    // Server-side validation: prevent creating an active event with a past date
    const payload = { ...req.body };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (payload.isActive && payload.date && new Date(payload.date) < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create an active event with a past date. Use today or a future date, or mark the event inactive.'
      });
    }

    const event = new Event(payload);
    await event.save();

    const eventDate = new Date(event.date);

    if (event.isActive && eventDate >= todayStart) {
      const notice = new Notification({
        title: makeNoticeTitle(event),
        link: makeNoticeLink(event),
        visible: true,
        important: false
      });
      await notice.save();
      event.noticeId = notice._id;
      await event.save();
    }

    res.status(201).json({ success: true, data: event, message: 'Event created successfully' });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating event',
      error: error.message
    });
  }
};

// Update event
exports.updateEvent = async (req, res) => {
  try {
    const oldEvent = await Event.findById(req.params.id);
    if (!oldEvent) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Server-side validation: prevent activating/updating an event to a past date
    const payload = { ...req.body, updatedAt: Date.now() };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (payload.isActive && payload.date && new Date(payload.date) < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate or update event to a past date. Use today or a future date, or mark the event inactive.'
      });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    const eventDate = new Date(event.date);

    if (event.isActive && eventDate >= todayStart) {
      const noticeData = {
        title: makeNoticeTitle(event),
        link: makeNoticeLink(event),
        visible: true
      };

      if (event.noticeId) {
        await Notification.findByIdAndUpdate(event.noticeId, noticeData, { new: true });
      } else {
        const notice = new Notification({ ...noticeData, important: false });
        await notice.save();
        event.noticeId = notice._id;
        await event.save();
      }
    } else if (event.noticeId) {
      await Notification.findByIdAndUpdate(event.noticeId, { visible: false });
    }

    res.json({
      success: true,
      data: event,
      message: 'Event updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating event',
      error: error.message
    });
  }
};

// Delete event (soft delete by setting isActive to false)
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.noticeId) {
      await Notification.findByIdAndUpdate(event.noticeId, { visible: false });
    }
    
    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting event',
      error: error.message
    });
  }
};

// Hard delete event
exports.hardDeleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.noticeId) {
      await Notification.findByIdAndDelete(event.noticeId);
    }
    
    res.json({
      success: true,
      message: 'Event permanently deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting event',
      error: error.message
    });
  }
};
