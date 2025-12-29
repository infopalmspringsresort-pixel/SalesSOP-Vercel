import 'dotenv/config';
import { getMongoDb, closeMongo } from '../server/mongo';
import type { InsertVenue } from '@shared/schema-mongodb';

async function seedVenues() {
  try {
    console.log('✅ Connecting to MongoDB...');
    const db = await getMongoDb();
    const venuesCollection = db.collection('venues');
    
    // Define the venues to add
    const venuesToAdd: Omit<InsertVenue, '_id'>[] = [
      {
        name: 'Areca I',
        area: 10000,
        minGuests: 500,
        maxGuests: 700,
        hiringCharges: 200000,
        currency: 'INR',
        description: 'Banquet hall venue',
      },
      {
        name: 'Areca II',
        area: 10000,
        minGuests: 500,
        maxGuests: 700,
        hiringCharges: 200000,
        currency: 'INR',
        description: 'Banquet hall venue',
      },
      {
        name: 'Oasis - The Lawn',
        area: 29000,
        minGuests: 1000,
        maxGuests: 2000,
        hiringCharges: 500000,
        currency: 'INR',
        description: 'Spacious outdoor lawn venue',
      },
      {
        name: 'Pool-side Lawn',
        area: 6000,
        minGuests: 250,
        maxGuests: 400,
        hiringCharges: 100000,
        currency: 'INR',
        description: 'Intimate pool-side venue with scenic views',
      },
      {
        name: '3rd floor Party Lounge',
        area: 5000,
        minGuests: 200,
        maxGuests: 300,
        hiringCharges: 150000,
        currency: 'INR',
        description: 'Party lounge on the 3rd floor',
      },
      {
        name: 'Amber Multi-cuisine Restaurant',
        area: 4000,
        minGuests: 150,
        maxGuests: 250,
        hiringCharges: 120000,
        currency: 'INR',
        description: 'Multi-cuisine restaurant venue',
      },
      {
        name: 'Sway Lounge Bar',
        area: 3000,
        minGuests: 100,
        maxGuests: 150,
        hiringCharges: 80000,
        currency: 'INR',
        description: 'Lounge bar venue',
      },
      {
        name: 'Board Room',
        area: 1500,
        minGuests: 20,
        maxGuests: 50,
        hiringCharges: 50000,
        currency: 'INR',
        description: 'Board room for meetings and small events',
      },
    ];
    
    console.log('🏛️ Checking and adding venues...');
    
    let addedCount = 0;
    let skippedCount = 0;
    const addedVenues: string[] = [];
    
    for (const venue of venuesToAdd) {
      // Check if venue already exists
      const existingVenue = await venuesCollection.findOne({ name: venue.name });
      
      if (existingVenue) {
        console.log(`⏭️  Skipping "${venue.name}" - already exists`);
        skippedCount++;
      } else {
        const doc = {
          ...venue,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await venuesCollection.insertOne(doc);
        console.log(`✅ Added "${venue.name}"`);
        addedCount++;
        addedVenues.push(venue.name);
      }
    }
    
    console.log('\n✅ Venue seeding completed!');
    console.log(`📊 Summary: ${addedCount} added, ${skippedCount} skipped`);
    
    if (addedCount > 0) {
      console.log('\n📋 New Venues Added:');
      venuesToAdd
        .filter(v => addedVenues.includes(v.name))
        .forEach((venue, index) => {
          console.log(`  ${index + 1}. ${venue.name} - ${venue.area.toLocaleString()} sq ft (₹${venue.hiringCharges.toLocaleString()})`);
        });
    }
    
  } catch (error) {
    console.error('❌ Error seeding venues:', error);
    process.exit(1);
  } finally {
    await closeMongo();
  }
}

// Run the seeding function
seedVenues().catch(console.error);

