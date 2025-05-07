// Import Supabase SDK for Node.js
const { createClient } = require('@supabase/supabase-js');

// This endpoint will be called by Vercel Cron Job
module.exports = async (req, res) => {
  try {
    // Log the request for debugging
    console.log('Cron job triggered:', new Date().toISOString());

    // Get Supabase credentials from environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_KEY;

    // Check if credentials are available
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials in environment variables');
      return res.status(500).json({ 
        error: 'Missing Supabase credentials',
        timestamp: new Date().toISOString()
      });
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Perform a simple query to keep the database active
    const { data, error } = await supabase
      .from('game_rooms')
      .select('room_code')
      .limit(1);

    if (error) {
      console.error('Error pinging Supabase:', error);
      return res.status(500).json({ 
        error: 'Failed to ping Supabase',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }

    // Perform database maintenance - clean up old rooms
    await cleanupOldRooms(supabase);

    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'Supabase pinged successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unexpected error in cron job:', error);
    return res.status(500).json({ 
      error: 'Unexpected error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Clean up old game rooms to save database space
 * @param {Object} supabase - Supabase client
 * @param {number} maxAgeHours - Maximum age of rooms to keep in hours
 */
async function cleanupOldRooms(supabase, maxAgeHours = 24) {
  try {
    console.log('Running database maintenance - cleaning up old rooms');
    
    // Calculate the cutoff timestamp (current time - maxAgeHours)
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    // First get count of old rooms (for logging purposes)
    const { count, error: countError } = await supabase
      .from('game_rooms')
      .select('*', { count: 'exact', head: true })
      .lt('updated_at', new Date(cutoffTime).toISOString());
    
    if (countError) {
      console.error('Error counting old rooms:', countError);
      return;
    }
    
    console.log(`Found ${count} old game rooms to clean up`);
    
    // Delete old rooms
    if (count > 0) {
      const { error } = await supabase
        .from('game_rooms')
        .delete()
        .lt('updated_at', new Date(cutoffTime).toISOString());
      
      if (error) {
        console.error('Error cleaning up old rooms:', error);
      } else {
        console.log(`Successfully cleaned up ${count} old game rooms`);
      }
    }
  } catch (error) {
    console.error('Error during database maintenance:', error);
  }
} 