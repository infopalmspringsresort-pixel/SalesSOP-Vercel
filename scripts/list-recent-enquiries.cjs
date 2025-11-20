const { MongoClient, ObjectId } = require('mongodb');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'PALMSPRINGDB';

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const enquiriesCol = db.collection('enquiries');

  console.log(`📊 Database: ${dbName}`);
  console.log(`📊 Connection: ${uri}\n`);

  // Get recent enquiries
  const recentEnquiries = await enquiriesCol
    .find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  console.log(`Found ${recentEnquiries.length} recent enquiries:\n`);

  recentEnquiries.forEach((enq, index) => {
    console.log(`${index + 1}. ${enq.enquiryNumber || 'N/A'}`);
    console.log(`   ID: ${enq._id}`);
    console.log(`   Client: ${enq.clientName || 'N/A'}`);
    console.log(`   Status: ${enq.status || 'N/A'}`);
    console.log(`   Created: ${enq.createdAt || 'N/A'}`);
    console.log('');
  });

  // Also search for "Dhirav" or "Testtttttt"
  const searchEnquiries = await enquiriesCol
    .find({
      $or: [
        { clientName: { $regex: /Dhirav/i } },
        { clientName: { $regex: /Testtttttt/i } }
      ]
    })
    .toArray();

  if (searchEnquiries.length > 0) {
    console.log(`\n🔍 Found enquiries matching "Dhirav" or "Testtttttt":\n`);
    searchEnquiries.forEach((enq, index) => {
      console.log(`${index + 1}. ${enq.enquiryNumber || 'N/A'}`);
      console.log(`   ID: ${enq._id}`);
      console.log(`   Client: ${enq.clientName || 'N/A'}`);
      console.log(`   Status: ${enq.status || 'N/A'}`);
      console.log('');
    });
  }

  await client.close();
}

run().catch(err => { 
  console.error('❌ Error:', err); 
  process.exit(1); 
});

