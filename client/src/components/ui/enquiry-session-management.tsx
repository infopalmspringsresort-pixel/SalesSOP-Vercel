import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Clock, AlertTriangle, Calendar } from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import { z } from "zod";
import { useVenues } from "@/hooks/useVenues";

const ALL_DAY_LABEL = "All Day";

const DAY_SESSION_OPTIONS = [
  "Breakfast",
  "Lunch",
  "Hi-Tea",
  "Dinner",
  ALL_DAY_LABEL,
];

const sessionSchema = z
  .object({
    id: z.string(),
    sessionName: z.string().min(1, "Session name is required"),
    sessionLabel: z.string().optional(),
    venue: z.string().min(1, "Venue is required"),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    sessionDate: z.date(),
    paxCount: z.number().default(0),
    specialInstructions: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sessionLabel === ALL_DAY_LABEL) {
      return;
    }

    if (!data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "Start time is required",
      });
    }

    if (!data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "End time is required",
      });
    }
  });

interface EnquirySessionManagementProps {
  sessions: z.infer<typeof sessionSchema>[];
  setSessions: (sessions: z.infer<typeof sessionSchema>[]) => void;
  eventStartDate?: string;
  eventEndDate?: string;
  eventDuration?: number;
  eventDates?: string[];
  disabled?: boolean;
  hideHeader?: boolean; // Hide the internal header when parent provides its own
  sessionStartIndex?: number; // Optional starting index for session numbering
  singleSessionMode?: boolean; // When true, only allow editing the single session (no add/remove)
}

export default function EnquirySessionManagement({
  sessions,
  setSessions,
  eventStartDate,
  eventEndDate,
  eventDuration = 1,
  eventDates = [],
  disabled = false,
  hideHeader = false,
  sessionStartIndex = 0,
  singleSessionMode = false
}: EnquirySessionManagementProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Track which sessions are using custom dates (not from event dates)
  const [customDateSessions, setCustomDateSessions] = useState<Set<string>>(new Set());
  
  const { data: venues = [], isLoading: venuesLoading, isError: venuesError } = useVenues();

  // Helper function to calculate duration between two times
  const calculateDuration = (startTime?: string, endTime?: string): string => {
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

  // Don't auto-add first session - user must click "Add Session" button

  const parsedEventDates = useMemo(() => {
    return (eventDates || [])
      .map((date) => {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return null;
        }
        const value = parsed.toISOString().split('T')[0];
        return {
          value,
          label: parsed.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
        };
      })
      .filter((dateOption): dateOption is { value: string; label: string } => Boolean(dateOption));
  }, [eventDates]);

  // Auto-detect sessions with dates outside event dates and mark them as custom
  useEffect(() => {
    if (parsedEventDates.length === 0) return;
    
    const eventDateValues = new Set(parsedEventDates.map(d => d.value));
    setCustomDateSessions(prev => {
      const newSet = new Set(prev);
      sessions.forEach(session => {
        if (!session.sessionDate) return;
        const sessionDateStr = session.sessionDate instanceof Date 
          ? session.sessionDate.toISOString().split('T')[0]
          : new Date(session.sessionDate).toISOString().split('T')[0];
        
        if (!eventDateValues.has(sessionDateStr)) {
          newSet.add(session.id);
        }
      });
      return newSet;
    });
  }, [sessions, parsedEventDates]);

  const getDefaultSessionDate = () => {
    if (parsedEventDates.length > 0) {
      return new Date(parsedEventDates[0].value);
    }

    if (eventStartDate) {
      const start = new Date(eventStartDate);
      if (!isNaN(start.getTime())) {
        return start;
      }
    }

    return new Date();
  };

  const addSession = () => {
    const newSession = {
      id: Math.random().toString(36).substr(2, 9),
      sessionName: "",
      sessionLabel: "",
      venue: "",
      startTime: "",
      endTime: "",
      sessionDate: getDefaultSessionDate(),
      paxCount: 0,
      specialInstructions: "",
    };
    setSessions([...sessions, newSession]);
  };

  const removeSession = (sessionId: string) => {
    setSessions(sessions.filter(s => s.id !== sessionId));
    // Clean up custom date tracking
    setCustomDateSessions(prev => {
      const newSet = new Set(prev);
      newSet.delete(sessionId);
      return newSet;
    });
  };

  const updateSession = (sessionId: string, field: keyof z.infer<typeof sessionSchema>, value: unknown) => {
    // Compute the updated sessions array first
    const updatedSessions = sessions.map(session => {
      if (session.id === sessionId) {
        const updated = { ...session, [field]: value };
        // Ensure sessionDate is always a Date object
        if (field === 'sessionDate' && !(updated.sessionDate instanceof Date)) {
          updated.sessionDate = new Date(updated.sessionDate);
        }
        return updated;
      }
      return session;
    });
    
    // Pass the array directly, not a function
    setSessions(updatedSessions);
  };

  const validateSessionTime = (startTime?: string, endTime?: string, isAllDay?: boolean) => {
    if (isAllDay) return true;
    if (!startTime || !endTime) return true;
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return endMinutes > startMinutes;
  };

  const getSessionDate = (session: z.infer<typeof sessionSchema>) => {
    if (!session.sessionDate) return '';
    
    if (eventStartDate && eventEndDate && eventDuration > 1) {
      // For multi-day events, show which day this session is for
      const startDate = new Date(eventStartDate);
      const sessionDate = session.sessionDate instanceof Date ? session.sessionDate : new Date(session.sessionDate);
      if (isNaN(sessionDate.getTime())) return '';
      const dayDiff = Math.ceil((sessionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return `Day ${dayDiff} of ${eventDuration}`;
    }
    const sessionDate = session.sessionDate instanceof Date ? session.sessionDate : new Date(session.sessionDate);
    if (isNaN(sessionDate.getTime())) return '';
    return sessionDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="space-y-4 relative z-50" style={{ pointerEvents: 'auto', position: 'relative' }}>
      {sessions.length === 0 ? (
        // Show only the "Add Session" button when no sessions exist (unless header is hidden or single session mode)
        !hideHeader ? (
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Event Sessions</Label>
            {!disabled && !singleSessionMode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSession}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Session
              </Button>
            )}
          </div>
        ) : (
          // When header is hidden and no sessions, show empty state
          <div className="text-center py-8 text-muted-foreground">
            <p>Click "Add Session" above to create your first session</p>
          </div>
        )
      ) : (
        // Show session details when sessions exist
        <>
          {!hideHeader && (
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Event Sessions</Label>
              {!disabled && !singleSessionMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSession}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Session
                </Button>
              )}
            </div>
          )}

          {sessions.map((session, index) => {
            const isAllDaySession = session.sessionLabel === ALL_DAY_LABEL;

            return (
              <div key={session.id} className="border border-gray-200 rounded-lg p-4 space-y-4 relative z-50" style={{ pointerEvents: 'auto' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Session {sessionStartIndex + index + 1}
              </Badge>
              {eventStartDate && eventEndDate && eventDuration > 1 && (
                <Badge variant="secondary" className="text-xs">
                  {getSessionDate(session)}
                </Badge>
              )}
            </div>
            {!disabled && !singleSessionMode && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSession(session.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="Delete session"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Session Name */}
            <div className="space-y-2">
              <Label htmlFor={`sessionName-${session.id}`}>Session Name *</Label>
              <Input
                id={`sessionName-${session.id}`}
                value={session.sessionName || ""}
                onChange={(e) => updateSession(session.id, "sessionName", e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Enter session title (e.g., Welcome Ceremony)"
                disabled={disabled}
                className="pointer-events-auto relative z-50"
                autoFocus={index === 0 && !session.sessionName}
                style={{ pointerEvents: 'auto', zIndex: 50 }}
              />
            </div>

            {/* Day Session */}
            <div className="space-y-2">
              <Label htmlFor={`daySession-${session.id}`}>Day Session *</Label>
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
                  setSessions(updatedSessions);
                }}
                disabled={disabled}
              >
                <SelectTrigger 
                  id={`daySession-${session.id}`} 
                  className="w-full"
                  onClick={(e) => e.stopPropagation()}
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
            </div>

            {/* Venue */}
            <div className="space-y-2">
              <Label htmlFor={`venue-${session.id}`}>Venue *</Label>
              <Select
                value={session.venue}
                onValueChange={(value) => updateSession(session.id, "venue", value)}
                disabled={disabled || venuesLoading || venuesError}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select venue" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {venues.length === 0 ? (
                    <SelectItem disabled value="no-venues">
                      {venuesLoading
                        ? "Loading venues..."
                        : venuesError
                          ? "Failed to load venues"
                          : "No venues available"}
                    </SelectItem>
                  ) : (
                    venues.map((venue) => (
                      <SelectItem key={venue.id ?? venue.name} value={venue.name}>
                        {venue.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Session Date */}
            <div className="space-y-2">
              <Label htmlFor={`sessionDate-${session.id}`}>Session Date *</Label>
              {parsedEventDates.length > 0 ? (
                <>
                  {customDateSessions.has(session.id) ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          id={`sessionDate-${session.id}`}
                          type="date"
                          value={session.sessionDate ? (session.sessionDate instanceof Date ? session.sessionDate.toISOString().split('T')[0] : new Date(session.sessionDate).toISOString().split('T')[0]) : ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateSession(session.id, 'sessionDate', new Date(e.target.value));
                            }
                          }}
                          disabled={disabled}
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
                            // Reset to first event date when switching back
                            if (parsedEventDates.length > 0) {
                              updateSession(session.id, 'sessionDate', new Date(parsedEventDates[0].value));
                            }
                          }}
                          disabled={disabled}
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
                        value={session.sessionDate ? (session.sessionDate instanceof Date ? session.sessionDate.toISOString().split('T')[0] : new Date(session.sessionDate).toISOString().split('T')[0]) : ""}
                        onValueChange={(value) => {
                          if (value === "custom") {
                            // Switch to custom date input
                            setCustomDateSessions(prev => new Set(prev).add(session.id));
                            // Set to today's date or keep current if valid
                            const currentDate = session.sessionDate instanceof Date ? session.sessionDate : (session.sessionDate ? new Date(session.sessionDate) : null);
                            if (!currentDate || isNaN(currentDate.getTime())) {
                              updateSession(session.id, 'sessionDate', new Date());
                            }
                            // Note: Date input will be shown, user can select date there
                          } else {
                            // Regular event date selected
                            setCustomDateSessions(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(session.id);
                              return newSet;
                            });
                            updateSession(session.id, 'sessionDate', new Date(value));
                          }
                        }}
                        disabled={disabled}
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
                  value={session.sessionDate ? (session.sessionDate instanceof Date ? session.sessionDate.toISOString().split('T')[0] : new Date(session.sessionDate).toISOString().split('T')[0]) : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      updateSession(session.id, 'sessionDate', new Date(e.target.value));
                    }
                  }}
                  min={eventStartDate}
                  max={eventEndDate}
                  disabled={disabled}
                  className="font-medium"
                />
              )}
            </div>

            {/* Start & End Time */}
            {!isAllDaySession ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor={`startTime-${session.id}`}>Start Time *</Label>
                  <TimePicker
                    id={`startTime-${session.id}`}
                    value={session.startTime || ""}
                    onChange={(value) => updateSession(session.id, 'startTime', value)}
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`endTime-${session.id}`}>End Time *</Label>
                  <TimePicker
                    id={`endTime-${session.id}`}
                    value={session.endTime || ""}
                    onChange={(value) => updateSession(session.id, 'endTime', value)}
                    disabled={disabled}
                  />
                  {session.startTime && session.endTime && !validateSessionTime(session.startTime, session.endTime, isAllDaySession) && (
                    <Alert className="border-red-200 bg-red-50">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800 text-sm">
                        ⚠️ End time must be after start time
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </>
            ) : (
              <div className="md:col-span-2 flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm text-primary">
                <Clock className="h-4 w-4" />
                <span>All-day session selected — timing details are not required.</span>
              </div>
            )}

          </div>

          {/* Special Instructions */}
          <div className="space-y-2">
            <Label htmlFor={`specialInstructions-${session.id}`}>Special Instructions</Label>
            <Input
              id={`specialInstructions-${session.id}`}
              value={session.specialInstructions || ''}
              onChange={(e) => updateSession(session.id, 'specialInstructions', e.target.value)}
              placeholder="Any special requirements or notes"
              disabled={disabled}
            />
          </div>
              </div>
            );
          })}
          {/* Don't show "Add Session" button when header is hidden - only one session at a time */}
        </>
      )}
    </div>
  );
}

