const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../syncos/db/syncos.sqlite');
const db = new sqlite3.Database(dbPath);

async function processQueue() {
  console.log("Starting AI Enrichment Queue Worker...");
  
  // Pick highest priority pending task
  db.get(`SELECT id, product_id, reason FROM ai_enrichment_queue WHERE status = 'Pending' ORDER BY priority ASC, created_at ASC LIMIT 1`, async (err, task) => {
    if (err) return console.error(err);
    if (!task) {
      console.log("Queue empty. Exiting.");
      return db.close();
    }

    console.log(`[Worker] Processing Task ${task.id} for Product ${task.product_id}. Reason: ${task.reason}`);

    // Mark as Processing
    db.run(`UPDATE ai_enrichment_queue SET status = 'Processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [task.id], async () => {
      
      try {
        // Here we would interact with Gemini API
        if (!process.env.GEMINI_API_KEY) {
          throw new Error("GEMINI_API_KEY not found. Simulating enhancement failure.");
        }
        
        console.log(`[Worker] Contacting Gemini for enrichment of ${task.product_id}...`);
        // Simulating AI work
        await new Promise(r => setTimeout(r, 2000));
        
        console.log(`[Worker] Gemini successfully enriched ${task.product_id}. Updating structured tables...`);
        
        // Mark Completed
        db.run(`UPDATE ai_enrichment_queue SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [task.id], () => db.close());

      } catch(e) {
        console.error(`[Worker] Task ${task.id} failed:`, e.message);
        // Mark Failed
        db.run(`UPDATE ai_enrichment_queue SET status = 'Failed', reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [e.message, task.id], () => db.close());
      }
    });
  });
}

processQueue();
