import express from 'express';
import crypto from 'crypto';
import { BigQuery } from '@google-cloud/bigquery';

const app = express();
const bigquery = new BigQuery();

// CRITICAL: We must capture the raw, unparsed payload buffer to verify Shopify's signature.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.post('/webhook', async (req, res) => {
  // 1. SECURITY: Verify the webhook actually came from Shopify
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const SHOPIFY_SECRET = process.env.SHOPIFY_SECRET; 

  // If there's a secret set in GCP, enforce the check
  if (SHOPIFY_SECRET && hmacHeader) {
    const generatedHash = crypto
      .createHmac('sha256', SHOPIFY_SECRET)
      .update(req.rawBody, 'utf8', 'hex')
      .digest('base64');

    if (generatedHash !== hmacHeader) {
      console.error('[Security] Unauthorized webhook attempt.');
      return res.status(401).send('Unauthorized');
    }
  }

  try {
    const rawOrderPayload = req.body;
    
    // 2. Prepare the row for BigQuery
    const rowToInsert = {
      shopify_order_id: rawOrderPayload.id,
      order_number: rawOrderPayload.order_number,
      created_at: rawOrderPayload.created_at,
      raw_json_payload: JSON.stringify(rawOrderPayload), 
      pipeify_ingested_at: new Date().toISOString()
    };

    // 3. Stream into your database
    await bigquery
      .dataset('shopify_raw')
      .table('orders_stream')
      .insert([rowToInsert]);

    console.log(`[Pipeify Success] Piped Order #${rawOrderPayload.order_number}`);
    res.status(200).send('Webhook successfully ingested by Pipeify');

  } catch (error) {
    console.error('[Pipeify Pipeline Error]:', error);
    res.status(202).send('Error logged but webhook acknowledged.');
  }
});

// 4. Start the server on the port Cloud Run assigns
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Pipeify ingestion server listening on port ${port}`);
});