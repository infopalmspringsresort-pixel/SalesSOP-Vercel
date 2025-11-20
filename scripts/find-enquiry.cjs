const { MongoClient, ObjectId } = require('mongodb');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'PALMSPRINGDB';
  const enquiryNumber = process.env.ENQUIRY_NUMBER || 'ENQ-2025-11-015';

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const enquiriesCol = db.collection('enquiries');

  // Try to find by enquiry number
  const enquiry = await enquiriesCol.findOne({ enquiryNumber: enquiryNumber });

  if (enquiry) {
    console.log(`✅ Found enquiry:`);
    console.log(`   ID: ${enquiry._id}`);
    console.log(`   Number: ${enquiry.enquiryNumber}`);
    console.log(`   Client: ${enquiry.clientName}`);
    console.log(`   Status: ${enquiry.status}`);
    console.log(`   Event Date: ${enquiry.eventDate || 'N/A'}`);
    console.log(`   Sessions: ${enquiry.sessions?.length || 0}`);
  } else {
    console.log(`❌ Enquiry ${enquiryNumber} not found`);
    
    // Try to find by ID string
    try {
      const enquiryId = '691c185a93a3b9079e698ce4';
      const enquiryById = await enquiriesCol.findOne({ _id: new ObjectId(enquiryId) });
      if (enquiryById) {
        console.log(`\n✅ Found enquiry by ID:`);
        console.log(`   ID: ${enquiryById._id}`);
        console.log(`   Number: ${enquiryById.enquiryNumber}`);
        console.log(`   Client: ${enquiryById.clientName}`);
      } else {
        console.log(`\n❌ Enquiry with ID ${enquiryId} also not found`);
      }
    } catch (err) {
      console.log(`\n❌ Error checking by ID: ${err.message}`);
    }
  }

  await client.close();
}

run().catch(err => { 
  console.error('❌ Error:', err); 
  process.exit(1); 
});

