import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Attempting to connect to the database...');
    await client.connect();
    console.log('Database Connection: SUCCESS');
    
    const res = await client.query('SELECT NOW()');
    console.log('🕒 Postgres Server Time:', res.rows[0].now);
    
  } catch (error) {
    console.error('Database Connection: FAILED');
    console.error(error);
  } finally {
    await client.end();
  }
}

checkDatabase();