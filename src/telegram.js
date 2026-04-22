const https = require('https');

function apiCall(token, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body ?? {});
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function sendMessage(token, chatId, text) {
  if (!token || !chatId) return false;
  try {
    const r = await apiCall(token, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });
    return r?.ok === true;
  } catch {
    return false;
  }
}

// getUpdates로 첫 번째 메시지를 보낸 chat의 ID를 반환
// 사용자가 봇에게 먼저 메시지를 보낸 뒤 호출해야 함
async function resolveFirstChatId(token, maxAttempts = 3) {
  if (!token) throw new Error('token required');
  for (let i = 0; i < maxAttempts; i++) {
    const r = await apiCall(token, 'getUpdates', { limit: 10, timeout: 3 });
    if (!r?.ok) throw new Error(r?.description || 'getUpdates failed');
    const updates = r.result ?? [];
    if (updates.length > 0) {
      const chat = updates[updates.length - 1]?.message?.chat
        ?? updates[updates.length - 1]?.my_chat_member?.chat;
      if (chat?.id) return { chatId: String(chat.id), name: chat.first_name ?? chat.title ?? String(chat.id) };
    }
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('no_messages');
}

async function testToken(token) {
  if (!token) return false;
  try {
    const r = await apiCall(token, 'getMe', {});
    return r?.ok === true ? r.result : false;
  } catch {
    return false;
  }
}

module.exports = { sendMessage, resolveFirstChatId, testToken };
