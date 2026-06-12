const crypto = require('crypto');

function decryptRequest(body, privateKeyPem) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

  const aesKey = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  const iv             = Buffer.from(initial_vector, 'base64');
  const encryptedBytes = Buffer.from(encrypted_flow_data, 'base64');
  const TAG_LENGTH     = 16;
  const encryptedBody  = encryptedBytes.subarray(0, -TAG_LENGTH);
  const authTag        = encryptedBytes.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedBody), decipher.final()]);
  return { decryptedBody: JSON.parse(decrypted.toString('utf-8')), aesKey, iv };
}

function encryptResponse(responseData, aesKey, iv) {
  const flippedIv = Buffer.alloc(iv.length);
  for (let i = 0; i < iv.length; i++) flippedIv[i] = ~iv[i] & 0xff;

  const cipher    = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(responseData), 'utf-8'), cipher.final()]);
  const tag       = cipher.getAuthTag();

  return Buffer.concat([encrypted, tag]).toString('base64');
}

module.exports = { decryptRequest, encryptResponse };
