import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, MapPin, Users, Phone, Mail, FileText, Edit, RotateCcw, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/utils/dateFormat";
import { getStatusColor, getStatusLabel, bookingUpdateOptions } from "@/lib/status-utils";
import { format } from "date-fns";
import EnquirySessionManagement from "@/components/ui/enquiry-session-management";
import { z } from "zod";
interface BookingDetailsDialogProps {
  booking: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const DAY_SESSION_ORDER: Record<string, number> = {
  Breakfast: 0,
  Lunch: 1,
  "Hi-Tea": 2,
  Dinner: 3,
  "All Day": 4,
};

export default function BookingDetailsDialog({ booking, open, onOpenChange }: BookingDetailsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationReasonNotes, setCancellationReasonNotes] = useState("");
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [showReopenRequest, setShowReopenRequest] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenComments, setReopenComments] = useState("");

  // Session management state
  const [sessions, setSessions] = useState<any[]>([]);
  const [isEditingSessions, setIsEditingSessions] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionData, setEditingSessionData] = useState<any>(null);
  const [isNewSession, setIsNewSession] = useState(false);
  const isEditingRef = useRef(false);

  // Fetch booking audit log
  const { data: auditLog = [] } = useQuery<any[]>({
    queryKey: [`/api/bookings/${booking?.id}/audit-log`],
    enabled: !!booking && open,
  });

  // Load sessions when booking data changes
  useEffect(() => {
    if (isEditingRef.current) {
      return; // Don't reset if we're editing
    }
    
    if (booking?.sessions) {
      const loadedSessions = booking.sessions
        .map((session: any) => ({
          ...session,
          id: session.id || session._id || Math.random().toString(36).substr(2, 9),
          sessionDate: session.sessionDate instanceof Date 
            ? session.sessionDate 
            : new Date(session.sessionDate)
        }))
        .filter((session: any) => {
          return session.sessionName && 
                 session.venue && 
                 session.startTime && 
                 session.endTime;
        });
      
      setSessions(loadedSessions);
      setIsEditingSessions(false);
      setEditingSessionId(null);
    } else {
      setSessions([]);
      setIsEditingSessions(false);
      setEditingSessionId(null);
    }
  }, [booking]);

  // Reset edit state when dialog closes
  useEffect(() => {
    if (!open) {
      setEditingSessionId(null);
      setEditingSessionData(null);
      setIsNewSession(false);
      setIsEditingSessions(false);
      isEditingRef.current = false;
    }
  }, [open]);

  // Update sessions mutation
  const updateSessionsMutation = useMutation({
    mutationFn: async ({ updatedSessions, isDelete = false }: { updatedSessions: any[], isDelete?: boolean }) => {
      if (!booking?.id) {
        throw new Error('Booking ID is required');
      }
      
      // Filter out incomplete sessions (those without required fields)
      const validSessions = updatedSessions.filter(session => 
        session.sessionName && 
        session.venue && 
        session.startTime && 
        session.endTime
      );

      const response = await apiRequest("PATCH", `/api/bookings/${booking.id}`, {
        sessions: validSessions.map(session => ({
          sessionName: session.sessionName,
          sessionLabel: session.sessionLabel || null,
          venue: session.venue,
          startTime: session.startTime,
          endTime: session.endTime,
          sessionDate: session.sessionDate instanceof Date 
            ? session.sessionDate.toISOString() 
            : new Date(session.sessionDate).toISOString(),
          paxCount: session.paxCount || 0,
          specialInstructions: session.specialInstructions || null,
        }))
      });
      const responseData = await response.json();
      return { ...responseData, isDelete };
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.isDelete ? "Session deleted successfully" : "Sessions updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${booking?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setIsEditingSessions(false);
      setEditingSessionId(null);
      setEditingSessionData(null);
      setIsNewSession(false);
      isEditingRef.current = false;
    },
    onError: (error: any) => {
      console.error('Session update error:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update sessions. Please check that all required fields are filled.',
        variant: 'destructive',
      });
    },
  });

  const eventStartMidnight = useMemo(() => {
    if (!booking?.eventDate) return undefined;
    const start = new Date(booking.eventDate);
    if (isNaN(start.getTime())) return undefined;
    start.setHours(0, 0, 0, 0);
    return start;
  }, [booking?.eventDate]);

  const sessionNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    const sessionsToCount = isNewSession && editingSessionData && !sessions.find(s => {
      const sId = s.id || (s as any)._id;
      return sId === editingSessionId;
    })
      ? [...sessions, editingSessionData]
      : sessions;
    sessionsToCount.forEach((session, index) => {
      const sessionId = session.id || (session as any)._id || `temp-${index}`;
      map.set(sessionId, index + 1);
    });
    return map;
  }, [sessions, isNewSession, editingSessionData, editingSessionId]);

  // Update booking status mutation
  const updateBookingMutation = useMutation({
    mutationFn: async (data: { status: string; notes?: string; cancellationReason?: string }) => {
      if (!booking) throw new Error('No booking selected');
      const response = await apiRequest("PATCH", `/api/bookings/${booking.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
      setShowStatusChange(false);
      setNewStatus('');
      setNotes('');
      setCancellationReason('');
      setCancellationReasonNotes('');
      toast({
        title: "Success",
        description: "Booking status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update booking status",
        variant: "destructive",
      });
    },
  });

  // Request reopen booking mutation
  const requestReopenMutation = useMutation({
    mutationFn: async (data: { reason: string; comments: string }) => {
      if (!booking) throw new Error('No booking selected');
      const response = await apiRequest("POST", `/api/bookings/${booking.id}/request-reopen`, data);
      return response.json();
    },
    onSuccess: () => {
      setShowReopenRequest(false);
      setReopenReason("");
      setReopenComments("");
      toast({
        title: "Success",
        description: "Reopen request submitted for admin approval",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit reopen request",
        variant: "destructive",
      });
    },
  });

  const handleStatusUpdate = () => {
    if (!newStatus) {
      toast({
        title: "Error",
        description: "Please select a status",
        variant: "destructive"
      });
      return;
    }

    // Require cancellation reason if status is cancelled
    if (newStatus === 'cancelled' && !cancellationReason) {
      toast({
        title: "Error",
        description: "Cancellation reason is required when cancelling a booking",
        variant: "destructive"
      });
      return;
    }

    // Require notes for specific cancellation reasons
    if (newStatus === 'cancelled' && cancellationReason === 'other' && !cancellationReasonNotes.trim()) {
      toast({
        title: "Error",
        description: "Additional notes are required for the selected cancellation reason",
        variant: "destructive"
      });
      return;
    }

    const updateData: any = { status: newStatus, notes };
    if (newStatus === 'cancelled') {
      updateData.cancellationReason = cancellationReason;
      if (cancellationReason === 'other' && cancellationReasonNotes.trim()) {
        updateData.cancellationReasonNotes = cancellationReasonNotes.trim();
      }
    }

    updateBookingMutation.mutate(updateData);
  };

  const handleReopenRequest = () => {
    if (!reopenReason) {
      toast({
        title: "Error",
        description: "Please select a reason for reopening",
        variant: "destructive"
      });
      return;
    }

    requestReopenMutation.mutate({
      reason: reopenReason,
      comments: reopenComments,
    });
  };

  if (!booking) return null;

  const getSourceLabel = (source: string) => {
    // Source values are now stored as display names, so return as-is
    return source;
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[98vw] sm:w-[95vw] md:w-full max-h-[95vh] overflow-y-auto touch-manipulation">
        <DialogHeader className="space-y-2 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="truncate">Booking Details - {booking.bookingNumber}</span>
          </DialogTitle>
          <DialogDescription className="text-sm">
            Complete information about this booking
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9 sm:h-10">
            <TabsTrigger value="details" data-testid="tab-booking-details" className="text-xs sm:text-sm">
              Booking Details
            </TabsTrigger>
            <TabsTrigger value="sessions" data-testid="tab-booking-sessions" className="text-xs sm:text-sm">
              Sessions
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-booking-history" className="text-xs sm:text-sm">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            {/* Change Status Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {!booking.statusChanged ? (
                  <Button 
                    variant="outline"
                    className="flex items-center justify-center gap-2 w-full sm:w-auto" 
                    data-testid="button-change-status"
                    onClick={() => setShowStatusChange(true)}
                    size="sm"
                  >
                    <Edit className="w-4 h-4" />
                    <span className="hidden sm:inline">Change Status</span>
                    <span className="sm:hidden">Status</span>
                  </Button>
                ) : (
                  <Button 
                    variant="outline"
                    className="flex items-center justify-center gap-2 w-full sm:w-auto" 
                    data-testid="button-request-reopen"
                    onClick={() => setShowReopenRequest(true)}
                    size="sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">Request Reopen</span>
                    <span className="sm:hidden">Reopen</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Label className="font-medium text-sm">Booking Date:</Label>
                    <span className="text-sm">{format(new Date(booking.createdAt), "dd MMMM, yyyy")}</span>
                    <Badge className={getStatusColor(booking.status || "booked")} variant="secondary">
                      {getStatusLabel(booking.status || "booked")}
                    </Badge>
                  </div>

                  <Separator />

                  <div className="flex items-center gap-2">
                    <Label className="font-medium text-sm">Client Name:</Label>
                    <span className="text-sm">{booking.clientName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Label className="font-medium text-sm">Contact:</Label>
                    <a 
                      href={`tel:${booking.contactNumber}`} 
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
                      data-testid="link-contact-number"
                      title="Click to call"
                    >
                      {booking.contactNumber}
                    </a>
                  </div>

                  {booking.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Label className="font-medium text-sm">Email:</Label>
                      <span className="text-sm">{booking.email}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Label className="font-medium text-sm">Source:</Label>
                    <span className="text-sm">{getSourceLabel(booking.enquirySource || 'direct')}</span>
                  </div>

                  {booking.enquiryNumber && (
                    <div className="flex items-center gap-2">
                      <Label className="font-medium text-sm">Enquiry Number:</Label>
                      <span className="text-sm font-mono">{booking.enquiryNumber}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Label className="font-medium text-sm">Salesperson:</Label>
                    <span className="text-sm">
                      {booking.salesperson?.firstName && booking.salesperson?.lastName ? 
                        `${booking.salesperson.firstName} ${booking.salesperson.lastName}` : 
                        'TBD'
                      }
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Event Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Event Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Label className="font-medium text-sm">Event Date{booking.eventDuration > 1 ? 's' : ''}:</Label>
                    <span className="text-sm">
                      {booking.eventDuration > 1 && booking.eventEndDate ? (
                        `${formatDate(booking.eventDate)} to ${formatDate(booking.eventEndDate)}`
                      ) : (
                        formatDate(booking.eventDate)
                      )}
                    </span>
                    {booking.eventDuration > 1 && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium text-xs">
                        ({booking.eventDuration} Day Event)
                      </span>
                    )}
                  </div>

                  {/* Show all event dates for multi-day events */}
                  {booking.eventDuration > 1 && (
                    <div className="flex items-start gap-2">
                      <Label className="font-medium text-sm">All Event Dates:</Label>
                      <div className="flex flex-wrap gap-1">
                        {booking.eventDates && Array.isArray(booking.eventDates) && booking.eventDates.length > 0 ? (
                          booking.eventDates.map((date: string, index: number) => (
                            <Badge key={index} variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              Day {index + 1}: {formatDate(date)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Event dates not available</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Label className="font-medium text-sm">Event Type:</Label>
                    <span className="text-sm">{booking.eventType?.replace('_', ' ') || 'Event'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Label className="font-medium text-sm">Confirmed Pax:</Label>
                    <span className="text-sm">{booking.confirmedPax}</span>
                  </div>

                  {booking.hall && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Label className="font-medium text-sm">Venue:</Label>
                      <span className="text-sm">{booking.hall}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Label className="font-medium text-sm">Contract Status:</Label>
                    <span className={`text-sm font-medium ${booking.contractSigned ? 'text-green-600' : 'text-orange-600'}`}>
                      {booking.contractSigned ? '✓ Contract Signed' : 'Pending Contract'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions" className="space-y-4 min-h-[500px] relative z-10" style={{ pointerEvents: 'auto' }}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Event Sessions</h3>
                <p className="text-sm text-muted-foreground">
                  Manage venue sessions and event details
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const newSessionId = Math.random().toString(36).substr(2, 9);
                    const newSession = {
                      id: newSessionId,
                      sessionName: "",
                      sessionLabel: "",
                      venue: "",
                      startTime: "",
                      endTime: "",
                      sessionDate: booking?.eventDate ? new Date(booking.eventDate) : new Date(),
                      paxCount: 0,
                      specialInstructions: "",
                    };
                    setEditingSessionData(newSession);
                    setEditingSessionId(newSessionId);
                    setIsNewSession(true);
                    setIsEditingSessions(true);
                  }}
                  className="flex items-center gap-2"
                  disabled={!!editingSessionId}
                >
                  <Plus className="w-4 h-4" />
                  Add Session
                </Button>
              </div>
            </div>

            <div className="space-y-4 relative z-10">
              {(sessions.length > 0 || (isNewSession && editingSessionData)) ? (
                <div className="space-y-6 relative z-10">
                  {(() => {
                    // Include the new session being edited in the list if it exists
                    const sessionsToDisplay = isNewSession && editingSessionData && !sessions.find(s => {
                      const sId = s.id || (s as any)._id;
                      return sId === editingSessionId;
                    })
                      ? [...sessions, editingSessionData]
                      : sessions;
                    
                    // Recalculate grouped sessions with the new session included
                    const displayGroupedSessions = (() => {
                      if (!sessionsToDisplay.length) return [];
                      
                      const groupMap = new Map<string, {
                        displayDate: Date;
                        sessions: any[];
                      }>();
                      
                      sessionsToDisplay.forEach((session) => {
                        const rawDate = session.sessionDate instanceof Date
                          ? new Date(session.sessionDate)
                          : new Date(session.sessionDate);
                        
                        if (isNaN(rawDate.getTime())) return;
                        
                        const dateKey = rawDate.toISOString().split("T")[0];
                        if (!groupMap.has(dateKey)) {
                          groupMap.set(dateKey, {
                            displayDate: new Date(rawDate),
                            sessions: [],
                          });
                        }
                        groupMap.get(dateKey)!.sessions.push(session);
                      });
                      
                      const sortedGroups = Array.from(groupMap.entries())
                        .map(([key, value]) => ({
                          key,
                          ...value,
                        }))
                        .sort((a, b) => {
                          const aDate = new Date(`${a.key}T00:00:00`);
                          const bDate = new Date(`${b.key}T00:00:00`);
                          return aDate.getTime() - bDate.getTime();
                        });
                      
                      return sortedGroups.map(({ key, displayDate, sessions: groupSessions }) => {
                        const normalizedDate = new Date(`${key}T00:00:00`);
                        const dayNumber = eventStartMidnight
                          ? Math.floor((normalizedDate.getTime() - eventStartMidnight.getTime()) / DAY_IN_MS) + 1
                          : undefined;
                        
                        const formattedDate = displayDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                        
                        const title = dayNumber ? `Day ${dayNumber} • ${formattedDate}` : formattedDate;
                        
                        const sortedSessionsForDay = [...groupSessions].sort((a, b) => {
                          const orderA = a.sessionLabel && DAY_SESSION_ORDER[a.sessionLabel] !== undefined
                            ? DAY_SESSION_ORDER[a.sessionLabel]
                            : Number.MAX_SAFE_INTEGER;
                          const orderB = b.sessionLabel && DAY_SESSION_ORDER[b.sessionLabel] !== undefined
                            ? DAY_SESSION_ORDER[b.sessionLabel]
                            : Number.MAX_SAFE_INTEGER;
                          
                          if (orderA !== orderB) return orderA - orderB;
                          
                          if (a.startTime && b.startTime) {
                            const timeDiff = a.startTime.localeCompare(b.startTime);
                            if (timeDiff !== 0) return timeDiff;
                          }
                          
                          return (a.sessionName || "").localeCompare(b.sessionName || "");
                        });
                        
                        return {
                          key,
                          title,
                          dayNumber,
                          date: displayDate,
                          sessions: sortedSessionsForDay,
                        };
                      });
                    })();
                    
                    return (displayGroupedSessions.length > 0
                      ? displayGroupedSessions
                      : [{ key: "ungrouped", title: "", dayNumber: undefined, sessions: sessionsToDisplay }]).map(
                      (group: any, groupIndex: number) => (
                      <div key={group.key ?? groupIndex} className="space-y-3 relative z-10">
                        {group.title ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="px-2 py-1 text-xs font-semibold">
                              {group.dayNumber ? `Day ${group.dayNumber}` : "Session Date"}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{group.title}</span>
                          </div>
                        ) : null}
                        <div className="space-y-3 relative z-10">
                          {group.sessions.map((session: any, innerIndex: number) => {
                            const sessionId = session.id || (session as any)._id || `temp-${innerIndex}`;
                            const sessionNumber = sessionNumberMap.get(sessionId) ?? innerIndex + 1;
                            const isBeingEdited =
                              editingSessionId !== null &&
                              editingSessionId !== undefined &&
                              editingSessionId === sessionId;

                            if (isBeingEdited) {
                              // Use the local editing state if available, otherwise fall back to session from state
                              const currentSessionInState = editingSessionData || sessions.find((s) => {
                                const sId = s.id || (s as any)._id;
                                return sId === editingSessionId;
                              }) || session;
                              
                              // Ensure session has all required fields before editing
                              const sessionToEdit = {
                                id: sessionId,
                                sessionName: currentSessionInState.sessionName || "",
                                sessionLabel: currentSessionInState.sessionLabel || "",
                                venue: currentSessionInState.venue || "",
                                startTime: currentSessionInState.startTime || "",
                                endTime: currentSessionInState.endTime || "",
                                sessionDate: currentSessionInState.sessionDate 
                                  ? (currentSessionInState.sessionDate instanceof Date 
                                      ? currentSessionInState.sessionDate 
                                      : new Date(currentSessionInState.sessionDate))
                                  : (booking?.eventDate ? new Date(booking.eventDate) : new Date()),
                                paxCount: currentSessionInState.paxCount ?? 0,
                                specialInstructions: currentSessionInState.specialInstructions || ""
                              };
                              
                              return (
                                <Card key={sessionId} className="relative z-50" style={{ pointerEvents: 'auto' }}>
                                  <CardContent className="p-4 relative z-50" style={{ pointerEvents: 'auto' }}>
                                    <EnquirySessionManagement
                                      sessions={[sessionToEdit]}
                                      disabled={false}
                                      setSessions={(newSessions) => {
                                        // Only update the local editing state, don't modify sessions array until save
                                        if (newSessions && newSessions.length === 1 && newSessions[0]) {
                                          const newSession = newSessions[0];
                                          
                                          // Update only the local editing state, not the main sessions array
                                          const updatedSession = { 
                                            ...(editingSessionData || sessionToEdit),
                                            ...newSession,
                                            id: sessionId,
                                            sessionName: newSession.sessionName !== undefined ? newSession.sessionName : (editingSessionData?.sessionName || sessionToEdit.sessionName || ""),
                                            venue: newSession.venue !== undefined ? newSession.venue : (editingSessionData?.venue || sessionToEdit.venue || ""),
                                            sessionDate: newSession.sessionDate || editingSessionData?.sessionDate || sessionToEdit.sessionDate || (booking?.eventDate ? new Date(booking.eventDate) : new Date()),
                                            startTime: newSession.startTime !== undefined ? newSession.startTime : (editingSessionData?.startTime || sessionToEdit.startTime || ""),
                                            endTime: newSession.endTime !== undefined ? newSession.endTime : (editingSessionData?.endTime || sessionToEdit.endTime || ""),
                                            sessionLabel: newSession.sessionLabel !== undefined ? newSession.sessionLabel : (editingSessionData?.sessionLabel || sessionToEdit.sessionLabel || ""),
                                            paxCount: newSession.paxCount !== undefined ? newSession.paxCount : (editingSessionData?.paxCount ?? sessionToEdit.paxCount ?? 0),
                                            specialInstructions: newSession.specialInstructions !== undefined ? newSession.specialInstructions : (editingSessionData?.specialInstructions || sessionToEdit.specialInstructions || "")
                                          };
                                          
                                          // Update local editing state only
                                          setEditingSessionData(updatedSession);
                                        }
                                      }}
                                      eventStartDate={
                                        booking?.eventDate
                                          ? new Date(booking.eventDate).toISOString().split("T")[0]
                                          : undefined
                                      }
                                      eventEndDate={
                                        booking?.eventEndDate
                                          ? new Date(booking.eventEndDate).toISOString().split("T")[0]
                                          : undefined
                                      }
                                      eventDuration={booking?.eventDuration || 1}
                                      eventDates={
                                        Array.isArray(booking?.eventDates)
                                          ? (booking?.eventDates || [])
                                              .map((date: any) => {
                                                const parsed = new Date(date);
                                                return isNaN(parsed.getTime())
                                                  ? null
                                                  : parsed.toISOString().split("T")[0];
                                              })
                                              .filter((value): value is string => Boolean(value))
                                          : []
                                      }
                                      hideHeader={true}
                                      sessionStartIndex={Math.max(sessionNumber - 1, 0)}
                                      singleSessionMode={true}
                                    />
                                    <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                                      <Button
                                        variant="outline"
                                        onClick={() => {
                                          if (isNewSession) {
                                            // Just clear the editing state
                                          } else {
                                            // For existing sessions, restore from original booking.sessions
                                            if (booking?.sessions) {
                                              const originalSession = booking.sessions.find((s: any) => {
                                                const sId = (s as any).id || (s as any)._id;
                                                return sId === editingSessionId;
                                              });
                                              if (originalSession) {
                                                setSessions((prevSessions) =>
                                                  prevSessions.map((s) => {
                                                    const sId = s.id || (s as any)._id;
                                                    return sId === editingSessionId
                                                      ? {
                                                          ...originalSession,
                                                          id: editingSessionId,
                                                          sessionDate: new Date(
                                                            (originalSession as any).sessionDate
                                                          ),
                                                        }
                                                      : s;
                                                  })
                                                );
                                              }
                                            }
                                          }
                                          // Clear editing state
                                          setEditingSessionId(null);
                                          setEditingSessionData(null);
                                          setIsNewSession(false);
                                          setIsEditingSessions(false);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        onClick={() => {
                                          // Use the local editing state (which has the latest changes)
                                          const sessionToSave = editingSessionData || sessions.find((s) => {
                                            const sId = s.id || (s as any)._id;
                                            return sId === editingSessionId;
                                          });
                                          
                                          if (
                                            sessionToSave?.sessionName &&
                                            sessionToSave?.venue &&
                                            sessionToSave?.startTime &&
                                            sessionToSave?.endTime
                                          ) {
                                            // Build the updated sessions array
                                            let updatedSessions: any[];
                                            
                                            if (isNewSession) {
                                              // Add the new session to the array
                                              updatedSessions = [...sessions, sessionToSave];
                                            } else {
                                              // Update existing session in the array
                                              updatedSessions = sessions.map((s) => {
                                                const sId = s.id || (s as any)._id;
                                                if (sId === editingSessionId) {
                                                  return sessionToSave;
                                                }
                                                return s;
                                              });
                                            }
                                            
                                            // Save to server
                                            updateSessionsMutation.mutate({ updatedSessions, isDelete: false }, {
                                              onSuccess: () => {
                                                // Clear editing state after successful save
                                                setEditingSessionId(null);
                                                setEditingSessionData(null);
                                                setIsNewSession(false);
                                                setIsEditingSessions(false);
                                              }
                                            });
                                          } else {
                                            toast({
                                              title: "Cannot save",
                                              description: "Please fill in all required fields for this session.",
                                              variant: "destructive",
                                            });
                                          }
                                        }}
                                        disabled={updateSessionsMutation.isPending}
                                      >
                                        {updateSessionsMutation.isPending ? "Saving..." : "Save Session"}
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            }

                            const isComplete =
                              session.sessionName && session.venue && session.startTime && session.endTime;

                            return (
                              <Card key={sessionId}>
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline">Session {sessionNumber}</Badge>
                                        {session.sessionLabel && (
                                          <Badge variant="secondary">
                                            {session.sessionLabel}
                                          </Badge>
                                        )}
                                      </div>
                                      {isComplete ? (
                                        <>
                                          <h4 className="font-medium text-lg">{session.sessionName}</h4>
                                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                              <MapPin className="w-4 h-4" />
                                              <span className="font-medium">{session.venue}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <Clock className="w-4 h-4" />
                                              {session.sessionLabel === "All Day" 
                                                ? "All Day" 
                                                : `${session.startTime} - ${session.endTime}`}
                                            </div>
                                            {(session.paxCount || booking.confirmedPax) && (
                                              <div className="flex items-center gap-1">
                                                <Users className="w-4 h-4" />
                                                {session.paxCount || booking.confirmedPax} guests
                                              </div>
                                            )}
                                          </div>
                                          {session.specialInstructions && (
                                            <div className="mt-3 pt-3 border-t">
                                              <p className="text-sm">
                                                <strong className="text-foreground">Special Instructions:</strong>
                                              </p>
                                              <p className="text-sm text-muted-foreground mt-1">
                                                {session.specialInstructions}
                                              </p>
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="text-sm text-muted-foreground italic">
                                          Click Edit to fill in session details
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (sessionId) {
                                            // Initialize editing state with current session data
                                            const sessionToEdit = sessions.find((s) => {
                                              const sId = s.id || (s as any)._id;
                                              return sId === sessionId;
                                            });
                                            if (sessionToEdit) {
                                              setEditingSessionData({ ...sessionToEdit });
                                            }
                                            setEditingSessionId(sessionId);
                                            setIsNewSession(false);
                                            setIsEditingSessions(true);
                                            isEditingRef.current = true;
                                          }
                                        }}
                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        title="Edit this session"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          // Filter out the session being deleted
                                          const updatedSessions = sessions.filter((existing) => {
                                            const existingId = existing.id || (existing as any)._id || "";
                                            return existingId !== sessionId;
                                          });
                                          
                                          // Also clear editing state if we're deleting the session being edited
                                          if (editingSessionId === sessionId) {
                                            setEditingSessionId(null);
                                            setEditingSessionData(null);
                                            setIsNewSession(false);
                                            setIsEditingSessions(false);
                                          }
                                          
                                          // Delete the session
                                          updateSessionsMutation.mutate({ updatedSessions, isDelete: true });
                                        }}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        title="Delete session"
                                        disabled={updateSessionsMutation.isPending}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                      )
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p>No sessions added yet</p>
                  <p className="text-xs mt-1">Click "Add Session" above to create your first session</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="history" className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-4">Booking History</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Complete timeline of status changes and modifications
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Change Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {auditLog && auditLog.length > 0 ? (
                  <div className="space-y-4">
                    {auditLog.map((log: any, index: number) => (
                      <div 
                        key={log.id} 
                        className="border-l-4 border-blue-200 pl-4 py-2 bg-gray-50 rounded-r-md"
                        data-testid={`booking-audit-log-${index}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {log.action}
                              </Badge>
                              {log.fromStatus && log.toStatus && (
                                <span className="text-sm font-medium">
                                  {getStatusLabel(log.fromStatus)} → {getStatusLabel(log.toStatus)}
                                </span>
                              )}
                              {log.action === 'created' && (
                                <span className="text-sm font-medium">
                                  Initial Status: {getStatusLabel(log.toStatus)}
                                </span>
                              )}
                            </div>
                            {log.cancellationReason && (
                              <p className="text-sm text-gray-700 mb-1">
                                <span className="font-medium">Cancellation Reason:</span> {log.cancellationReason}
                              </p>
                            )}
                            {log.notes && (
                              <p className="text-sm text-gray-600">
                                <span className="font-medium">Notes:</span> {log.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No history available for this booking.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Status Change Dialog */}
    <Dialog open={showStatusChange} onOpenChange={setShowStatusChange}>
      <DialogContent className="max-w-md w-[98vw] sm:w-[95vw] md:w-full touch-manipulation">
        <DialogHeader className="space-y-2 pb-4">
          <DialogTitle className="text-lg">Change Booking Status</DialogTitle>
          <DialogDescription className="text-sm">
            Update the status of this booking
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label className="font-medium">Current Status:</Label>
            <div className="mt-2">
              <Badge className={getStatusColor(booking?.status || 'booked')}>
                {getStatusLabel(booking?.status || 'booked')}
              </Badge>
            </div>
          </div>

          <Separator />

          <div>
            <Label htmlFor="new-status">New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="mt-1 w-full min-h-[44px] touch-manipulation">
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent className="z-50">
                {bookingUpdateOptions.map(option => (
                  <SelectItem key={option.value} value={option.value} className="min-h-[44px] cursor-pointer">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {newStatus === 'cancelled' && (
            <>
              <div>
                <Label htmlFor="cancellation-reason">Cancellation Reason *</Label>
                <Select value={cancellationReason} onValueChange={setCancellationReason}>
                  <SelectTrigger className="mt-1 w-full min-h-[44px] touch-manipulation" data-testid="select-cancellation-reason">
                    <SelectValue placeholder="Select cancellation reason" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="client_cancelled">Client cancelled event</SelectItem>
                    <SelectItem value="date_changed">Date changed (client postponed)</SelectItem>
                    <SelectItem value="payment_not_received">Payment not received</SelectItem>
                    <SelectItem value="force_majeure">Force majeure (e.g., lockdown, disaster)</SelectItem>
                    <SelectItem value="double_booking">Double booking error / Internal mistake</SelectItem>
                    <SelectItem value="other">Other (with notes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cancellationReason === 'other' && (
                <div>
                  <Label htmlFor="cancellation-reason-notes">Additional Notes *</Label>
                  <Textarea
                    id="cancellation-reason-notes"
                    value={cancellationReasonNotes}
                    onChange={(e) => setCancellationReasonNotes(e.target.value)}
                    placeholder="Please provide more details..."
                    className="mt-1"
                    data-testid="textarea-cancellation-reason-notes"
                    rows={3}
                  />
                </div>
              )}
            </>
          )}

          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this status change..."
              className="mt-1"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={handleStatusUpdate}
              disabled={updateBookingMutation.isPending}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
              data-testid="button-update-status"
            >
              {updateBookingMutation.isPending ? 'Updating...' : 'Update Status'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setNewStatus('');
                setNotes('');
                setCancellationReason('');
                setCancellationReasonNotes('');
              }}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
              data-testid="button-clear-status"
            >
              Clear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Reopen Request Dialog */}
    <Dialog open={showReopenRequest} onOpenChange={setShowReopenRequest}>
      <DialogContent className="max-w-md w-[98vw] sm:w-[95vw] md:w-full touch-manipulation">
        <DialogHeader>
          <DialogTitle>Request Booking Reopen</DialogTitle>
          <DialogDescription>
            Submit a request to reopen this booking. Admin approval will be required.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="reopen-reason">Reason for Reopening *</Label>
            <Select value={reopenReason} onValueChange={setReopenReason}>
              <SelectTrigger data-testid="select-reopen-reason">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client_reconnected">Client Reconnected</SelectItem>
                <SelectItem value="wrongly_marked_lost">Wrongly Marked as Lost/Cancelled</SelectItem>
                <SelectItem value="package_revised">Package Revised</SelectItem>
                <SelectItem value="event_postponed">Event Postponed</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="reopen-comments">Additional Comments</Label>
            <Textarea
              id="reopen-comments"
              value={reopenComments}
              onChange={(e) => setReopenComments(e.target.value)}
              placeholder="Provide additional details about the reopen request..."
              data-testid="textarea-reopen-comments"
            />
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleReopenRequest}
              disabled={requestReopenMutation.isPending}
              className="flex-1"
              data-testid="button-submit-reopen-request"
            >
              {requestReopenMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowReopenRequest(false)}
              className="flex-1"
              data-testid="button-cancel-reopen-request"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}