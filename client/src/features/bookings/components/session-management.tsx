import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Clock, MapPin, AlertTriangle, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { BookingWithRelations } from "@/types";
import { useSessionConflicts } from "../hooks/use-session-conflicts";
import { TimePicker } from "@/components/ui/time-picker";
import { useVenues } from "@/hooks/useVenues";

interface Session {
  id: string;
  sessionName: string;
  sessionLabel?: string;
  venue: string;
  startTime: string;
  endTime: string;
  sessionDate: string;
  specialInstructions?: string;
}

interface SessionManagementProps {
  sessions: Session[];
  onSessionsChange: (sessions: Session[]) => void;
  eventStartDate: string;
  eventEndDate?: string;
  eventDuration: number;
  readOnlySessions?: string[]; // Array of session IDs that should be read-only
  hideAddButton?: boolean; // Hide add button if true
}

const ALL_DAY_LABEL = "All Day";

const DAY_SESSION_OPTIONS = [
  "Breakfast",
  "Lunch",
  "Hi-Tea",
  "Dinner",
  ALL_DAY_LABEL,
];

export default function SessionManagement({ 
  sessions, 
  onSessionsChange, 
  eventStartDate, 
  eventEndDate, 
  eventDuration,
  readOnlySessions = [],
  hideAddButton = false
}: SessionManagementProps) {
  const { data: existingBookings = [] } = useQuery<BookingWithRelations[]>({
    queryKey: ["/api/bookings"],
  });
  const { data: venues = [], isLoading: venuesLoading, isError: venuesError } = useVenues();

  const venueOptions = useMemo(
    () => venues.map((venue) => venue.name),
    [venues]
  );


  // Helper function to calculate duration between two times
  const calculateDuration = (startTime: string, endTime: string): string => {
    if (!startTime || !endTime) return '';
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const durationMinutes = endMinutes - startMinutes;
    
    if (durationMinutes <= 0) return '';
    
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  // Generate available dates for sessions
  const availableDates = [];
  if (eventStartDate) {
    const startDate = new Date(eventStartDate);
    // Check if the date is valid
    if (!isNaN(startDate.getTime())) {
      for (let i = 0; i < eventDuration; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        availableDates.push(date.toISOString().split('T')[0]);
      }
    }
  }

  // Parse event dates for dropdown display (same as enquiry form)
  const parsedEventDates = useMemo(() => {
    if (!eventStartDate) return [];
    
    const dates: { value: string; label: string }[] = [];
    const startDate = new Date(eventStartDate);
    
    if (isNaN(startDate.getTime())) return [];
    
    for (let i = 0; i < eventDuration; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const value = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      dates.push({ value, label });
    }
    
    return dates;
  }, [eventStartDate, eventDuration]);

  // Track which sessions are using custom dates (not from event dates)
  const [customDateSessions, setCustomDateSessions] = useState<Set<string>>(new Set());

  // Auto-detect sessions with dates outside event dates and mark them as custom
  useEffect(() => {
    if (parsedEventDates.length === 0) return;
    
    const eventDateValues = new Set(parsedEventDates.map(d => d.value));
    setCustomDateSessions(prev => {
      const newSet = new Set(prev);
      sessions.forEach(session => {
        if (!session.sessionDate) return;
        const sessionDateStr = typeof session.sessionDate === 'string' 
          ? session.sessionDate 
          : new Date(session.sessionDate).toISOString().split('T')[0];
        
        if (!eventDateValues.has(sessionDateStr)) {
          newSet.add(session.id);
        }
      });
      return newSet;
    });
  }, [sessions, parsedEventDates]);

  // Check for conflicts with existing bookings
  const checkSessionConflict = (session: Session): string[] => {
    if (!session.venue || !session.sessionDate || !session.startTime || !session.endTime) {
      return [];
    }

    const conflicts: string[] = [];
    
    existingBookings.forEach(booking => {
      if (booking.sessions && booking.sessions.length > 0) {
        booking.sessions.forEach((existingSession: any) => {
          // Check if same venue and overlapping time on same date
          if (existingSession.venue === session.venue && 
              existingSession.sessionDate.split('T')[0] === session.sessionDate) {
            
            const sessionStart = session.startTime;
            const sessionEnd = session.endTime;
            const existingStart = existingSession.startTime;
            const existingEnd = existingSession.endTime;
            
            // Check for time overlap
            if ((sessionStart < existingEnd && sessionEnd > existingStart)) {
              conflicts.push(`Conflicts with ${booking.clientName} - ${existingSession.sessionName} (${existingStart}-${existingEnd})`);
            }
          }
        });
      }
    });
    
    return conflicts;
  };

  const addSession = () => {
    // Get default session date (first day of event if multi-day, or event start date)
    const defaultSessionDate = parsedEventDates.length > 0 
      ? parsedEventDates[0].value 
      : (eventStartDate || new Date().toISOString().split('T')[0]);
    
    const newSession: Session = {
      id: Math.random().toString(36).substr(2, 9),
      sessionName: "",
      sessionLabel: "",
      venue: "",
      startTime: "",
      endTime: "",
      sessionDate: defaultSessionDate,
      specialInstructions: ""
    };
    
    onSessionsChange([...sessions, newSession]);
  };

  const removeSession = (sessionId: string) => {
    onSessionsChange(sessions.filter(s => s.id !== sessionId));
  };

  const updateSession = (sessionId: string, field: keyof Session, value: any) => {
    onSessionsChange(sessions.map(s => 
      s.id === sessionId ? { ...s, [field]: value } : s
    ));
  };

  // Helper function to check if date is in the past
  const isDateInPast = (dateString: string): boolean => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Helper function to validate session time
  const validateSessionTime = (startTime?: string, endTime?: string, isAllDay?: boolean) => {
    if (isAllDay) return true;
    if (!startTime || !endTime) return true;
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return endMinutes > startMinutes;
  };

  // Enhanced session validation with detailed error messages
  const validateSession = (session: Session): string[] => {
    const errors: string[] = [];
    const isAllDaySession = session.sessionLabel === ALL_DAY_LABEL;
    
    // Check if session name is provided
    if (!session.sessionName?.trim()) {
      errors.push("Session name is required");
    }
    
    // Check if venue is provided
    if (!session.venue?.trim()) {
      errors.push("Venue is required");
    }
    
    // Check start time format and presence (only if not All Day)
    if (!isAllDaySession) {
      if (!session.startTime) {
        errors.push("Start time is required");
      } else if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(session.startTime)) {
        errors.push("Start time must be in HH:MM format (24-hour)");
      }
      
      // Check end time format and presence
      if (!session.endTime) {
        errors.push("End time is required");
      } else if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(session.endTime)) {
        errors.push("End time must be in HH:MM format (24-hour)");
      }
      
      // Check if end time is after start time
      if (session.startTime && session.endTime && !validateSessionTime(session.startTime, session.endTime, isAllDaySession)) {
        errors.push("End time must be after start time");
      }
    }
    
    return errors;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Event Sessions *</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Sessions define the specific venue, date, and time for your event. The session date will automatically match your event date.
          </p>
        </div>
        {!hideAddButton && (
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={addSession}
            data-testid="add-session"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Session
          </Button>
        )}
      </div>

      {sessions.length === 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="w-4 h-4 text-orange-600" />
          <AlertDescription className="text-orange-700">
            <strong>Session Required:</strong> Please add at least one session with venue, date, and timing details to proceed with booking confirmation.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {sessions.map((session, index) => {
          const conflicts = checkSessionConflict(session);
          const isAllDaySession = session.sessionLabel === ALL_DAY_LABEL;
          const validationErrors = validateSession(session);
          const hasErrors = conflicts.length > 0 || validationErrors.length > 0;
          const isReadOnly = readOnlySessions.includes(session.id);
          const isCustomDate = customDateSessions.has(session.id);

          return (
            <Card key={session.id} className={`${hasErrors ? 'border-red-500' : ''} ${isReadOnly ? 'bg-muted/30' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Session {index + 1}
                    {session.sessionLabel && ` - ${session.sessionLabel}`}
                    {isReadOnly && <Badge variant="outline" className="ml-2 text-xs">From Enquiry</Badge>}
                  </CardTitle>
                  {!isReadOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSession(session.id)}
                      data-testid={`remove-session-${index}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Session Name */}
                  <div className="space-y-2">
                    <Label htmlFor={`sessionName-${session.id}`}>Session Name *</Label>
                    <Input
                      id={`sessionName-${session.id}`}
                      value={session.sessionName || ""}
                      onChange={(e) => updateSession(session.id, "sessionName", e.target.value)}
                      placeholder="Enter session title (e.g., Welcome Ceremony)"
                      data-testid={`session-name-${index}`}
                      className={!session.sessionName?.trim() ? 'border-red-500' : ''}
                      disabled={isReadOnly}
                      readOnly={isReadOnly}
                    />
                    {!session.sessionName?.trim() && (
                      <p className="text-sm text-red-500">Session name is required</p>
                    )}
                  </div>

                  {/* Day Session */}
                  <div className="space-y-2">
                    <Label htmlFor={`daySession-${session.id}`}>Day Session *</Label>
                    {isReadOnly ? (
                      <div className="px-3 py-2 bg-muted border rounded-md text-sm font-medium">
                        {session.sessionLabel || "Not specified"}
                      </div>
                    ) : (
                      <Select
                        value={session.sessionLabel || ""}
                        onValueChange={(value) => {
                          // Update sessionLabel
                          const updatedSessions = sessions.map(s => {
                            if (s.id === session.id) {
                              const updated = { ...s, sessionLabel: value };
                              // If selecting All Day, set default times
                              if (value === ALL_DAY_LABEL) {
                                updated.startTime = "00:00";
                                updated.endTime = "23:59";
                              } else if (s.sessionLabel === ALL_DAY_LABEL) {
                                // Clear times when switching from All Day
                                updated.startTime = "";
                                updated.endTime = "";
                              }
                              return updated;
                            }
                            return s;
                          });
                          onSessionsChange(updatedSessions);
                        }}
                      >
                      <SelectTrigger 
                        id={`daySession-${session.id}`} 
                        className="w-full"
                      >
                        <SelectValue placeholder="Select day session" />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                        {DAY_SESSION_OPTIONS.map((option) => (
                          <SelectItem 
                            key={option} 
                            value={option}
                            className="cursor-pointer"
                          >
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Venue */}
                  <div className="space-y-2">
                    <Label htmlFor={`venue-${session.id}`}>Venue *</Label>
                    {isReadOnly ? (
                      <div className="px-3 py-2 bg-muted border rounded-md text-sm font-medium">
                        {session.venue || "Not specified"}
                      </div>
                    ) : (
                      <>
                        <Select
                          value={session.venue}
                          onValueChange={(value) => updateSession(session.id, "venue", value)}
                          disabled={venuesLoading || venuesError}
                        >
                          <SelectTrigger 
                            data-testid={`session-venue-${index}`}
                            className={!session.venue?.trim() ? 'border-red-500' : ''}
                          >
                            <SelectValue placeholder="Select venue" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {venueOptions.length === 0 ? (
                              <SelectItem disabled value="no-venues">
                                {venuesLoading
                                  ? "Loading venues..."
                                  : venuesError
                                    ? "Failed to load venues"
                                    : "No venues available"}
                              </SelectItem>
                            ) : (
                              venueOptions.map((venue) => (
                                <SelectItem key={venue} value={venue}>
                                  {venue}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {!session.venue?.trim() && (
                          <p className="text-sm text-red-500">Venue is required</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Session Date */}
                  <div className="space-y-2">
                    <Label htmlFor={`sessionDate-${session.id}`}>Session Date *</Label>
                    {isReadOnly ? (
                      <div className="px-3 py-2 bg-muted border rounded-md text-sm font-medium">
                        {isCustomDate 
                          ? new Date(session.sessionDate).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                          : parsedEventDates.find(d => d.value === session.sessionDate)?.label || session.sessionDate
                        }
                        {isCustomDate && <Badge variant="outline" className="ml-2 text-xs">Custom Date</Badge>}
                      </div>
                    ) : parsedEventDates.length > 0 ? (
                      <>
                        {isCustomDate ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                id={`sessionDate-${session.id}`}
                                type="date"
                                value={session.sessionDate || ""}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    updateSession(session.id, 'sessionDate', e.target.value);
                                  }
                                }}
                                className="flex-1 font-medium"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCustomDateSessions(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(session.id);
                                    return newSet;
                                  });
                                  if (parsedEventDates.length > 0) {
                                    updateSession(session.id, 'sessionDate', parsedEventDates[0].value);
                                  }
                                }}
                              >
                                Use Event Date
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              📅 Custom date selected. You can change it above or switch back to event dates.
                            </p>
                          </div>
                        ) : (
                          <>
                            <Select
                              value={session.sessionDate || ""}
                              onValueChange={(value) => {
                                if (value === "custom") {
                                  setCustomDateSessions(prev => new Set(prev).add(session.id));
                                  const currentDate = session.sessionDate ? new Date(session.sessionDate) : null;
                                  if (!currentDate || isNaN(currentDate.getTime())) {
                                    updateSession(session.id, 'sessionDate', new Date().toISOString().split('T')[0]);
                                  }
                                } else {
                                  setCustomDateSessions(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(session.id);
                                    return newSet;
                                  });
                                  updateSession(session.id, 'sessionDate', value);
                                }
                              }}
                            >
                              <SelectTrigger id={`sessionDate-${session.id}`}>
                                <SelectValue placeholder="Select session date" />
                              </SelectTrigger>
                              <SelectContent position="popper">
                                {parsedEventDates.map((dateOption, index) => (
                                  <SelectItem key={dateOption.value} value={dateOption.value}>
                                    Day {index + 1} • {dateOption.label}
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">
                                  📅 Custom Date
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              📅 Event runs from {parsedEventDates[0]?.label} to {parsedEventDates[parsedEventDates.length - 1]?.label} ({eventDuration} {eventDuration > 1 ? "days" : "day"})
                            </p>
                          </>
                        )}
                      </>
                    ) : (
                      <Input
                        id={`sessionDate-${session.id}`}
                        type="date"
                        value={session.sessionDate || ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateSession(session.id, 'sessionDate', e.target.value);
                          }
                        }}
                        min={eventStartDate}
                        max={eventEndDate}
                        disabled={isReadOnly}
                        className="font-medium"
                      />
                    )}
                  </div>
                </div>

                {/* Start & End Time */}
                {!isAllDaySession ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`startTime-${session.id}`}>Start Time *</Label>
                      {isReadOnly ? (
                        <div className="px-3 py-2 bg-muted border rounded-md text-sm font-medium">
                          {session.startTime || "Not specified"}
                        </div>
                      ) : (
                        <TimePicker
                          id={`startTime-${session.id}`}
                          value={session.startTime || ""}
                          onChange={(value) => updateSession(session.id, 'startTime', value)}
                          className={!session.startTime ? 'border-red-500' : ''}
                        />
                      )}
                      {!session.startTime && (
                        <p className="text-sm text-red-500">Start time is required</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`endTime-${session.id}`}>End Time *</Label>
                      {isReadOnly ? (
                        <div className="px-3 py-2 bg-muted border rounded-md text-sm font-medium">
                          {session.endTime || "Not specified"}
                        </div>
                      ) : (
                        <TimePicker
                          id={`endTime-${session.id}`}
                          value={session.endTime || ""}
                          onChange={(value) => updateSession(session.id, 'endTime', value)}
                          className={!session.endTime ? 'border-red-500' : ''}
                        />
                      )}
                      {!session.endTime && (
                        <p className="text-sm text-red-500">End time is required</p>
                      )}
                      {session.startTime && session.endTime && !validateSessionTime(session.startTime, session.endTime, isAllDaySession) && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-800 text-sm">
                            ⚠️ End time must be after start time
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-2 flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm text-primary">
                    <Clock className="h-4 w-4" />
                    <span>All-day session selected — timing details are not required.</span>
                  </div>
                )}

                {/* Special Instructions */}
                <div className="space-y-2">
                  <Label htmlFor={`specialInstructions-${session.id}`}>Special Instructions</Label>
                  {isReadOnly ? (
                    <div className="px-3 py-2 bg-muted border rounded-md text-sm min-h-[42px]">
                      {session.specialInstructions || "None"}
                    </div>
                  ) : (
                    <Input
                      id={`specialInstructions-${session.id}`}
                      value={session.specialInstructions || ''}
                      onChange={(e) => updateSession(session.id, 'specialInstructions', e.target.value)}
                      placeholder="Any special requirements or notes"
                      data-testid={`session-instructions-${index}`}
                    />
                  )}
                </div>

                {/* Error Messages */}
                {hasErrors && (
                  <div className="space-y-2">
                    {validationErrors.map((error, idx) => (
                      <Alert key={`validation-error-${idx}`} variant="destructive">
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ))}
                    {conflicts.map((conflict, idx) => (
                      <Alert key={`conflict-${idx}`} variant="destructive">
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>{conflict}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                {/* Session Summary Badge */}
                {!hasErrors && session.venue && (isAllDaySession || (session.startTime && session.endTime)) && (
                  <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      <MapPin className="w-3 h-3 mr-1" />
                      {session.venue}
                    </Badge>
                    {!isAllDaySession && session.startTime && session.endTime && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {session.startTime} - {session.endTime}
                      </Badge>
                    )}
                    {isAllDaySession && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        All Day
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sessions Summary */}
      {sessions.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">Sessions Summary</span>
            </div>
            <div className="space-y-1 text-sm text-blue-800">
              {sessions.map((session, index) => {
                const isAllDay = session.sessionLabel === ALL_DAY_LABEL;
                return (
                  <div key={session.id} className="flex items-center justify-between">
                    <span>
                      {session.sessionName || `Session ${index + 1}`} 
                      {session.sessionLabel && ` (${session.sessionLabel})`}
                    </span>
                    <span className="text-xs">
                      {session.venue} • {isAllDay ? 'All Day' : `${session.startTime}-${session.endTime}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}