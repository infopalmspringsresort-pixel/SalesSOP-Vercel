import { useQuery } from "@tanstack/react-query";
import type { BookingWithRelations } from "@/types";

interface SessionConflict {
  conflictingBooking: BookingWithRelations;
  conflictingSession: any;
  message: string;
}

interface UseSessionConflictsProps {
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeBookingId?: string;
}

export function useSessionConflicts({
  venue,
  date,
  startTime,
  endTime,
  excludeBookingId
}: UseSessionConflictsProps) {
  const { data: bookings = [] } = useQuery<BookingWithRelations[]>({
    queryKey: ["/api/bookings"],
  });

  const conflicts: SessionConflict[] = [];

  // Check for conflicts with existing sessions
  bookings.forEach(booking => {
    if (excludeBookingId && booking.id === excludeBookingId) return;
    
    if (booking.sessions && booking.sessions.length > 0) {
      booking.sessions.forEach((session: any) => {
        // Check same venue and date
        const sessionDateStr = typeof session.sessionDate === 'string' 
          ? session.sessionDate.split('T')[0] 
          : new Date(session.sessionDate).toISOString().split('T')[0];
        
        if (session.venue === venue && sessionDateStr === date) {
          
          // Check time overlap
          const sessionStart = session.startTime;
          const sessionEnd = session.endTime;
          
          if (startTime < sessionEnd && endTime > sessionStart) {
            conflicts.push({
              conflictingBooking: booking,
              conflictingSession: session,
              message: `Conflicts with ${booking.clientName} - ${session.sessionName} (${sessionStart}-${sessionEnd})`
            });
          }
        }
      });
    } else {
      // Check legacy bookings without sessions
      const eventDateStr = typeof booking.eventDate === 'string'
        ? booking.eventDate.split('T')[0]
        : new Date(booking.eventDate).toISOString().split('T')[0];
      
      if (booking.hall === venue && eventDateStr === date) {
        
        // Use legacy start/end times or assume full day
        const legacyStart = booking.eventStartTime || "00:00";
        const legacyEnd = booking.eventEndTime || "23:59";
        
        if (startTime < legacyEnd && endTime > legacyStart) {
          conflicts.push({
            conflictingBooking: booking,
            conflictingSession: null,
            message: `Conflicts with existing booking ${booking.clientName} - ${booking.eventType}`
          });
        }
      }
    }
  });

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
}