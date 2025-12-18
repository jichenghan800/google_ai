const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION || 'us-east-1';
const endpoint = process.env.S3_ENDPOINT;
const publicDomain = process.env.S3_PUBLIC_DOMAIN;
const enablePathStyle = process.env.S3_ENABLE_PATH_STYLE === '1' || process.env.S3_ENABLE_PATH_STYLE === 'true';
const setAcl = process.env.S3_SET_ACL === '1' || process.env.S3_SET_ACL === 'true';
const preferSignedUrl = process.env.S3_SIGNED_URL === '1' || process.env.S3_SIGNED_URL === 'true' || !setAcl;
const signedUrlExpiry = parseInt(process.env.S3_SIGNED_URL_EXPIRY, 10) || 86400; // default 24h

const enabled = !!(bucket && accessKeyId && secretAccessKey && endpoint);

let client = null;

if (enabled) {
  client = new S3Client({
    region,
    endpoint,
    forcePathStyle: enablePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
  console.log(`[storage] S3 client initialized for bucket ${bucket} (${region})`);
} else {
  console.warn('[storage] S3/OSS not fully configured, uploads are disabled');
}

const buildPublicUrl = (key) => {
  if (publicDomain) {
    return `${publicDomain.replace(/\/+$/, '')}/${key}`;
  }
  if (endpoint && enablePathStyle) {
    return `${endpoint.replace(/\/+$/, '')}/${bucket}/${key}`;
  }
  if (endpoint) {
    return `${endpoint.replace(/\/+$/, '')}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const uploadImageBuffer = async (buffer, mimeType = 'image/png', userId = 'anonymous') => {
  if (!enabled || !client) {
    throw new Error('Storage is not configured');
  }

  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const key = `${userId || 'anonymous'}/${new Date().toISOString().split('T')[0]}/${uuidv4()}.${ext}`;

  const params = {
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType
  };

  if (setAcl) {
    params.ACL = 'public-read';
  }

  await client.send(new PutObjectCommand(params));
  const url = buildPublicUrl(key);
  let signedUrl = null;
  if (preferSignedUrl) {
    try {
      signedUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: signedUrlExpiry });
    } catch (err) {
      console.warn('[storage] Failed to generate signed URL:', err?.message || err);
    }
  }
  return { key, url, signedUrl, isSigned: !!signedUrl };
};

module.exports = {
  enabled,
  uploadImageBuffer
};
