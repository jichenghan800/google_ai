const { TranslationServiceClient } = require('@google-cloud/translate').v3;

let client = null;
function getClient() {
  if (!client) client = new TranslationServiceClient();
  return client;
}

async function translateText(text, { source = undefined, target = 'en' } = {}) {
  const translationClient = getClient();
  const parent = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/global`;
  const req = {
    parent,
    contents: Array.isArray(text) ? text : [text],
    targetLanguageCode: target,
  };
  if (source) req.sourceLanguageCode = source;
  const [resp] = await translationClient.translateText(req);
  const arr = resp.translations?.map(t => t.translatedText || '') || [];
  return Array.isArray(text) ? arr : (arr[0] || '');
}

module.exports = { translateText };

