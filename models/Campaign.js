const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  goal: {
    type: Number,
    required: true
  },
  amountRaised: {
    type: Number,
    default: 0
  },
  deadline: {
    type: Date,
    required: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  walletAddress: {
    type: String,
    required: true
  },
  campaignId: {
    type: Number,
    required: true
  },
  image: {
    type: String
  },
  documents: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'completed', 'failed'],
    default: 'pending'
  },
  isWithdrawn: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('campaign', CampaignSchema);