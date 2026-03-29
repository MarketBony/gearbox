
// This file is the Desktop Entry Point.
// It handles Window creation, SQLite connection, and File Watching.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const chokidar = require('chokidar');
const fs = require('fs');

// --- DATABASE SETUP ---
const dbPath = path.join(app.getPath('userData'), 'gearbox.db');
const db = new Database(dbPath);

// Initialize Tables
// Note: tasks and service are stored as JSON strings for flexibility
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT,
    site TEXT,
    service TEXT,
    status TEXT,
    startDate TEXT,
    endDate TEXT,
    budgetPlanned REAL,
    budgetActual REAL,
    description TEXT,
    progress INTEGER,
    tasks TEXT
    -- New columns added via migration below if missing
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    firstName TEXT,
    lastName TEXT,
    email TEXT,
    phone TEXT,
    site TEXT,
    service TEXT,
    type TEXT,
    rgpdConsent INTEGER,
    tags TEXT, -- JSON string
    lastContactDate TEXT
  );
  CREATE TABLE IF NOT EXISTS digital_tags (
    id TEXT PRIMARY KEY,
    networks TEXT,
    co2 TEXT
  );
  -- Add other tables (campaigns, expenses) here...
`);

// --- MIGRATIONS (Simple check) ---
try {
  db.prepare('ALTER TABLE projects ADD COLUMN brands TEXT').run();
} catch (e) { /* Column likely exists */ }
try {
  db.prepare('ALTER TABLE projects ADD COLUMN projectType TEXT').run();
} catch (e) { /* Column likely exists */ }


// --- WINDOW MANAGEMENT ---
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // In dev: load localhost. In prod: load index.html
  // mainWindow.loadURL('http://localhost:5173'); 
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  setupFileWatcher();
});

// --- IPC HANDLERS (CRUD) ---

// Generic Load
ipcMain.handle('load-data', (event, table) => {
  try {
    const stmt = db.prepare(`SELECT * FROM ${table}`);
    const rows = stmt.all();
    // Parse JSON fields
    if (table === 'contacts') {
        return rows.map(r => ({...r, tags: JSON.parse(r.tags || '[]'), rgpdConsent: !!r.rgpdConsent}));
    }
    if (table === 'projects') {
        return rows.map(r => {
            let service = [];
            let brands = [];
            try { service = JSON.parse(r.service || '[]') } catch { service = [r.service].filter(Boolean) }
            try { brands = JSON.parse(r.brands || '[]') } catch { brands = [] }
            
            return {
                ...r, 
                tasks: JSON.parse(r.tasks || '[]'),
                service: service,
                brands: brands
            };
        });
    }
    if (table === 'digital_tags') {
        return rows.map(r => ({
            networks: JSON.parse(r.networks || '[]'),
            co2: JSON.parse(r.co2 || '[]')
        }));
    }
    return rows;
  } catch (err) {
    console.error(err);
    return [];
  }
});

// Generic Save (Upsert)
ipcMain.handle('save-data', (event, table, dataArray) => {
    const insert = db.transaction((items) => {
        if (table === 'projects') {
            const stmt = db.prepare(`INSERT OR REPLACE INTO projects (id, name, site, service, brands, projectType, status, startDate, endDate, budgetPlanned, budgetActual, description, progress, tasks) VALUES (@id, @name, @site, @service, @brands, @projectType, @status, @startDate, @endDate, @budgetPlanned, @budgetActual, @description, @progress, @tasks)`);
            for (const item of items) {
                stmt.run({
                    ...item, 
                    tasks: JSON.stringify(item.tasks || []),
                    service: JSON.stringify(item.service || []),
                    brands: JSON.stringify(item.brands || []) // Serialize brands array
                });
            }
        }
        else if (table === 'contacts') {
             const stmt = db.prepare(`INSERT OR REPLACE INTO contacts (id, firstName, lastName, email, phone, site, service, type, rgpdConsent, tags, lastContactDate) VALUES (@id, @firstName, @lastName, @email, @phone, @site, @service, @type, @rgpdConsent, @tags, @lastContactDate)`);
             for (const item of items) {
                 stmt.run({
                     ...item,
                     tags: JSON.stringify(item.tags || []),
                     rgpdConsent: item.rgpdConsent ? 1 : 0
                 });
             }
        }
        else if (table === 'digital_tags') {
             const stmt = db.prepare(`INSERT OR REPLACE INTO digital_tags (id, networks, co2) VALUES (@id, @networks, @co2)`);
             for (const item of items) {
                 // Tag object doesn't have an ID usually, we use a singleton 'config' ID or ensure it's passed
                 stmt.run({
                     id: 'config', 
                     networks: JSON.stringify(item.networks || []),
                     co2: JSON.stringify(item.co2 || [])
                 });
             }
        }
    });
    insert(dataArray);
});

// --- FILE WATCHER ---
function setupFileWatcher() {
    const watchPath = path.join(app.getPath('documents'), 'Gearbox_Inbox');
    if (!fs.existsSync(watchPath)) fs.mkdirSync(watchPath, { recursive: true });

    const watcher = chokidar.watch(watchPath, {
        persistent: true,
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: true
    });

    watcher.on('add', (filePath) => {
        console.log('File detected:', filePath);
        if (mainWindow) {
            mainWindow.webContents.send('file-detected', filePath);
        }
    });
}
