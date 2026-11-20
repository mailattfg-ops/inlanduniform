const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'specifications.json');

const INITIAL_SPECS = [
    { id: 1, item_id: 5, code: 'A', name: 'Half Sleeve', description: 'Standard half sleeve shirt', display_order: 1 },
    { id: 2, item_id: 5, code: 'B', name: 'Full Sleeve', description: 'Standard full sleeve shirt', display_order: 2 },
    { id: 3, item_id: 5, code: 'C', name: 'Sleeveless', description: 'Sleeveless shirt', display_order: 3 },
    { id: 4, item_id: 6, code: 'A', name: 'Half Sleeve', description: 'Cotton half sleeve', display_order: 1 },
    { id: 5, item_id: 6, code: 'B', name: 'Full Sleeve', description: 'Cotton full sleeve', display_order: 2 },
    { id: 6, item_id: 7, code: 'A', name: 'Full Length Pleated', description: 'Pleated formal trousers', display_order: 1 },
    { id: 7, item_id: 7, code: 'B', name: 'Flat Front', description: 'Flat front trousers', display_order: 2 },
    { id: 8, item_id: 7, code: 'C', name: 'Shorts', description: 'Bermuda / school shorts', display_order: 3 },
    { id: 9, item_id: 8, code: 'A', name: 'Single Breasted', description: 'Single breasted blazer', display_order: 1 },
    { id: 10, item_id: 8, code: 'B', name: 'Double Breasted', description: 'Double breasted blazer', display_order: 2 },
    { id: 11, item_id: 9, code: 'A', name: 'Pleated', description: 'Pleated skirt', display_order: 1 },
    { id: 12, item_id: 9, code: 'B', name: 'Straight Fit', description: 'Straight skirt', display_order: 2 }
];

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_SPECS, null, 2), 'utf8');
    }
}

function readSpecs() {
    ensureFile();
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return [...INITIAL_SPECS];
    }
}

function writeSpecs(specs) {
    ensureFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(specs, null, 2), 'utf8');
}

exports.list = (itemId = null) => {
    const specs = readSpecs();
    let filtered = specs;
    if (itemId !== null && itemId !== undefined && itemId !== '') {
        const targetId = Number(itemId);
        filtered = specs.filter(s => Number(s.item_id) === targetId);
    }
    return filtered.sort((a, b) => {
        if ((a.display_order ?? 0) !== (b.display_order ?? 0)) {
            return (a.display_order ?? 0) - (b.display_order ?? 0);
        }
        return String(a.code || '').localeCompare(String(b.code || ''));
    });
};

exports.getById = (id) => {
    const specs = readSpecs();
    return specs.find(s => String(s.id) === String(id)) || null;
};

exports.create = ({ itemId, code, name, description, display_order }) => {
    const specs = readSpecs();
    const cleanCode = String(code).trim().toUpperCase();
    const cleanName = String(name).trim();
    const targetItemId = Number(itemId);

    // Check duplicate code for this item
    const duplicate = specs.find(s => Number(s.item_id) === targetItemId && String(s.code).toUpperCase() === cleanCode);
    if (duplicate) {
        const err = new Error(`Specification code '${cleanCode}' already exists for this item`);
        err.code = '23505';
        throw err;
    }

    let maxId = 100;
    specs.forEach(s => {
        const n = Number(s.id);
        if (!isNaN(n) && n > maxId) maxId = n;
    });

    const newRecord = {
        id: maxId + 1,
        item_id: targetItemId,
        code: cleanCode,
        name: cleanName,
        description: description ? String(description).trim() : null,
        display_order: display_order !== undefined && display_order !== null && !isNaN(Number(display_order)) ? Number(display_order) : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    specs.push(newRecord);
    writeSpecs(specs);
    return newRecord;
};

exports.update = (id, { code, name, description, display_order }) => {
    const specs = readSpecs();
    const index = specs.findIndex(s => String(s.id) === String(id));
    if (index === -1) {
        const err = new Error('Specification not found');
        err.status = 404;
        throw err;
    }

    const current = specs[index];
    const cleanCode = code ? String(code).trim().toUpperCase() : current.code;
    const cleanName = name ? String(name).trim() : current.name;

    // Check duplicate code
    if (cleanCode !== current.code) {
        const duplicate = specs.find(s => String(s.id) !== String(id) && Number(s.item_id) === Number(current.item_id) && String(s.code).toUpperCase() === cleanCode);
        if (duplicate) {
            const err = new Error(`Specification code '${cleanCode}' already exists for this item`);
            err.code = '23505';
            throw err;
        }
    }

    const updated = {
        ...current,
        code: cleanCode,
        name: cleanName,
        description: description !== undefined ? (description ? String(description).trim() : null) : current.description,
        display_order: display_order !== undefined ? Number(display_order) : current.display_order,
        updated_at: new Date().toISOString()
    };

    specs[index] = updated;
    writeSpecs(specs);
    return updated;
};

exports.delete = (id) => {
    const specs = readSpecs();
    const filtered = specs.filter(s => String(s.id) !== String(id));
    if (filtered.length !== specs.length) {
        writeSpecs(filtered);
        return true;
    }
    return false;
};
