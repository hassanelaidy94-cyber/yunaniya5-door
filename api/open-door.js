const crypto = require('crypto');

const CLIENT_ID = process.env.TUYA_ACCESS_ID;
const SECRET    = process.env.TUYA_ACCESS_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID || 'bf975a0b7f1159d9e5u3ln';
const ENDPOINT  = process.env.TUYA_ENDPOINT  || 'https://openapi.tuyaeu.com';

function hmacSHA256(str, secret) {
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// stringToSign = METHOD\nSHA256(body)\n\npath
function buildStringToSign(method, path, body) {
  const bodyHash = sha256(body || '');
  return [method.toUpperCase(), bodyHash, '', path].join('\n');
}

// ========== GET TOKEN ==========
async function getToken() {
  const ts          = Date.now();
  const nonce       = '';
  const path        = '/v1.0/token?grant_type=1';
  const stringToSign = buildStringToSign('GET', path, '');

  // للـ token: client_id + t + nonce + stringToSign
  const signStr = CLIENT_ID + ts + nonce + stringToSign;
  const sign    = hmacSHA256(signStr, SECRET);

  const res = await fetch(`${ENDPOINT}${path}`, {
    headers: {
      'client_id':   CLIENT_ID,
      't':           String(ts),
      'nonce':       nonce,
      'sign_method': 'HMAC-SHA256',
      'sign':        sign,
      'Content-Type':'application/json'
    }
  });

  const data = await res.json();
  if (!data.success) throw new Error('Token failed: ' + data.msg);
  return data.result.access_token;
}

// ========== SEND COMMAND ==========
async function sendCommand(token, value) {
  const ts    = Date.now();
  const nonce = '';
  const path  = `/v1.0/iot-03/devices/${DEVICE_ID}/commands`;
  const body  = JSON.stringify({ commands: [{ code: 'switch_1', value }] });
  const stringToSign = buildStringToSign('POST', path, body);

  // للـ command: client_id + access_token + t + nonce + stringToSign
  const signStr = CLIENT_ID + token + ts + nonce + stringToSign;
  const sign    = hmacSHA256(signStr, SECRET);

  const res = await fetch(`${ENDPOINT}${path}`, {
    method: 'POST',
    headers: {
      'client_id':    CLIENT_ID,
      'access_token': token,
      't':            String(ts),
      'nonce':        nonce,
      'sign_method':  'HMAC-SHA256',
      'sign':         sign,
      'Content-Type': 'application/json'
    },
    body
  });

  return await res.json();
}

// ========== HANDLER ==========
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ success: false, msg: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const appSecret  = process.env.APP_SECRET || 'yunaniya5_door_2025';
  if (authHeader !== `Bearer ${appSecret}`) {
    return res.status(401).json({ success: false, msg: 'Unauthorized' });
  }

  try {
    const token1 = await getToken();
    const result = await sendCommand(token1, true);
    if (!result.success) throw new Error(result.msg || 'Command failed');

    await new Promise(r => setTimeout(r, 7000));
    const token2 = await getToken();
    await sendCommand(token2, false);

    return res.json({ success: true, msg: 'تم فتح وإغلاق الباب بنجاح' });
  } catch (err) {
    return res.status(500).json({ success: false, msg: err.message });
  }
};
