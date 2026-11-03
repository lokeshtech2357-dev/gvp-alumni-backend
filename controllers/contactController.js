const Contact = require('../models/Contact');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { sendMail, getAdminEmail } = require('../utils/mail');

const getFallbackFile = () => path.join(__dirname, '..', 'data', 'contacts-fallback.json');
const isLocalFallbackAllowed = () => process.env.NODE_ENV !== 'production';

const readFallbackContacts = () => {
  const fallbackFile = getFallbackFile();
  if (!fs.existsSync(fallbackFile)) return [];
  return JSON.parse(fs.readFileSync(fallbackFile, 'utf8') || '[]');
};

const saveFallbackContact = (contact) => {
  const fallbackFile = getFallbackFile();
  const fallbackDir = path.dirname(fallbackFile);
  if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });

  const now = new Date();
  const savedContact = {
    ...contact.toObject(),
    _id: new mongoose.Types.ObjectId().toString(),
    isRead: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const fallback = readFallbackContacts();
  fallback.unshift(savedContact);
  fs.writeFileSync(fallbackFile, JSON.stringify(fallback, null, 2), 'utf8');
  return savedContact;
};

// Get all active contacts
exports.getAllContacts = async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    if (!isLocalFallbackAllowed()) {
      return res.status(503).json({ success: false, message: 'Database unavailable.' });
    }
    try {
      return res.json({ success: true, data: readFallbackContacts().filter((contact) => contact.isActive) });
    } catch (error) {
      console.error('Unable to read local contact fallback:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to load contacts.' });
    }
  }

  try {
    const contacts = await Contact.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Unable to load contacts:', error.message);
    return res.status(503).json({ success: false, message: 'Database unavailable.' });
  }
};

// Get all contacts (including inactive) for admin
exports.getAllContactsAdmin = async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    if (!isLocalFallbackAllowed()) {
      return res.status(503).json({ success: false, message: 'Database unavailable.' });
    }
    try {
      return res.json({ success: true, data: readFallbackContacts() });
    } catch (error) {
      console.error('Unable to read local contact fallback:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to load contacts.' });
    }
  }

  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Unable to load admin contacts:', error.message);
    return res.status(503).json({ success: false, message: 'Database unavailable.' });
  }
};

// Get single contact by ID
exports.getContactById = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contact',
      error: error.message
    });
  }
};

// Create new contact
exports.createContact = async (req, res) => {
  const contact = new Contact(req.body);
  const validationError = contact.validateSync();
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError.message });
  }

  if (mongoose.connection.readyState !== 1) {
    if (!isLocalFallbackAllowed()) {
      return res.status(503).json({ success: false, message: 'Database unavailable; the message was not saved.' });
    }
    try {
      const savedContact = saveFallbackContact(contact);
      await Promise.allSettled([
        sendMail({
          to: getAdminEmail(),
          subject: `New contact message from ${savedContact.name}`,
          text: `New message received:\n\nName: ${savedContact.name}\nEmail: ${savedContact.email}\nPhone: ${savedContact.phone}\nSubject: ${savedContact.subject}\nType: ${savedContact.type}\n\nMessage:\n${savedContact.message}`,
        }),
        sendMail({
          to: savedContact.email,
          subject: 'Thank you for contacting GVP Alumni',
          text: `Hi ${savedContact.name},\n\nThank you for reaching out to Gayatri Vidya Parishad Alumni. We have received your message and will get back to you soon.\n\nYour message:\n${savedContact.message}\n\nRegards,\nGVP Alumni Team`,
        }),
      ]);
      return res.status(201).json({
        success: true,
        data: savedContact,
        message: 'Contact submitted (saved to local fallback storage).',
      });
    } catch (error) {
      console.error('Local contact fallback failed:', error.message);
      return res.status(500).json({ success: false, message: 'Unable to save the contact message.' });
    }
  }

  try {
    await contact.save();

    const adminSubject = `New contact message from ${contact.name}`;
    const adminText = `New message received:\n\nName: ${contact.name}\nEmail: ${contact.email}\nPhone: ${contact.phone}\nSubject: ${contact.subject}\nType: ${contact.type}\n\nMessage:\n${contact.message}`;
    const adminHtml = `<h2>New Contact Submission</h2><p><strong>Name:</strong> ${contact.name}</p><p><strong>Email:</strong> ${contact.email}</p><p><strong>Phone:</strong> ${contact.phone}</p><p><strong>Subject:</strong> ${contact.subject}</p><p><strong>Type:</strong> ${contact.type}</p><p><strong>Message:</strong><br/>${contact.message.replace(/\n/g, '<br/>')}</p>`;

    const visitorSubject = `Thank you for contacting GVP Alumni`;
    const visitorText = `Hi ${contact.name},\n\nThank you for reaching out to Gayatri Vidya Parishad Alumni. We have received your message and will get back to you soon.\n\nYour message:\n${contact.message}\n\nRegards,\nGVP Alumni Team`;
    const visitorHtml = `<p>Hi ${contact.name},</p><p>Thank you for reaching out to Gayatri Vidya Parishad Alumni. We have received your message and will get back to you soon.</p><p><strong>Your message:</strong><br/>${contact.message.replace(/\n/g, '<br/>')}</p><p>Regards,<br/>GVP Alumni Team</p>`;

    await Promise.allSettled([
      sendMail({ to: getAdminEmail(), subject: adminSubject, text: adminText, html: adminHtml }),
      sendMail({ to: contact.email, subject: visitorSubject, text: visitorText, html: visitorHtml })
    ]);

    return res.status(201).json({
      success: true,
      data: contact,
      message: 'Contact submitted successfully'
    });
  } catch (error) {
    if (!isLocalFallbackAllowed()) {
      console.error('Unable to save contact submission:', error.message);
      return res.status(503).json({ success: false, message: 'Database unavailable; the message was not saved.' });
    }

    try {
      const newContact = saveFallbackContact(contact);

      await Promise.allSettled([
        sendMail({
          to: getAdminEmail(),
          subject: `New contact message from ${newContact.name}`,
          text: `New message received:\n\nName: ${newContact.name}\nEmail: ${newContact.email}\nPhone: ${newContact.phone}\nSubject: ${newContact.subject}\nType: ${newContact.type}\n\nMessage:\n${newContact.message}`,
          html: `<h2>New Contact Submission</h2><p><strong>Name:</strong> ${newContact.name}</p><p><strong>Email:</strong> ${newContact.email}</p><p><strong>Phone:</strong> ${newContact.phone}</p><p><strong>Subject:</strong> ${newContact.subject}</p><p><strong>Type:</strong> ${newContact.type}</p><p><strong>Message:</strong><br/>${newContact.message.replace(/\n/g, '<br/>')}</p>`
        }),
        sendMail({
          to: newContact.email,
          subject: `Thank you for contacting GVP Alumni`,
          text: `Hi ${newContact.name},\n\nThank you for reaching out to Gayatri Vidya Parishad Alumni. We have received your message and will get back to you soon.\n\nYour message:\n${newContact.message}\n\nRegards,\nGVP Alumni Team`,
          html: `<p>Hi ${newContact.name},</p><p>Thank you for reaching out to Gayatri Vidya Parishad Alumni. We have received your message and will get back to you soon.</p><p><strong>Your message:</strong><br/>${newContact.message.replace(/\n/g, '<br/>')}</p><p>Regards,<br/>GVP Alumni Team</p>`
        })
      ]);

      return res.status(201).json({
        success: true,
        data: newContact,
        message: 'Contact submitted (saved to local fallback storage)'
      });
    } catch (fsErr) {
      console.error('Fallback storage failed:', fsErr.message);
      return res.status(500).json({
        success: false,
        message: 'Error submitting contact',
        error: error.message
      });
    }
  }
};

// Update contact
exports.updateContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    
    res.json({
      success: true,
      data: contact,
      message: 'Contact updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating contact',
      error: error.message
    });
  }
};

// Delete contact (soft delete by setting isActive to false)
exports.deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting contact',
      error: error.message
    });
  }
};

// Hard delete contact
exports.hardDeleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Contact permanently deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting contact',
      error: error.message
    });
  }
};
