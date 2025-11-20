const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const { resolve } = require('path');

// Load .env file from project root
dotenv.config({ path: resolve(process.cwd(), '.env') });

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'PALMSPRINGDB';
  const enquiryId = process.env.ENQUIRY_ID || '691c185a93a3b9079e698ce4'; // ENQ-2025-11-015
  const dryRun = process.env.DRY_RUN === 'true';

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const enquiriesCol = db.collection('enquiries');
  const quotationsCol = db.collection('quotations');
  const bookingsCol = db.collection('bookings');
  const followUpsCol = db.collection('follow_up_history');
  const quotationActivitiesCol = db.collection('quotation_activities');
  const enquiryTransfersCol = db.collection('enquiryTransfers');

  // Get the enquiry first to verify it exists
  const enquiryObjectId = new ObjectId(enquiryId);
  const enquiry = await enquiriesCol.findOne({ _id: enquiryObjectId });

  if (!enquiry) {
    console.log(`❌ Enquiry with ID ${enquiryId} not found`);
    await client.close();
    return;
  }

  console.log(`📋 Found enquiry: ${enquiry.enquiryNumber} - ${enquiry.clientName}`);
  console.log(`   Status: ${enquiry.status}`);
  console.log(`   Event Date: ${enquiry.eventDate || 'N/A'}`);
  console.log(`   Sessions: ${enquiry.sessions?.length || 0}`);

  const idStrs = [enquiryId];
  const byEnquiry = { enquiryId: enquiryObjectId };
  const byEnquiryString = { enquiryId: { $in: idStrs } };
  const enquiryQuery = { $or: [byEnquiry, byEnquiryString] };

  if (dryRun) {
    const q = await quotationsCol.countDocuments(enquiryQuery);
    const b = await bookingsCol.countDocuments(enquiryQuery);
    const f = await followUpsCol.countDocuments(enquiryQuery);
    const qa = await quotationActivitiesCol.countDocuments(enquiryQuery);
    const t = await enquiryTransfersCol.countDocuments(enquiryQuery);
    
    console.log(`\n[DRY_RUN] Would delete:`);
    console.log(`  - Enquiry: 1`);
    console.log(`  - Quotations: ${q}`);
    console.log(`  - Bookings (unlink): ${b}`);
    console.log(`  - Follow-ups: ${f}`);
    console.log(`  - Quotation Activities: ${qa}`);
    console.log(`  - Enquiry Transfers: ${t}`);
    await client.close();
    return;
  }

  console.log(`\n🗑️  Starting deletion...`);

  // Delete quotations
  const delQ = await quotationsCol.deleteMany(enquiryQuery);
  console.log(`  ✓ Deleted ${delQ.deletedCount} quotation(s)`);

  // Unlink bookings (set enquiryId to null)
  const updateB = await bookingsCol.updateMany(
    enquiryQuery,
    { $set: { enquiryId: null } }
  );
  console.log(`  ✓ Unlinked ${updateB.modifiedCount} booking(s)`);

  // Delete follow-up history
  const delF = await followUpsCol.deleteMany(enquiryQuery);
  console.log(`  ✓ Deleted ${delF.deletedCount} follow-up(s)`);

  // Delete quotation activities
  const delQA = await quotationActivitiesCol.deleteMany(enquiryQuery);
  console.log(`  ✓ Deleted ${delQA.deletedCount} quotation activit(ies)`);

  // Delete enquiry transfers
  const delT = await enquiryTransfersCol.deleteMany(enquiryQuery);
  console.log(`  ✓ Deleted ${delT.deletedCount} transfer(s)`);

  // Delete the enquiry itself
  const delE = await enquiriesCol.deleteOne({ _id: enquiryObjectId });
  console.log(`  ✓ Deleted ${delE.deletedCount} enquiry`);

  console.log(`\n✅ Deletion complete!`);
  console.log(`\nSummary:`);
  console.log(`  - Enquiry: ${delE.deletedCount}`);
  console.log(`  - Quotations: ${delQ.deletedCount}`);
  console.log(`  - Bookings unlinked: ${updateB.modifiedCount}`);
  console.log(`  - Follow-ups: ${delF.deletedCount}`);
  console.log(`  - Quotation Activities: ${delQA.deletedCount}`);
  console.log(`  - Transfers: ${delT.deletedCount}`);

  await client.close();
}

run().catch(err => { 
  console.error('❌ Error:', err); 
  process.exit(1); 
});

