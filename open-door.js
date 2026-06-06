const crypto = require('crypto');

const CLIENT_ID = process.env.TUYA_ACCESS_ID;
const SECRET    = process.env.TUYA_ACCESS_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID || 'bf975a0b7f1159d9e5u3ln';
const ENDPOINT  = process.env.TUYA_ENDPOINT  || 'https://openapi.tuyaeu.com';

function hmacSHA256(str, secret) {
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

async function getToken() {
  const ts   = Date.now();
  const sign = hmacSHA256(CLIENT_ID + ts, SECRET);
  const res  = await fetch(`${ENDPOINT}/v1.0/token?grant_type=1`, {
    headers: {
      'client_id':   CLIENT_ID,
      't':           String(ts),
      'sign_method': 'HMAC-SHA256',
      'sign':        sign,
      'Content-Type':'application/json'
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error('Token failed: ' + data.msg);
  return data.result.access_token;
}

async function sendCommand(token, value) {
  const ts   = Date.now();
  const path = `/v1.0/iot-03/devices/${DEVICE_ID}/commands`;
  const body = JSON.stringify({ commands: [{ code: 'switch_1', value }] });
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const strToSign = CLIENT_ID + token + ts + `POST\n${bodyHash}\n\n${path}`;
  const sign = hmacSHA256(strToSign, SECRET);
  const res  = await fetch(`${ENDPOINT}${path}`, {
    method: 'POST',
    headers: {
      'client_id':    CLIENT_ID,
      'access_token': token,
      't':            String(ts),
      'sign_method':  'HMAC-SHA256',
      'sign':         sign,
      'Content-Type': 'application/json'
    },
    body
  });
  return await res.json();
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ success: false, msg: 'Method not allowed' });

  // تحقق بسيط من التفويض
  const authHeader = req.headers['authorization'] || '';
  const appSecret  = process.env.APP_SECRET || 'yunaniya5_door_2025';
  if (authHeader !== `Bearer ${appSecret}`) {
    return res.status(401).json({ success: false, msg: 'Unauthorized' });
  }

  try {
    // 1. فتح الباب
    const token1 = await getToken();
    const result = await sendCommand(token1, true);
    if (!result.success) throw new Error(result.msg || 'Command failed');

    // 2. انتظار 7 ثواني ثم إغلاق
    await new Promise(r => setTimeout(r, 7000));
    const token2 = await getToken();
    await sendCommand(token2, false);

    return res.json({ success: true, msg: 'تم فتح وإغلاق الباب بنجاح' });
  } catch (err) {
    return res.status(500).json({ success: false, msg: err.message });
  }
};
