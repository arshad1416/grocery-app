const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const UPDATES_FILE = path.join(DATA_DIR, 'encrypted-updates.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAllUpdates() {
  try {
    if (fs.existsSync(UPDATES_FILE)) {
      return JSON.parse(fs.readFileSync(UPDATES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[encrypted-store] Failed to load updates:', err.message);
  }
  return {};
}

function saveAllUpdates(data) {
  try {
    fs.writeFileSync(UPDATES_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[encrypted-store] Failed to save updates:', err.message);
  }
}

function getUpdates(familyId, listId) {
  const data = loadAllUpdates();
  const familyData = data[familyId] || {};
  return familyData[listId] || [];
}

function getAllUpdates(familyId) {
  const data = loadAllUpdates();
  return data[familyId] || {};
}

function addUpdate(familyId, listId, update) {
  const data = loadAllUpdates();
  if (!data[familyId]) {
    data[familyId] = {};
  }
  if (!data[familyId][listId]) {
    data[familyId][listId] = [];
  }
  
  // Validate update structure
  if (!update || typeof update.ciphertext !== 'string' || typeof update.iv !== 'string' || typeof update.tag !== 'string') {
    throw new Error('Invalid update payload format. Expected { ciphertext, iv, tag }');
  }
  
  data[familyId][listId].push(update);
  saveAllUpdates(data);
  return data[familyId][listId];
}

module.exports = {
  getUpdates,
  getAllUpdates,
  addUpdate
};
