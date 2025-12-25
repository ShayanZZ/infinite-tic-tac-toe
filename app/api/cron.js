// Import Supabase SDK for Node.js (ESM syntax)
import { createClient } from '@supabase/supabase-js';

// This endpoint will be called by Vercel Cron Job
export default async function handler(req, res) {
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

    // Generate a unique room code for the keep-alive ping
    const keepAliveRoomCode = 'KEEPALIVE_' + Date.now();

    // IMPORTANT: Perform a WRITE operation to truly keep the database active
    // Supabase considers INSERT/UPDATE/DELETE as activity, not just SELECT
    // Only using columns that exist in the schema: room_code, host_id, created_at
    const { data: insertData, error: insertError } = await supabase
      .from('game_rooms')
      .insert({
        room_code: keepAliveRoomCode,
        host_id: 'cron-keepalive',
        created_at: new Date().toISOString()
      })
      .select();

    if (insertError) {
      console.error('Error inserting keep-alive room:', insertError);
      return res.status(500).json({ 
        error: 'Failed to insert keep-alive room',
        details: insertError.message,
        timestamp: new Date().toISOString()
      });
    }

    console.log('Keep-alive room created:', keepAliveRoomCode);

    // Immediately delete the keep-alive room (another WRITE operation)
    const { error: deleteError } = await supabase
      .from('game_rooms')
      .delete()
      .eq('room_code', keepAliveRoomCode);

    if (deleteError) {
      console.error('Error deleting keep-alive room:', deleteError);
      // Don't return error here, as the main goal (INSERT) was achieved
    } else {
      console.log('Keep-alive room deleted successfully');
    }

    // Also clean up any old keep-alive rooms that might have been left behind
    const { error: cleanupKeepAliveError } = await supabase
      .from('game_rooms')
      .delete()
      .eq('host_id', 'cron-keepalive');

    if (cleanupKeepAliveError) {
      console.error('Error cleaning up old keep-alive rooms:', cleanupKeepAliveError);
    }

    // Perform database maintenance - clean up old game rooms
    await cleanupOldRooms(supabase);

    // Count remaining rooms for logging
    const { count, error: countError } = await supabase
      .from('game_rooms')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`Database active - ${count} rooms in database`);
    }

    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'Supabase keep-alive successful (INSERT + DELETE performed)',
      activeRooms: count || 0,
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
}

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
    // Using created_at instead of updated_at (which doesn't exist in schema)
    const { count, error: countError } = await supabase
      .from('game_rooms')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', new Date(cutoffTime).toISOString());
    
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
        .lt('created_at', new Date(cutoffTime).toISOString());
      
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