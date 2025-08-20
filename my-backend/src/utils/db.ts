import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'your_default_mongodb_uri';
let client: MongoClient;
let isConnected = false;

export const connect = async () => {
  if (isConnected) {
    return;
  }
  client = new MongoClient(uri);
  await client.connect();
  isConnected = true;
};

export const disconnect = async () => {
  if (client && isConnected) {
    await client.close();
    isConnected = false;
  }
};

export const getDb = () => {
  if (!isConnected) {
    throw new Error('Database not connected. Please connect first.');
  }
  return client.db();
};