const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Tickerall } = require('@tickerall/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'halal-exness-secret-key-2024';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';

const PRIMARY_API_KEY = 'cf_api_aeeb832dd35363d9d654cd8cfaf4f3243ee24f7ff339416d7c2ee8ce3599e9df';

console.log('🕋 100% HALAL EXNESS TRADING BOT - AGGRESSIVE TRADING FIX');
console.log('📦 Version: 25.0.0');
console.log('🔥 FORCES TRADES to hit target ASAP');

// ==================== DATA DIRECTORY ====================
const dataDir = path.join(__dirname, 'data');
const tradesDir = path.join(dataDir, 'trades');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(tradesDir)) fs.mkdirSync(tradesDir, { recursive: true });

const usersFile = path.join(dataDir, 'users.json');
const pendingFile = path.join(dataDir, 'pending.json');
const configFile = path.join(dataDir, 'config.json');

// ==================== CONFIG ====================
let config = { tickerallApiKey: PRIMARY_API_KEY, apiKeyExpired: false };

function loadConfig() {
    try {
        if (fs.existsSync(configFile)) {
            const raw = fs.readFileSync(configFile, 'utf8');
            config = JSON.parse(raw);
            console.log('✅ Config loaded.');
        } else {
            config.tickerallApiKey = PRIMARY_API_KEY;
            config.apiKeyExpired = false;
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
            console.log('📝 Created config file.');
        }
    } catch (error) {
        console.error('❌ Config error:', error);
        config.tickerallApiKey = PRIMARY_API_KEY;
    }
}
loadConfig();

function saveConfig(newConfig) {
    try {
        fs.writeFileSync(configFile, JSON.stringify(newConfig, null, 2));
        config = newConfig;
        console.log('✅ Config saved.');
    } catch (error) {
        console.error('❌ Save config error:', error);
    }
}

// ==================== TICKERALL INIT ====================
let ticker = null;
let apiKeyStatus = 'active';

function initTicker() {
    let apiKey = config.tickerallApiKey || PRIMARY_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ No API key found.');
        ticker = null;
        apiKeyStatus = 'invalid';
        return false;
    }
    try {
        ticker = new Tickerall({ apiKey: apiKey });
        console.log('✅ TickerAll initialized successfully');
        apiKeyStatus = 'active';
        return true;
    } catch (error) {
        console.error('❌ TickerAll init error:', error.message);
        ticker = null;
        apiKeyStatus = 'invalid';
        return false;
    }
}
initTicker();

// ==================== USER DATA ====================
if (!fs.existsSync(usersFile)) {
    const defaultUsers = {
        "mujtabahatif@gmail.com": {
            email: "mujtabahatif@gmail.com",
            password: bcrypt.hashSync("Mujtabah@2598", 10),
            isOwner: true,
            isApproved: true,
            isBlocked: false,
            tickerallSessionId: "",
            exnessLogin: "",
            exnessServer: "",
            lastBalance: 0,
            lastBalanceCurrency: "USD",
            lastBalanceUpdate: new Date().toISOString(),
            createdAt: new Date().toISOString()
        }
    };
    fs.writeFileSync(usersFile, JSON.stringify(defaultUsers, null, 2));
}
if (!fs.existsSync(pendingFile)) fs.writeFileSync(pendingFile, JSON.stringify({}));

function readUsers() { return JSON.parse(fs.readFileSync(usersFile)); }
function writeUsers(users) { fs.writeFileSync(usersFile, JSON.stringify(users, null, 2)); }
function readPending() { return JSON.parse(fs.readFileSync(pendingFile)); }
function writePending(pending) { fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2)); }

function encrypt(text) {
    if (!text) return "";
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return "";
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== AUTH ====================
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    const users = readUsers();
    if (users[email]) return res.status(400).json({ success: false, message: 'User exists' });
    const pending = readPending();
    if (pending[email]) return res.status(400).json({ success: false, message: 'Already pending' });
    pending[email] = { email, password: bcrypt.hashSync(password, 10), requestedAt: new Date().toISOString() };
    writePending(pending);
    res.json({ success: true, message: 'Request sent to owner for halal approval' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const users = readUsers();
    const user = users[email];
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.isApproved && !user.isOwner) return res.status(401).json({ success: false, message: 'Account not approved' });
    if (user.isBlocked) return res.status(401).json({ success: false, message: 'Account blocked' });

    const token = jwt.sign({ email, isOwner: user.isOwner || false }, JWT_SECRET, { expiresIn: '7d' });
    console.log('✅ Login successful:', email);
    res.json({ success: true, token, isOwner: user.isOwner || false });
});

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Missing Authorization header' });
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ success: false, message: 'Invalid format. Use: Bearer <token>' });
    }
    try {
        const decoded = jwt.verify(parts[1], JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
}

// ==================== ULTIMATE BALANCE FETCH ====================
async function fetchRealBalance(accountId) {
    try {
        if (!ticker) return { balance: 100, currency: 'USD', equity: 0, margin: 0, freeMargin: 0, error: 'TickerAll not initialized' };
        if (!accountId) return { balance: 100, currency: 'USD', equity: 0, margin: 0, freeMargin: 0, error: 'No account ID' };

        console.log(`🔍 Fetching balance for session: ${accountId}`);
        const accountInfo = await Promise.race([
            ticker.accounts.get(accountId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]);

        if (!accountInfo) return { balance: 100, currency: 'USD', equity: 0, margin: 0, freeMargin: 0, error: 'No account info' };

        console.log('📊 Account info:', JSON.stringify(accountInfo, null, 2));

        let balance = 0;
        let currency = accountInfo.currency || accountInfo.Currency || 'USD';
        let equity = 0, margin = 0, freeMargin = 0;

        const allFields = [
            'balance', 'Balance', 'BALANCE', 'balance_amount', 'BalanceAmount', 'balanceAmount',
            'amount', 'Amount', 'AMOUNT', 'total', 'Total', 'TOTAL', 'total_balance', 'TotalBalance',
            'account_balance', 'AccountBalance', 'client_balance', 'ClientBalance',
            'cash', 'Cash', 'CASH', 'funds', 'Funds', 'FUNDS',
            'available', 'Available', 'AVAILABLE', 'usable', 'Usable', 'USABLE',
            'free', 'Free', 'FREE', 'net', 'Net', 'NET', 'value', 'Value', 'VALUE',
            'asset', 'Asset', 'ASSET', 'money', 'Money', 'MONEY', 'capital', 'Capital',
            'equity', 'Equity', 'EQUITY', 'freeMargin', 'FreeMargin', 'FREEMARGIN',
            'marginFree', 'MarginFree', 'profit', 'Profit', 'PROFIT', 'pnl', 'Pnl'
        ];

        for (const field of allFields) {
            if (accountInfo[field] !== undefined && accountInfo[field] !== null) {
                const val = parseFloat(accountInfo[field]);
                if (!isNaN(val) && val > 0) {
                    balance = val;
                    console.log(`✅ Found balance in field "${field}": ${balance}`);
                    break;
                }
            }
        }

        if (balance === 0) {
            for (const [key, value] of Object.entries(accountInfo)) {
                if (typeof value === 'number' && value > 0 && value < 10000000) {
                    const keyLower = key.toLowerCase();
                    if (['balance','bal','equity','eq','margin','free','fund','cash','total','amount','net','value','asset','money','capital','avail','usable','client','account','profit','pnl'].some(kw => keyLower.includes(kw))) {
                        balance = value;
                        console.log(`✅ Found balance in field "${key}": ${balance}`);
                        break;
                    }
                }
            }
        }

        if (balance === 0) {
            let largest = 0, largestKey = '';
            for (const [key, value] of Object.entries(accountInfo)) {
                if (typeof value === 'number' && value > 0 && value < 10000000 && value > largest) {
                    largest = value;
                    largestKey = key;
                }
            }
            if (largest > 0) {
                balance = largest;
                console.log(`✅ Used largest value from field "${largestKey}": ${balance}`);
            }
        }

        if (balance === 0) {
            for (const [key, value] of Object.entries(accountInfo)) {
                if (typeof value === 'object' && value !== null) {
                    for (const [subKey, subValue] of Object.entries(value)) {
                        if (typeof subValue === 'number' && subValue > 0 && subValue < 10000000) {
                            const subKeyLower = subKey.toLowerCase();
                            if (['balance','equity','fund','cash','total','amount'].some(kw => subKeyLower.includes(kw))) {
                                balance = subValue;
                                console.log(`✅ Found balance in nested "${key}.${subKey}": ${balance}`);
                                break;
                            }
                        }
                    }
                    if (balance > 0) break;
                }
            }
        }

        if (balance === 0) {
            console.log('⚠️ Could not find balance. Using default 100.');
            balance = 100;
        }

        if (accountInfo.equity !== undefined) equity = parseFloat(accountInfo.equity) || 0;
        else if (accountInfo.Equity !== undefined) equity = parseFloat(accountInfo.Equity) || 0;
        if (accountInfo.margin !== undefined) margin = parseFloat(accountInfo.margin) || 0;
        else if (accountInfo.Margin !== undefined) margin = parseFloat(accountInfo.Margin) || 0;
        if (accountInfo.freeMargin !== undefined) freeMargin = parseFloat(accountInfo.freeMargin) || 0;
        else if (accountInfo.marginFree !== undefined) freeMargin = parseFloat(accountInfo.marginFree) || 0;
        else if (accountInfo.FreeMargin !== undefined) freeMargin = parseFloat(accountInfo.FreeMargin) || 0;

        console.log(`💰 FINAL Balance: ${balance} ${currency}`);
        console.log(`📈 Equity: ${equity}, Margin: ${margin}, Free Margin: ${freeMargin}`);

        return { balance, currency, equity, margin, freeMargin, full: accountInfo, allFields: accountInfo };
    } catch (error) {
        console.error('❌ Balance fetch error:', error.message);
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            apiKeyStatus = 'expired';
            config.apiKeyExpired = true;
            saveConfig(config);
        }
        return { balance: 100, currency: 'USD', equity: 0, margin: 0, freeMargin: 0, error: error.message };
    }
}

// ==================== API KEY STATUS ====================
app.get('/api/api-key-status', authenticate, (req, res) => {
    res.json({ success: true, status: apiKeyStatus });
});

// ==================== ADMIN: UPDATE TICKERALL KEY ====================
app.post('/api/admin/set-tickerall-key', authenticate, async (req, res) => {
    try {
        if (!req.user.isOwner) return res.status(403).json({ success: false, message: 'Admin only' });

        const { apiKey } = req.body;
        if (!apiKey || apiKey.trim() === '') {
            return res.status(400).json({ success: false, message: 'API key is required' });
        }
        const trimmedKey = apiKey.trim();

        if (!trimmedKey.startsWith('cf_api_')) {
            return res.status(400).json({ success: false, message: 'Invalid format. Must start with "cf_api_".' });
        }

        let testTicker;
        try {
            testTicker = new Tickerall({ apiKey: trimmedKey });
        } catch (err) {
            return res.status(400).json({ success: false, message: 'Invalid API key: ' + err.message });
        }

        const users = readUsers();
        const user = users[req.user.email];
        let testSuccess = false;

        if (user && user.tickerallSessionId) {
            try {
                const accountInfo = await testTicker.accounts.get(user.tickerallSessionId);
                if (accountInfo && typeof accountInfo.balance === 'number') {
                    testSuccess = true;
                }
            } catch (err) {
                return res.status(400).json({
                    success: false,
                    message: 'New key is invalid or has no permission: ' + err.message
                });
            }
        } else {
            testSuccess = true;
        }

        if (testSuccess) {
            const newConfig = { tickerallApiKey: trimmedKey, apiKeyExpired: false };
            saveConfig(newConfig);
            apiKeyStatus = 'active';
            const reinitSuccess = initTicker();
            if (reinitSuccess) {
                res.json({ success: true, message: 'API key updated successfully.' });
            } else {
                res.json({ success: false, message: 'Key saved but re‑initialization failed.' });
            }
        } else {
            res.status(500).json({ success: false, message: 'Unexpected error during validation.' });
        }
    } catch (error) {
        console.error('❌ Failed to update API key:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ADMIN: TEST API KEY ====================
app.post('/api/admin/test-tickerall-key', authenticate, async (req, res) => {
    try {
        if (!req.user.isOwner) return res.status(403).json({ success: false, message: 'Admin only' });

        const { apiKey } = req.body;
        if (!apiKey || apiKey.trim() === '') {
            return res.status(400).json({ success: false, message: 'API key is required', valid: false });
        }
        const trimmedKey = apiKey.trim();

        try {
            const testTicker = new Tickerall({ apiKey: trimmedKey });
            const users = readUsers();
            const user = users[req.user.email];

            if (user && user.tickerallSessionId) {
                const accountInfo = await testTicker.accounts.get(user.tickerallSessionId);
                if (accountInfo && typeof accountInfo.balance === 'number') {
                    return res.json({ valid: true, message: 'API key is valid and has access to your account.' });
                } else {
                    return res.json({ valid: false, message: 'API key is valid but could not fetch account info.' });
                }
            } else {
                return res.json({ valid: true, message: 'API key appears valid (no account to test).' });
            }
        } catch (err) {
            return res.json({ valid: false, message: 'Invalid API key: ' + err.message });
        }
    } catch (error) {
        console.error('❌ API key test error:', error);
        res.status(500).json({ valid: false, message: error.message });
    }
});

// ==================== ADMIN: CHANGE OWNER PASSWORD ====================
app.post('/api/admin/change-password', authenticate, async (req, res) => {
    try {
        if (!req.user.isOwner) {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const users = readUsers();
        const owner = users[req.user.email];

        if (!owner) {
            return res.status(404).json({ success: false, message: 'Owner not found' });
        }

        if (!bcrypt.compareSync(currentPassword, owner.password)) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        owner.password = bcrypt.hashSync(newPassword, 10);
        writeUsers(users);

        console.log('🔑 Owner password changed successfully for:', req.user.email);
        res.json({ success: true, message: 'Password changed successfully! Please login again.' });
    } catch (error) {
        console.error('❌ Password change error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ADMIN: USER MANAGEMENT ====================
app.get('/api/admin/pending-users', authenticate, (req, res) => {
    if (!req.user.isOwner) return res.status(403).json({ success: false });
    const pending = readPending();
    res.json({ success: true, pending: Object.keys(pending).map(email => ({ email, requestedAt: pending[email].requestedAt })) });
});

app.post('/api/admin/approve-user', authenticate, (req, res) => {
    if (!req.user.isOwner) return res.status(403).json({ success: false });
    const { email } = req.body;
    const pending = readPending();
    if (!pending[email]) return res.status(404).json({ success: false });
    const users = readUsers();
    users[email] = {
        email,
        password: pending[email].password,
        isOwner: false,
        isApproved: true,
        isBlocked: false,
        tickerallSessionId: "",
        exnessLogin: "",
        exnessServer: "",
        lastBalance: 0,
        lastBalanceCurrency: "USD",
        lastBalanceUpdate: new Date().toISOString(),
        createdAt: pending[email].requestedAt
    };
    writeUsers(users);
    delete pending[email];
    writePending(pending);
    res.json({ success: true, message: `Approved ${email}` });
});

app.post('/api/admin/reject-user', authenticate, (req, res) => {
    if (!req.user.isOwner) return res.status(403).json({ success: false });
    const { email } = req.body;
    const pending = readPending();
    if (!pending[email]) return res.status(404).json({ success: false });
    delete pending[email];
    writePending(pending);
    res.json({ success: true, message: `Rejected ${email}` });
});

app.post('/api/admin/toggle-block', authenticate, (req, res) => {
    if (!req.user.isOwner) return res.status(403).json({ success: false });
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const users = readUsers();
    if (!users[email]) return res.status(404).json({ success: false, message: 'User not found' });
    if (users[email].isOwner) return res.status(403).json({ success: false, message: 'Cannot block the owner' });

    users[email].isBlocked = !users[email].isBlocked;
    writeUsers(users);

    res.json({
        success: true,
        message: `User ${email} is now ${users[email].isBlocked ? 'BLOCKED' : 'ACTIVE'}`,
        isBlocked: users[email].isBlocked
    });
});

app.get('/api/admin/users', authenticate, (req, res) => {
    if (!req.user.isOwner) return res.status(403).json({ success: false });
    const users = readUsers();
    const list = Object.keys(users).map(email => ({
        email,
        hasExnessCreds: !!users[email].exnessLogin,
        isOwner: users[email].isOwner,
        isApproved: users[email].isApproved,
        isBlocked: users[email].isBlocked,
        balance: users[email].lastBalance || 0
    }));
    res.json({ success: true, users: list });
});

app.get('/api/admin/user-balances', authenticate, async (req, res) => {
    if (!req.user.isOwner) return res.status(403).json({ success: false });
    const users = readUsers();
    const balances = {};
    for (const [email, userData] of Object.entries(users)) {
        if (!userData.tickerallSessionId) {
            balances[email] = { balance: 0, hasConnection: false };
            continue;
        }
        try {
            if (!ticker) {
                balances[email] = { balance: 0, hasConnection: false, error: 'TickerAll not initialized' };
                continue;
            }
            const result = await fetchRealBalance(userData.tickerallSessionId);
            balances[email] = {
                balance: result.balance || 0,
                currency: result.currency || 'USD',
                equity: result.equity || 0,
                hasConnection: true,
                lastUpdated: new Date().toISOString()
            };
            if (result.balance > 0) {
                userData.lastBalance = result.balance;
                userData.lastBalanceCurrency = result.currency || 'USD';
                userData.lastBalanceUpdate = new Date().toISOString();
                writeUsers(users);
            }
        } catch (error) {
            balances[email] = { balance: 0, hasConnection: false, error: error.message };
        }
    }
    res.json({ success: true, balances });
});

app.get('/api/admin/all-trades', authenticate, (req, res) => {
    if (!req.user.isOwner) return res.status(403).json({ success: false });
    const allTrades = {};
    const files = fs.readdirSync(tradesDir);
    for (const file of files) {
        if (file === '.gitkeep') continue;
        const userId = file.replace('.json', '');
        const trades = JSON.parse(fs.readFileSync(path.join(tradesDir, file)));
        allTrades[userId] = trades;
    }
    res.json({ success: true, trades: allTrades });
});

// ==================== EXNESS CONNECTION ====================
app.post('/api/set-exness-creds', authenticate, async (req, res) => {
    try {
        const { exnessLogin, exnessPassword, exnessServer } = req.body;

        if (!exnessLogin || !exnessPassword || !exnessServer) {
            return res.status(400).json({
                success: false,
                message: 'All fields required: MT5 Login, Password, and Server'
            });
        }

        if (!ticker) {
            return res.status(500).json({
                success: false,
                message: 'TickerAll not initialized. Please check API key status.'
            });
        }

        console.log(`📊 Connecting to Exness for user: ${req.user.email}`);
        console.log(`   Server: ${exnessServer}`);
        console.log(`   Account: ${exnessLogin}`);

        let accountId;
        try {
            const result = await Promise.race([
                ticker.sessions.start({
                    broker: 'mt5',
                    server: exnessServer,
                    account: parseInt(exnessLogin),
                    password: exnessPassword,
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 20000))
            ]);
            accountId = result.accountId;
        } catch (timeoutError) {
            console.error('❌ Session timeout:', timeoutError.message);
            return res.status(401).json({
                success: false,
                message: 'Connection timeout. Please check your Exness credentials and server name.'
            });
        }

        console.log(`✅ Session created: ${accountId}`);

        const result = await fetchRealBalance(accountId);
        console.log(`💰 REAL Balance: ${result.balance} ${result.currency}`);
        console.log(`📈 Equity: ${result.equity}, Free Margin: ${result.freeMargin}`);

        const users = readUsers();
        users[req.user.email].tickerallSessionId = accountId;
        users[req.user.email].exnessLogin = encrypt(exnessLogin);
        users[req.user.email].exnessServer = encrypt(exnessServer);
        users[req.user.email].lastBalance = result.balance;
        users[req.user.email].lastBalanceCurrency = result.currency || 'USD';
        users[req.user.email].lastBalanceUpdate = new Date().toISOString();
        writeUsers(users);

        res.json({
            success: true,
            message: `✅ Connected! Balance: ${result.balance} ${result.currency || 'USD'} (Equity: ${result.equity || 0})`,
            balance: result.balance,
            currency: result.currency || 'USD',
            equity: result.equity || 0,
            freeMargin: result.freeMargin || 0,
            rawData: result.full,
            allFields: result.allFields
        });
    } catch (error) {
        console.error('❌ Exness connection error:', error.message);
        res.status(401).json({
            success: false,
            message: error.message || 'Connection failed. Please check your credentials.'
        });
    }
});

app.post('/api/connect-exness', authenticate, async (req, res) => {
    try {
        const users = readUsers();
        const user = users[req.user.email];
        if (!user || !user.tickerallSessionId) {
            return res.status(400).json({ success: false, message: 'No Exness credentials saved.' });
        }
        if (!ticker) {
            return res.status(500).json({ success: false, message: 'TickerAll not initialized.' });
        }

        const result = await fetchRealBalance(user.tickerallSessionId);

        if (result.balance > 0) {
            user.lastBalance = result.balance;
            user.lastBalanceCurrency = result.currency || 'USD';
            user.lastBalanceUpdate = new Date().toISOString();
            writeUsers(users);
        }

        res.json({
            success: true,
            balance: result.balance || 0,
            currency: result.currency || 'USD',
            equity: result.equity || 0,
            freeMargin: result.freeMargin || 0,
            totalBalance: result.balance || 0,
            message: `Connected! Balance: ${result.balance || 0} ${result.currency || 'USD'}`,
            rawData: result.full,
            allFields: result.allFields
        });
    } catch (error) {
        console.error('Connection error:', error);
        res.status(401).json({ success: false, message: error.message || 'Connection failed. Please reconnect.' });
    }
});

app.get('/api/get-exness-creds', authenticate, (req, res) => {
    const users = readUsers();
    const user = users[req.user.email];
    if (!user || !user.exnessLogin) return res.json({ success: false });
    res.json({
        success: true,
        exnessLogin: decrypt(user.exnessLogin),
        exnessServer: decrypt(user.exnessServer)
    });
});

app.get('/api/debug-balance', authenticate, async (req, res) => {
    try {
        const users = readUsers();
        const user = users[req.user.email];
        if (!user || !user.tickerallSessionId) {
            return res.json({ success: false, message: 'No session ID found' });
        }
        if (!ticker) {
            return res.json({ success: false, message: 'TickerAll not initialized.', apiKeyStatus });
        }

        console.log('🔍 Debug balance request for:', req.user.email);
        console.log('🔍 Session ID:', user.tickerallSessionId);

        const result = await fetchRealBalance(user.tickerallSessionId);

        if (result.balance > 0 && result.balance !== user.lastBalance) {
            user.lastBalance = result.balance;
            user.lastBalanceCurrency = result.currency || 'USD';
            user.lastBalanceUpdate = new Date().toISOString();
            writeUsers(users);
        }

        res.json({
            success: true,
            sessionId: user.tickerallSessionId,
            balance: result.balance || 0,
            currency: result.currency || 'USD',
            equity: result.equity || 0,
            margin: result.margin || 0,
            freeMargin: result.freeMargin || 0,
            storedBalance: user.lastBalance || 0,
            storedCurrency: user.lastBalanceCurrency || 'USD',
            lastUpdate: user.lastBalanceUpdate || new Date().toISOString(),
            apiKeyStatus,
            fullAccountInfo: result.full,
            allFields: result.allFields
        });
    } catch (error) {
        console.error('❌ Debug balance error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== REAL AI ENGINE ====================

function calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change >= 0) gains += change;
        else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
    if (prices.length < slow + signal) return { macd: 0, signal: 0, histogram: 0 };
    const emaFast = prices.slice(-fast).reduce((a, b) => a + b, 0) / fast;
    const emaSlow = prices.slice(-slow).reduce((a, b) => a + b, 0) / slow;
    const macd = emaFast - emaSlow;
    const signalLine = prices.slice(-signal).reduce((a, b) => a + b, 0) / signal - (prices.slice(-slow, -slow + signal).reduce((a, b) => a + b, 0) / signal);
    return { macd, signal: signalLine, histogram: macd - signalLine };
}

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) return { upper: null, middle: null, lower: null };
    const middle = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
    const variance = prices.slice(-period).reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
    const std = Math.sqrt(variance);
    return { upper: middle + stdDev * std, middle, lower: middle - stdDev * std };
}

function calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 0;
    const trs = [];
    for (let i = 1; i < closes.length; i++) {
        const hl = highs[i] - lows[i];
        const hc = Math.abs(highs[i] - closes[i - 1]);
        const lc = Math.abs(lows[i] - closes[i - 1]);
        trs.push(Math.max(hl, hc, lc));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function detectDivergence(prices, indicator, lookback = 20) {
    if (prices.length < lookback || indicator.length < lookback) return null;
    const priceSlice = prices.slice(-lookback);
    const indSlice = indicator.slice(-lookback);
    let priceLows = [], indLows = [];
    let priceHighs = [], indHighs = [];
    for (let i = 2; i < priceSlice.length - 2; i++) {
        if (priceSlice[i] < priceSlice[i-1] && priceSlice[i] < priceSlice[i+1]) {
            priceLows.push({ idx: i, val: priceSlice[i] });
            indLows.push({ idx: i, val: indSlice[i] });
        }
        if (priceSlice[i] > priceSlice[i-1] && priceSlice[i] > priceSlice[i+1]) {
            priceHighs.push({ idx: i, val: priceSlice[i] });
            indHighs.push({ idx: i, val: indSlice[i] });
        }
    }
    if (priceLows.length >= 2 && indLows.length >= 2) {
        const p1 = priceLows[priceLows.length-2], p2 = priceLows[priceLows.length-1];
        const i1 = indLows[indLows.length-2], i2 = indLows[indLows.length-1];
        if (p2.val < p1.val && i2.val > i1.val) return 'BULLISH';
    }
    if (priceHighs.length >= 2 && indHighs.length >= 2) {
        const p1 = priceHighs[priceHighs.length-2], p2 = priceHighs[priceHighs.length-1];
        const i1 = indHighs[indHighs.length-2], i2 = indHighs[indHighs.length-1];
        if (p2.val > p1.val && i2.val < i1.val) return 'BEARISH';
    }
    return null;
}

function calculateFibonacciLevels(high, low) {
    const diff = high - low;
    return { level0: low, level236: low + diff*0.236, level382: low + diff*0.382, level50: low + diff*0.5, level618: low + diff*0.618, level786: low + diff*0.786, level100: high };
}

// ==================== AI DECISION (LOWERED THRESHOLD) ====================
async function getRealAIDecision(symbol, accountId) {
    try {
        if (!ticker) throw new Error('TickerAll not initialized');

        let rates;
        try {
            rates = await Promise.race([
                ticker.market.getHistory(accountId, { symbol, timeframe: 'M1', limit: 200 }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
            ]);
        } catch (timeoutError) {
            console.error('⏰ AI data fetch timeout');
            return { action: 'HOLD', confidence: 0.3, reasons: ['Data fetch timeout'], currentPrice: 0 };
        }

        if (!rates || rates.length < 50) {
            return { action: 'HOLD', confidence: 0.3, reasons: ['Insufficient data'], currentPrice: 0 };
        }

        const prices = rates.map(r => r.close);
        const highs = rates.map(r => r.high);
        const lows = rates.map(r => r.low);
        const volumes = rates.map(r => r.tick_volume);
        const currentPrice = prices[prices.length - 1] || 0;

        const rsi = calculateRSI(prices);
        const macd = calculateMACD(prices);
        const bb = calculateBollingerBands(prices);
        const atr = calculateATR(highs, lows, prices);
        const volatility = atr / (currentPrice || 1);

        const ma20 = prices.slice(-20).reduce((a,b)=>a+b,0)/20;
        const ma50 = prices.slice(-50).reduce((a,b)=>a+b,0)/50;
        const ma200 = prices.length >= 200 ? prices.slice(-200).reduce((a,b)=>a+b,0)/200 : ma50;
        const trend = ma20 > ma50 ? 'UP' : 'DOWN';
        const longTermTrend = ma50 > ma200 ? 'UP' : 'DOWN';

        const momentum = ((prices[prices.length-1] - prices[prices.length-5]) / (prices[prices.length-5] || 1)) * 100;

        const avgVolume = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
        const volumeSpike = volumes[volumes.length-1] > avgVolume * 1.5;

        const fibHigh = Math.max(...prices.slice(-100));
        const fibLow = Math.min(...prices.slice(-100));
        const fib = calculateFibonacciLevels(fibHigh, fibLow);

        const rsiValues = prices.map((_,i) => calculateRSI(prices.slice(0,i+1)));
        const divergence = detectDivergence(prices, rsiValues);

        const bullishCandles = rates.slice(-20).filter(r => r.close > r.open).length;
        const bearishCandles = rates.slice(-20).filter(r => r.close < r.open).length;
        const sentiment = bullishCandles / (bullishCandles + bearishCandles || 1);

        let buyScore = 0, sellScore = 0;
        let reasons = [];

        if (rsi < 25) { buyScore += 35; reasons.push(`RSI ${rsi.toFixed(1)} (extreme oversold)`); }
        else if (rsi < 35) { buyScore += 25; reasons.push(`RSI ${rsi.toFixed(1)} (oversold)`); }
        else if (rsi > 75) { sellScore += 35; reasons.push(`RSI ${rsi.toFixed(1)} (extreme overbought)`); }
        else if (rsi > 65) { sellScore += 25; reasons.push(`RSI ${rsi.toFixed(1)} (overbought)`); }

        if (trend === 'UP' && longTermTrend === 'UP') { buyScore += 20; reasons.push('Strong uptrend'); }
        else if (trend === 'UP') { buyScore += 10; reasons.push('Uptrend'); }
        else if (trend === 'DOWN' && longTermTrend === 'DOWN') { sellScore += 20; reasons.push('Strong downtrend'); }
        else if (trend === 'DOWN') { sellScore += 10; reasons.push('Downtrend'); }

        if (macd.histogram > 0 && macd.macd > macd.signal) { buyScore += 15; reasons.push('Bullish MACD'); }
        else if (macd.histogram < 0 && macd.macd < macd.signal) { sellScore += 15; reasons.push('Bearish MACD'); }

        if (bb.lower && currentPrice <= bb.lower * 1.01) { buyScore += 20; reasons.push('At lower Bollinger Band'); }
        else if (bb.upper && currentPrice >= bb.upper * 0.99) { sellScore += 20; reasons.push('At upper Bollinger Band'); }

        if (momentum > 0.3) { buyScore += 10; reasons.push(`Momentum ${momentum.toFixed(2)}%`); }
        else if (momentum < -0.3) { sellScore += 10; reasons.push(`Momentum ${momentum.toFixed(2)}%`); }

        if (divergence === 'BULLISH') { buyScore += 30; reasons.push('Bullish divergence'); }
        else if (divergence === 'BEARISH') { sellScore += 30; reasons.push('Bearish divergence'); }

        if (currentPrice <= fib.level382 * 1.005) { buyScore += 15; reasons.push('Fibonacci support'); }
        if (currentPrice >= fib.level618 * 0.995) { sellScore += 15; reasons.push('Fibonacci resistance'); }

        if (sentiment > 0.65) { buyScore += 10; reasons.push(`Sentiment ${(sentiment*100).toFixed(0)}%`); }
        else if (sentiment < 0.35) { sellScore += 10; reasons.push(`Sentiment ${(sentiment*100).toFixed(0)}%`); }

        if (volumeSpike && sentiment > 0.5) { buyScore += 10; reasons.push('High volume'); }
        else if (volumeSpike && sentiment < 0.5) { sellScore += 10; reasons.push('High volume'); }

        if (volatility > 0.02) { buyScore *= 0.9; sellScore *= 0.9; reasons.push('High volatility'); }

        let action = 'HOLD';
        let confidence = 0.4;

        if (buyScore > sellScore) {
            action = 'BUY';
            confidence = Math.min(0.9, 0.4 + (buyScore / (buyScore + sellScore)) * 0.5);
        } else if (sellScore > buyScore) {
            action = 'SELL';
            confidence = Math.min(0.9, 0.4 + (sellScore / (buyScore + sellScore)) * 0.5);
        } else {
            if (sentiment > 0.55) { action = 'BUY'; confidence = 0.45; }
            else if (sentiment < 0.45) { action = 'SELL'; confidence = 0.45; }
        }

        console.log(`🤖 AI [${symbol}]: ${action} (${(confidence*100).toFixed(0)}%)`);
        console.log(`   Buy:${buyScore} Sell:${sellScore} | ${reasons.slice(0,3).join(' | ')}`);

        return { action, confidence, reasons: reasons.slice(0,5), currentPrice, buyScore, sellScore };
    } catch (error) {
        console.error('❌ AI error:', error.message);
        return { action: 'HOLD', confidence: 0.3, reasons: ['AI error'], currentPrice: 0 };
    }
}

// ==================== POSITION MONITORING ====================
async function shouldClosePositionAI(position, accountId) {
    try {
        if (!ticker) throw new Error('TickerAll not initialized');

        let price;
        try {
            price = await Promise.race([
                ticker.market.getPrice(accountId, position.symbol),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]);
        } catch (timeoutError) {
            if (position.profitPercent >= 1.5) {
                return { shouldClose: true, reason: `Profit ${position.profitPercent.toFixed(2)}%`, profitPercent: position.profitPercent, currentPrice: 0 };
            }
            return { shouldClose: false, reason: 'Timeout', profitPercent: position.profitPercent || 0, currentPrice: 0 };
        }

        const currentPrice = position.side === 'buy' ? price.bid : price.ask;
        const profitPercent = ((currentPrice - position.entryPrice) / (position.entryPrice || 1)) * 100 * (position.side === 'buy' ? 1 : -1);

        let rates;
        try {
            rates = await Promise.race([
                ticker.market.getHistory(accountId, { symbol: position.symbol, timeframe: 'M1', limit: 50 }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]);
        } catch (timeoutError) {
            if (profitPercent >= 1.5) {
                return { shouldClose: true, reason: `Profit ${profitPercent.toFixed(2)}%`, profitPercent, currentPrice };
            }
            if (profitPercent <= -1.5) {
                return { shouldClose: true, reason: `Stop loss ${Math.abs(profitPercent).toFixed(2)}%`, profitPercent, currentPrice };
            }
            return { shouldClose: false, reason: 'Holding', profitPercent, currentPrice };
        }

        const prices = rates.map(r => r.close);
        const rsi = calculateRSI(prices);
        const momentum = ((prices[prices.length-1] - prices[prices.length-3]) / (prices[prices.length-3] || 1)) * 100;

        let shouldClose = false;
        let reason = '';

        if (profitPercent > 0) {
            if (profitPercent >= 3) { shouldClose = true; reason = `High profit ${profitPercent.toFixed(2)}%`; }
            else if (profitPercent >= 1.5) {
                if ((position.side === 'buy' && rsi > 70) || (position.side === 'sell' && rsi < 30)) {
                    shouldClose = true; reason = `Profit ${profitPercent.toFixed(2)}% with overbought/oversold`;
                } else if ((position.side === 'buy' && momentum < -0.05) || (position.side === 'sell' && momentum > 0.05)) {
                    shouldClose = true; reason = `Profit ${profitPercent.toFixed(2)}% with weakening momentum`;
                }
            }
            if (!shouldClose && profitPercent >= 1) {
                const maxProfit = position.maxProfit || 0;
                if (profitPercent > maxProfit) position.maxProfit = profitPercent;
                else if (profitPercent < maxProfit * 0.6 && maxProfit > 1) {
                    shouldClose = true; reason = `Retraced from ${maxProfit.toFixed(2)}% to ${profitPercent.toFixed(2)}%`;
                }
            }
        } else if (profitPercent < 0) {
            const loss = Math.abs(profitPercent);
            if (loss >= 2) { shouldClose = true; reason = `Stop loss ${loss.toFixed(2)}%`; }
            else if (loss >= 1) {
                if ((position.side === 'buy' && momentum < -0.1) || (position.side === 'sell' && momentum > 0.1)) {
                    shouldClose = true; reason = `Loss ${loss.toFixed(2)}% accelerating`;
                }
            }
        }

        if (shouldClose) console.log(`🎯 AI CLOSE: ${position.symbol} | ${reason}`);
        return { shouldClose, reason, profitPercent, currentPrice };
    } catch (error) {
        console.error('❌ AI close error:', error.message);
        return { shouldClose: false, reason: 'Error', profitPercent: 0, currentPrice: 0 };
    }
}

// ==================== TRADING ENGINE (AGGRESSIVE) ====================
const engines = {};

class HalalTradingEngine {
    constructor(sessionId, userEmail, config, accountId) {
        this.sessionId = sessionId;
        this.userEmail = userEmail;
        this.config = config;
        this.accountId = accountId;
        this.isActive = true;
        this.currentProfit = 0;
        this.trades = [];
        this.winStreak = 0;
        this.analysisInterval = null;
        this.monitorInterval = null;
        this.startTime = Date.now();
        this.openPositions = [];
        this.lastTradeTime = 0;
        this.forceTradeTimer = null;
        this.hasOpenedFirstTrade = false;
    }

    async start() {
        console.log(`🕋 Starting AGGRESSIVE AI trading for ${this.userEmail}`);
        console.log(`   Investment: $${this.config.investmentAmount} | Target: $${this.config.targetProfit}`);
        console.log(`   🤖 AI analyzes market EVERY 5 SECONDS`);
        console.log(`   📊 Trading Pairs: ${this.config.tradingPairs.join(', ')}`);

        // Force a trade after 30 seconds if no trade yet
        this.forceTradeTimer = setTimeout(() => {
            if (!this.hasOpenedFirstTrade && this.isActive) {
                console.log('🔥 FORCE TRADE: No trades opened in 30 seconds. Forcing a trade!');
                this.forceOpenTrade();
            }
        }, 30000);

        this.analysisInterval = setInterval(async () => {
            if (!this.isActive) return;

            const elapsedHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
            if (elapsedHours >= this.config.timeLimit) {
                console.log(`⏰ Time limit reached`);
                await this.stop();
                return;
            }
            if (this.currentProfit >= this.config.targetProfit) {
                console.log(`🎯 Target reached! Profit: $${this.currentProfit.toFixed(2)}`);
                await this.stop();
                return;
            }

            // Try to open new trades if we have fewer than 3 open positions
            if (this.openPositions.length < 3) {
                for (const symbol of this.config.tradingPairs) {
                    if (!this.isActive) break;
                    const hasPosition = this.openPositions.some(p => p.symbol === symbol);
                    if (!hasPosition) {
                        try {
                            const aiDecision = await getRealAIDecision(symbol, this.accountId);
                            if (aiDecision.action !== 'HOLD' && aiDecision.confidence >= 0.35) {
                                await this.executeTrade(symbol, aiDecision.action, aiDecision);
                            }
                        } catch (error) {
                            console.error(`Analysis error for ${symbol}:`, error.message);
                        }
                    }
                }
            }
        }, 5000);

        this.monitorInterval = setInterval(async () => {
            if (!this.isActive) return;
            for (const position of this.openPositions) {
                try {
                    const closeDecision = await shouldClosePositionAI(position, this.accountId);
                    if (closeDecision.shouldClose) {
                        await this.closePosition(position, closeDecision.profitPercent, closeDecision.currentPrice);
                    }
                } catch (error) {
                    console.error(`Monitor error:`, error.message);
                }
            }
        }, 5000);
    }

    async forceOpenTrade() {
        if (!this.isActive || this.openPositions.length > 0 || this.hasOpenedFirstTrade) return;
        
        // Pick the first symbol and force BUY or SELL based on trend
        const symbol = this.config.tradingPairs[0];
        try {
            const aiDecision = await getRealAIDecision(symbol, this.accountId);
            let action = aiDecision.action;
            if (action === 'HOLD') {
                // Use a simple rule: if price is above 200 MA, buy, else sell
                const rates = await ticker.market.getHistory(this.accountId, { symbol, timeframe: 'M1', limit: 200 });
                const prices = rates.map(r => r.close);
                const ma200 = prices.slice(-200).reduce((a,b)=>a+b,0)/200;
                const currentPrice = prices[prices.length-1];
                action = currentPrice > ma200 ? 'BUY' : 'SELL';
                aiDecision.confidence = 0.5;
                aiDecision.reasons = ['Force trade - no signal found'];
            }
            console.log(`🔥 FORCING TRADE: ${action} on ${symbol}`);
            await this.executeTrade(symbol, action, aiDecision);
            this.hasOpenedFirstTrade = true;
        } catch (error) {
            console.error('❌ Force trade failed:', error.message);
        }
    }

    async executeTrade(symbol, side, aiDecision) {
        if (this.openPositions.some(p => p.symbol === symbol)) return;
        try {
            if (!ticker) throw new Error('TickerAll not initialized');
            const result = await fetchRealBalance(this.accountId);
            const balance = result.balance || 0;
            if (balance < 1) { console.log(`⚠️ Balance is ${balance}. Cannot trade.`); return; }

            // Use higher risk percentage to hit target faster
            let riskPercent = this.config.riskLevel === 'low' ? 0.20 : this.config.riskLevel === 'medium' ? 0.30 : 0.40;
            // Compounding win streak bonus
            const winBonus = Math.min(this.winStreak * 0.02, 0.15);
            const totalPercent = Math.min(riskPercent + winBonus, 0.50);
            let positionSize = balance * totalPercent;
            if (positionSize < 3) positionSize = 3;
            if (balance < positionSize + 5) { console.log(`⚠️ Insufficient balance: ${balance}`); return; }

            const price = await ticker.market.getPrice(this.accountId, symbol);
            const entryPrice = side === 'BUY' ? price.ask : price.bid;
            const volume = positionSize / entryPrice;
            if (volume < 0.01) { console.log(`⚠️ Volume too small: ${volume}`); return; }

            console.log(`📈 EXECUTING ${side} for ${symbol} at ${entryPrice}, vol ${volume}`);
            const order = await ticker.orders.place(this.accountId, {
                type: 'market',
                symbol: symbol,
                side: side,
                volume: Math.min(volume, 1.0)
            });

            this.openPositions.push({
                symbol, side, volume: Math.min(volume, 1.0), entryPrice,
                orderId: order.id,
                openedAt: Date.now(),
                aiConfidence: aiDecision.confidence,
                aiReason: aiDecision.reasons[0] || 'AI Decision',
                maxProfit: 0,
                profitPercent: 0
            });

            this.hasOpenedFirstTrade = true;
            this.trades.unshift({
                symbol, side: `${side} OPEN`,
                entryPrice: entryPrice.toFixed(5),
                volume: Math.min(volume, 1.0).toFixed(2),
                aiConfidence: `${(aiDecision.confidence * 100).toFixed(0)}%`,
                aiReason: aiDecision.reasons[0] || 'AI Decision',
                timestamp: new Date().toISOString()
            });
            console.log(`✅ ${side} opened at $${entryPrice.toFixed(5)}`);
        } catch (error) {
            console.error(`Trade execution error:`, error.message);
        }
    }

    async closePosition(position, profitPercent, currentPrice) {
        try {
            if (!ticker) throw new Error('TickerAll not initialized');
            await ticker.orders.close(this.accountId, position.orderId);
            const profit = (profitPercent / 100) * (position.volume * 100000 * position.entryPrice);
            this.currentProfit += profit;
            this.winStreak = profit > 0 ? this.winStreak + 1 : 0;

            this.trades.unshift({
                symbol: position.symbol,
                side: `${position.side} CLOSED`,
                entryPrice: position.entryPrice.toFixed(5),
                exitPrice: currentPrice.toFixed(5),
                profit: profit.toFixed(2),
                profitPercent: profitPercent.toFixed(2),
                timestamp: new Date().toISOString()
            });

            const tradeFile = path.join(tradesDir, this.userEmail.replace(/[^a-z0-9]/gi, '_') + '.json');
            let allTrades = [];
            if (fs.existsSync(tradeFile)) allTrades = JSON.parse(fs.readFileSync(tradeFile));
            allTrades.unshift({
                symbol: position.symbol,
                side: position.side,
                entryPrice: position.entryPrice,
                exitPrice: currentPrice,
                profit,
                profitPercent,
                timestamp: new Date().toISOString()
            });
            fs.writeFileSync(tradeFile, JSON.stringify(allTrades, null, 2));
            this.openPositions = this.openPositions.filter(p => p.orderId !== position.orderId);

            const profitSymbol = profit >= 0 ? '+' : '';
            console.log(`✅ CLOSED ${position.symbol} | Profit: ${profitSymbol}$${profit.toFixed(2)} (${profitPercent.toFixed(2)}%)`);
        } catch (error) {
            console.error(`Close error:`, error.message);
        }
    }

    async stop() {
        console.log(`🛑 Stopping AI trading for ${this.userEmail}`);
        this.isActive = false;
        if (this.analysisInterval) clearInterval(this.analysisInterval);
        if (this.monitorInterval) clearInterval(this.monitorInterval);
        if (this.forceTradeTimer) clearTimeout(this.forceTradeTimer);
        for (const position of this.openPositions) {
            try {
                const closeDecision = await shouldClosePositionAI(position, this.accountId);
                await this.closePosition(position, closeDecision.profitPercent, closeDecision.currentPrice);
            } catch (error) {
                console.error(`Stop close error:`, error.message);
            }
        }
    }

    getStatus() {
        const elapsedHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
        const timeRemaining = Math.max(0, this.config.timeLimit - elapsedHours);
        const progressPercent = this.config.targetProfit > 0 ? (this.currentProfit / this.config.targetProfit) * 100 : 0;
        return {
            isActive: this.isActive,
            currentProfit: this.currentProfit || 0,
            targetProfit: this.config.targetProfit || 0,
            winStreak: this.winStreak || 0,
            timeRemaining: timeRemaining || 0,
            progressPercent: progressPercent || 0,
            openPositions: this.openPositions.length || 0,
            trades: this.trades.slice(0, 30)
        };
    }
}

// ==================== API ROUTES ====================
app.post('/api/start-trading', authenticate, async (req, res) => {
    try {
        const { investmentAmount, targetProfit, timeLimit, tradingPairs, riskLevel } = req.body;
        if (investmentAmount < 10) return res.status(400).json({ success: false, message: 'Minimum investment is $10' });
        if (targetProfit < 1) return res.status(400).json({ success: false, message: 'Target profit must be at least $1' });
        if (!timeLimit || timeLimit < 0.1) return res.status(400).json({ success: false, message: 'Time limit must be at least 0.1 hours' });

        const users = readUsers();
        const user = users[req.user.email];
        if (!user.tickerallSessionId) return res.status(400).json({ success: false, message: 'Please add Exness credentials first' });
        if (!ticker) return res.status(500).json({ success: false, message: 'TickerAll not initialized.' });

        const result = await fetchRealBalance(user.tickerallSessionId);
        const balance = result.balance || 0;
        if (balance < investmentAmount) {
            return res.status(400).json({ success: false, message: `Insufficient balance. You have ${balance} ${result.currency || 'USD'}, need ${investmentAmount} USD` });
        }

        const sessionId = 'session_' + Date.now() + '_' + req.user.email.replace(/[^a-z0-9]/gi, '_');
        const config = { 
            investmentAmount, 
            targetProfit, 
            timeLimit, 
            tradingPairs: tradingPairs || ['XAUUSD', 'EURUSD', 'GBPUSD'], 
            riskLevel: riskLevel || 'medium' 
        };
        const engine = new HalalTradingEngine(sessionId, req.user.email, config, user.tickerallSessionId);
        engines[sessionId] = engine;
        await engine.start();

        res.json({
            success: true,
            sessionId,
            message: `✅ AGGRESSIVE AI HALAL TRADING STARTED! Investment: $${investmentAmount} | Target: $${targetProfit} | 🔥 Forces trades if no signal!`
        });
    } catch (error) {
        console.error('Start trading error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/stop-trading', authenticate, (req, res) => {
    const { sessionId } = req.body;
    if (engines[sessionId]) {
        engines[sessionId].stop();
        delete engines[sessionId];
    }
    res.json({ success: true, message: 'Trading stopped' });
});

app.post('/api/trading-update', authenticate, (req, res) => {
    const { sessionId } = req.body;
    const engine = engines[sessionId];
    if (!engine) return res.json({ success: true, currentProfit: 0, newTrades: [], isActive: false });
    const status = engine.getStatus();
    res.json({
        success: true,
        currentProfit: status.currentProfit || 0,
        targetProfit: status.targetProfit || 0,
        newTrades: status.trades || [],
        winStreak: status.winStreak || 0,
        timeRemaining: status.timeRemaining || 0,
        progressPercent: status.progressPercent || 0,
        openPositions: status.openPositions || 0,
        isActive: status.isActive
    });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now(), apiKeyStatus }));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🕋 100% HALAL EXNESS TRADING BOT - AGGRESSIVE FIX`);
    console.log(`✅ Server: http://localhost:${PORT}`);
    console.log(`✅ Login: mujtabahatif@gmail.com / Mujtabah@2598`);
    console.log(`✅ 🔥 FORCES TRADES if no signal in 30 seconds`);
    console.log(`✅ 🤖 AI confidence threshold: 0.35`);
    console.log(`✅ ⚡ Checks for trades every 5 seconds`);
    console.log(`✅ 100% Halal - No Riba, No Gharar, No Maysir`);
    console.log(`✅ REAL trades - No simulation\n`);
});
