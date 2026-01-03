import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertBookingSchema } from "@shared/schema-client";
import { z } from "zod";
import { isUnauthorizedError } from "@/lib/authUtils";
import SessionManagement from "./session-management";

const sessionSchema = z.object({
  id: z.string(),
  sessionName: z.string().min(1, "Session name is required"),
  sessionLabel: z.string().optional(),
  venue: z.string().min(1, "Venue is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  sessionDate: z.union([z.date(), z.string()]).optional(), // Can be Date or ISO string
  paxCount: z.number().min(0).default(0),
  specialInstructions: z.string().optional(),
});

const formSchema = insertBookingSchema.extend({
  eventDate: z.string().min(1, "Event date is required"),
  eventEndDate: z.string().optional(),
  eventDates: z.array(z.string()).optional(),
  sessions: z.array(sessionSchema).min(1, "At least one session is required"),
}).omit({
  totalAmount: true,
  advanceAmount: true,
  balanceAmount: true,
  hall: true,
  contractSigned: true,
  // Keep sessions requirement
});

interface BookingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiryId?: string;
}

export default function BookingForm({ open, onOpenChange, enquiryId }: BookingFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [eventDuration, setEventDuration] = useState(1);
  const [eventDates, setEventDates] = useState<string[]>([]);
  const [sessions, setSessions] = useState<z.infer<typeof sessionSchema>[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);
  const [showFinalReview, setShowFinalReview] = useState(false);
  const sessionsLoadedRef = useRef(false);

  // Fetch specific enquiry details
  const { data: enquiry, isLoading: enquiryLoading, error: enquiryError } = useQuery<any>({
    queryKey: [`/api/enquiries/${enquiryId}`],
    enabled: open && !!enquiryId,
  });

  // Debug enquiry loading
  useEffect(() => {
    if (enquiry) {
      }
  }, [enquiryId, open, enquiryLoading, enquiryError, enquiry]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      enquiryId: enquiryId || "",
      quotationId: "",
      clientName: enquiry?.clientName || "",
      contactNumber: enquiry?.contactNumber || "",
      email: enquiry?.email || "",
      eventType: enquiry?.eventType || "wedding",
      eventDate: enquiry?.eventDate ? new Date(enquiry.eventDate).toISOString().split('T')[0] : "",
      eventEndDate: "",
      eventDuration: 1,
      eventDates: [],
      confirmedPax: enquiry?.expectedPax || undefined,
      sessions: [],
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      try {
        // Calculate event dates based on duration
        const startDate = new Date(data.eventDate);
        const calculatedEventDates = [];
        
        for (let i = 0; i < eventDuration; i++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + i);
          calculatedEventDates.push(date.toISOString());
        }

        const endDate = eventDuration > 1 ? new Date(startDate.getTime() + (eventDuration - 1) * 24 * 60 * 60 * 1000) : null;

        // Debug: Log what enquiryId is being sent
        console.log('📤 Creating booking with enquiryId:', {
          formEnquiryId: data.enquiryId,
          propEnquiryId: enquiryId,
          enquiryIdFromEnquiry: enquiry?.id,
          finalEnquiryId: enquiryId || data.enquiryId || enquiry?.id || null,
        });
        
        const bookingData = {
          ...data,
          // bookingNumber is auto-generated on the server, don't include it
          // Use prop enquiryId first (most reliable), then form data, then enquiry data
          enquiryId: (enquiryId && enquiryId.trim() !== '') 
            ? enquiryId 
            : (data.enquiryId && data.enquiryId.trim() !== '') 
              ? data.enquiryId 
              : (enquiry?.id && enquiry.id.trim() !== '') 
                ? enquiry.id 
                : null,
          quotationId: data.quotationId || null, // Allow null for direct bookings
          totalAmount: 0, // Will be set separately through quotations (number, not string)
          advanceAmount: 0, // Will be set separately (number, not string)
          balanceAmount: 0, // Will be calculated when amounts are set (number, not string)
          confirmedPax: parseInt(data.confirmedPax?.toString() || "0"),
          eventDate: startDate.toISOString(),
          eventEndDate: endDate?.toISOString() || null,
          eventDuration: eventDuration,
          eventDates: calculatedEventDates,
          // Sessions with their own sessionDate and paxCount
          sessions: data.sessions.map(session => {
            // Use session's own sessionDate if available, otherwise fall back to eventDate
            let sessionDateValue: Date;
            if (session.sessionDate) {
              sessionDateValue = session.sessionDate instanceof Date 
                ? session.sessionDate 
                : new Date(session.sessionDate);
            } else {
              sessionDateValue = new Date(data.eventDate);
            }
            
            return {
              ...session,
              sessionDate: sessionDateValue.toISOString(), // Convert to ISO string for API
              paxCount: typeof session.paxCount === 'number' ? session.paxCount : (session.paxCount ? parseInt(session.paxCount) || 0 : 0),
            };
          }),
          // Default values for removed fields
          eventStartTime: "",
          eventEndTime: "",
          hall: "",
          contractSigned: true,
          contractSignedAt: new Date().toISOString(),
        };

        const response = await apiRequest("POST", "/api/bookings", bookingData);
        // Update enquiry status to 'booked' after successful booking creation
        if (enquiryId) {
          await apiRequest("PATCH", `/api/enquiries/${enquiryId}`, {
            status: 'booked'
          });
          }
        
        const result = await response.json();
        return result;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Booking created successfully",
      });
      // Invalidate and refetch all booking-related queries (including paginated ones)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
          return typeof key === 'string' && key.startsWith('/api/bookings');
        }
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
          return typeof key === 'string' && key.startsWith('/api/enquiries');
        }
      });
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiryId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      // Force immediate refetch to update UI
      queryClient.refetchQueries({ 
        predicate: (query) => {
          const key = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
          return typeof key === 'string' && (key.startsWith('/api/bookings') || key.startsWith('/api/enquiries'));
        }
      });
      queryClient.refetchQueries({ queryKey: ["/api/dashboard/metrics"] });
      form.reset();
      setEventDuration(1);
      setEventDates([]);
      setSessions([]);
      onOpenChange(false);
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      // Handle venue conflict errors
      if (error?.status === 409 && error?.data?.conflicts) {
        setConflictData(error.data);
        setShowConflictDialog(true);
        return;
      }

      // Handle validation errors
      if (error?.status === 400 && error?.data?.errors) {
        const errorMessages = error.data.errors.map((err: any) => err.message).join(', ');
        toast({
          title: "Validation Error",
          description: errorMessages,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Error",
        description: "Failed to create booking",
        variant: "destructive",
      });
    },
  });

  // Update enquiryId in form when prop changes (critical fix)
  useEffect(() => {
    if (enquiryId && enquiryId.trim() !== '') {
      form.setValue("enquiryId", enquiryId);
      console.log('✅ Updated form enquiryId to:', enquiryId);
    } else {
      form.setValue("enquiryId", "");
    }
  }, [enquiryId, form]);

  // Update form values when enquiry data is loaded
  useEffect(() => {
    if (enquiry) {
      form.setValue("clientName", enquiry.clientName);
      form.setValue("contactNumber", enquiry.contactNumber);
      form.setValue("email", enquiry.email || "");
      form.setValue("eventType", enquiry.eventType);
      
      const eventDateValue = enquiry.eventDate ? new Date(enquiry.eventDate).toISOString().split('T')[0] : "";
      form.setValue("eventDate", eventDateValue);
      form.setValue("confirmedPax", enquiry.expectedPax || undefined);
      
      // Set event duration from enquiry (already selected during enquiry creation)
      const enquiryDuration = enquiry.eventDuration || 1;
      setEventDuration(enquiryDuration);
      form.setValue("eventDuration", enquiryDuration);
      
      // Update event dates based on enquiry duration
      if (eventDateValue) {
        updateEventDates(eventDateValue, enquiryDuration);
      }
      
      // Ensure enquiryId is set from the enquiry data if available
      if (enquiry.id) {
        form.setValue("enquiryId", enquiry.id);
        console.log('✅ Set enquiryId from enquiry data:', enquiry.id);
      }
    }
  }, [enquiry, form]);

  // Auto-fill event date from enquiry and add first session
  useEffect(() => {
    if (enquiry && enquiry.eventDate) {
      const eventDate = new Date(enquiry.eventDate).toISOString().split('T')[0];
      form.setValue('eventDate', eventDate);
      }
  }, [enquiry, form]);

  // Reset form state when dialog closes
  useEffect(() => {
    if (!open) {
      setSessions([]);
      setEventDuration(1);
      setEventDates([]);
      setShowFinalReview(false);
      sessionsLoadedRef.current = false; // Reset flag when dialog closes
      // Reset enquiryId when form closes
      form.setValue("enquiryId", "");
    }
  }, [open, form]);
  
  // Reset enquiryId when form opens with new enquiryId
  useEffect(() => {
    if (open && enquiryId) {
      form.setValue("enquiryId", enquiryId);
      console.log('🔧 Form opened with enquiryId:', enquiryId);
    }
  }, [open, enquiryId, form]);

  // Load enquiry sessions when form opens or enquiry data loads
  useEffect(() => {
    // Only proceed if form is open, enquiry is loaded, and we haven't loaded sessions yet
    if (!open || !enquiry || sessionsLoadedRef.current) {
      return;
    }
    
    // Wait for enquiry to be fully loaded (not loading and no error)
    if (enquiryLoading || enquiryError) {
      return;
    }
    
    // Debug: Log enquiry data
    console.log('Loading sessions from enquiry:', {
      enquiryId: enquiry.id,
      hasSessions: !!enquiry.sessions,
      sessionsLength: enquiry.sessions?.length || 0,
      sessions: enquiry.sessions,
      enquiryFull: enquiry
    });
    
    sessionsLoadedRef.current = true; // Mark as loaded to prevent re-loading
    
    // Reset sessions when form opens to ensure fresh data
    if (enquiry.sessions && Array.isArray(enquiry.sessions) && enquiry.sessions.length > 0) {
      // Filter out incomplete sessions and map to booking session format
      const enquirySessions = enquiry.sessions
        .filter((session: any) => {
          const isValid = session.sessionName && session.venue && session.startTime && session.endTime;
          if (!isValid) {
            console.log('Filtered out incomplete session:', session);
          }
          return isValid;
        })
        .map((session: any) => ({
          id: session.id || session._id || Math.random().toString(36).substr(2, 9),
          sessionName: session.sessionName || "",
          sessionLabel: session.sessionLabel || "",
          venue: session.venue || "",
          startTime: session.startTime || "",
          endTime: session.endTime || "",
          sessionDate: session.sessionDate ? (session.sessionDate instanceof Date ? session.sessionDate : new Date(session.sessionDate)) : (enquiry.eventDate ? new Date(enquiry.eventDate) : new Date()),
          // Preserve original session ID from enquiry for read-only tracking
          _originalId: session.id || session._id,
          paxCount: typeof session.paxCount === 'number' ? session.paxCount : (session.paxCount ? parseInt(session.paxCount) || 0 : 0),
          specialInstructions: session.specialInstructions || "",
        }));
      
      console.log('Mapped enquiry sessions:', enquirySessions);
      
      if (enquirySessions.length > 0) {
        setSessions(enquirySessions);
        form.setValue('sessions', enquirySessions);
        console.log('✅ Sessions loaded successfully:', enquirySessions.length);
      } else {
        console.log('⚠️ No valid sessions after filtering, adding empty session');
        // No valid sessions, add empty one
        const firstSession = {
          id: Math.random().toString(36).substr(2, 9),
          sessionName: "",
          sessionLabel: "",
          venue: "",
          startTime: "10:00",
          endTime: "14:00",
          sessionDate: enquiry.eventDate ? new Date(enquiry.eventDate) : new Date(),
          paxCount: 0,
          specialInstructions: ""
        };
        setSessions([firstSession]);
        form.setValue('sessions', [firstSession]);
      }
    } else {
      console.log('⚠️ No sessions in enquiry or sessions is empty/not an array');
      // No sessions in enquiry, add empty one
      const firstSession = {
        id: Math.random().toString(36).substr(2, 9),
        sessionName: "",
        sessionLabel: "",
        venue: "",
        startTime: "10:00",
        endTime: "14:00",
        sessionDate: enquiry.eventDate ? new Date(enquiry.eventDate) : new Date(),
        paxCount: 0,
        specialInstructions: ""
      };
      setSessions([firstSession]);
      form.setValue('sessions', [firstSession]);
    }
  }, [open, enquiry, enquiryLoading, enquiryError, form]); // Added enquiryLoading and enquiryError to dependencies

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    // Detailed field-by-field logging
    // Session validation details
    if (data.sessions && data.sessions.length > 0) {
      data.sessions.forEach((session, index) => {
        });
    } else {
      }
    
    // Sessions validation
    if (!data.sessions || data.sessions.length === 0) {
      toast({
        title: "Sessions Required",
        description: "Please add at least one event session with venue and timing details",
        variant: "destructive",
      });
      return;
    }
    
    try {
      createBookingMutation.mutate(data);
      } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create booking",
        variant: "destructive",
      });
    }
  };

  // Use the enquiry data when available to detect if duration changed
  const originallyMentionedSingleDay = enquiry && !enquiry.eventDate;

  // Update event dates based on duration and start date
  const updateEventDates = (startDateStr: string, duration: number) => {
    if (!startDateStr) {
      setEventDates([]);
      return;
    }

    const dates = [];
    const startDate = new Date(startDateStr);
    
    for (let i = 0; i < duration; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date.toISOString());
    }
    
    setEventDates(dates);
    form.setValue("eventDates", dates);
    
    if (duration > 1) {
      const endDate = dates[dates.length - 1];
      form.setValue("eventEndDate", endDate.split('T')[0]);
    } else {
      form.setValue("eventEndDate", "");
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Booking Confirmation</DialogTitle>
          <DialogDescription>
            Convert an enquiry into a confirmed booking. Financial details will be managed separately.
          </DialogDescription>
        </DialogHeader>

        {/* Enquiry Summary - Compact view */}
        {enquiry && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Converting Enquiry: {enquiry.enquiryNumber}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Client:</span>
                    <span className="ml-2 text-gray-700">{enquiry.clientName}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Event:</span>
                    <span className="ml-2 text-gray-700 capitalize">{enquiry.eventType || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Guests:</span>
                    <span className="ml-2 text-gray-700">{enquiry.expectedPax || 'Not specified'}</span>
                  </div>
                </div>
                {enquiry.sessions && enquiry.sessions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <p className="text-sm text-blue-700 font-medium mb-1">
                      ✓ {enquiry.sessions.length} session{enquiry.sessions.length > 1 ? 's' : ''} loaded from enquiry
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Event Date & Duration Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Event Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="eventDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Start Date *</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          min={new Date().toISOString().split('T')[0]}
                          {...field} 
                          readOnly
                          className="bg-muted"
                          data-testid="input-event-date"
                          title="Event date is locked from enquiry data"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Event Duration - Hidden, auto-set from enquiry */}
                <div className="hidden">
                  <FormField
                    control={form.control}
                    name="eventDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            value={eventDuration}
                            readOnly
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Display Event Duration (read-only) */}
                <div>
                  <Label>Event Duration</Label>
                  <Input 
                    value={eventDuration === 1 ? "Single Day" : `${eventDuration} Days`}
                    readOnly
                    className="bg-muted"
                    data-testid="display-event-duration"
                    title="Event duration is set from enquiry data"
                  />
                </div>

                {eventDuration > 1 && (
                  <div>
                    <Label>Event End Date</Label>
                    <Input 
                      type="date" 
                      value={eventDates[eventDuration - 1]?.split('T')[0] || ''} 
                      readOnly 
                      className="bg-muted"
                      data-testid="input-event-end-date"
                    />
                  </div>
                )}
              </div>

              {eventDuration > 1 && eventDates.length > 0 && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium">All Event Dates:</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {eventDates.map((date, index) => (
                      <span 
                        key={index}
                        className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                        data-testid={`date-chip-${index}`}
                      >
                        Day {index + 1}: {new Date(date).toLocaleDateString()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Client Information - Pre-filled from Enquiry */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Client Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Name</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly className="bg-muted" data-testid="input-client-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Number</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly className="bg-muted" data-testid="input-contact-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} readOnly className="bg-muted" data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select event type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="wedding">Wedding</SelectItem>
                          <SelectItem value="corporate">Corporate Event</SelectItem>
                          <SelectItem value="conference">Conference</SelectItem>
                          <SelectItem value="anniversary">Anniversary</SelectItem>
                          <SelectItem value="birthday">Birthday Party</SelectItem>
                          <SelectItem value="engagement">Engagement</SelectItem>
                          <SelectItem value="reception">Reception</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmedPax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmed Guest Count *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Number of guests" 
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : "")}
                          data-testid="input-confirmed-pax"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Session Management */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Event Sessions</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {enquiry?.sessions && enquiry.sessions.length > 0 
                  ? `Sessions from enquiry have been loaded below. You can edit or add more sessions.`
                  : `Add at least one session with venue and timing details.`}
              </p>
              <SessionManagement
                sessions={sessions.map(s => ({
                  ...s,
                  sessionDate: s.sessionDate 
                    ? (s.sessionDate instanceof Date 
                        ? s.sessionDate.toISOString().split('T')[0] 
                        : typeof s.sessionDate === 'string' 
                          ? s.sessionDate 
                          : new Date(s.sessionDate).toISOString().split('T')[0])
                    : (form.watch('eventDate') || new Date().toISOString().split('T')[0])
                }))}
                onSessionsChange={(newSessions) => {
                  // Convert sessionDate strings back to Date objects
                  const convertedSessions = newSessions.map(s => ({
                    ...s,
                    sessionDate: s.sessionDate ? new Date(s.sessionDate) : new Date(form.watch('eventDate') || new Date())
                  }));
                  setSessions(convertedSessions);
                  form.setValue('sessions', convertedSessions);
                }}
                eventStartDate={form.watch('eventDate') || ""}
                eventEndDate={form.watch('eventEndDate') || undefined}
                eventDuration={eventDuration}
              />
            </div>


            {/* Financial Information Note */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Financial Information</h4>
                  <p className="text-sm text-blue-700">
                    Financial details and pricing will be managed separately after the booking is confirmed.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="button"
                disabled={createBookingMutation.isPending || sessions.length === 0}
                data-testid="button-save-booking"
                onClick={(e) => {
                  e.preventDefault();
                  
                  if (sessions.length === 0) {
                    toast({
                      title: "Sessions Required",
                      description: "Please add at least one event session before creating the booking",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  if (createBookingMutation.isPending) {
                    return;
                  }
                  
                  try {
                    form.trigger().then((isValid) => {
                      if (!isValid) {
                        const errors = form.formState.errors;
                        // Detailed error breakdown
                        Object.entries(errors).forEach(([field, error]: [string, any]) => {
                          if (field === 'sessions' && error?.root) {
                            }
                          if (field === 'sessions' && Array.isArray(error)) {
                            error.forEach((sessionError: any, index: number) => {
                              });
                          }
                        });
                        
                        // Check each required field
                        const formValues = form.getValues();
                        toast({
                          title: "Form Validation Error",
                          description: "Please check all required fields. See browser console for details.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      form.handleSubmit(onSubmit)();
                    // Smart fallback: Only run if first submission fails
                    setTimeout(() => {
                      if (createBookingMutation.isError) {
                        const formData = form.getValues();
                        createBookingMutation.mutate(formData);
                      } else if (createBookingMutation.isSuccess) {
                        } else {
                        }
                    }, 2000); // Wait 2 seconds to see if first submission succeeds
                    }).catch((error) => {
                      toast({
                        title: "Error",
                        description: "Form validation failed",
                        variant: "destructive",
                      });
                    });
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to submit form",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {createBookingMutation.isPending ? "Creating..." : "Confirm Booking"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Conflict Dialog */}
    <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Venue Conflict Detected
          </DialogTitle>
          <DialogDescription>
            The selected venue and time slot conflicts with existing bookings. Please review the conflicts below and adjust your session times or choose a different venue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {conflictData?.conflicts?.map((conflict: any, index: number) => (
            <div key={index} className="border border-red-200 bg-red-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
                
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 mb-2">Conflict #{index + 1}</h4>
                  
                  <div className="space-y-2 text-sm">
                    {/* Venue */}
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-medium text-red-900">Venue:</span>
                      <span className="text-red-800">{conflict.venue}</span>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium text-red-900">Date:</span>
                      <span className="text-red-800">
                        {new Date(conflict.date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-red-200 my-3"></div>

                    {/* Existing Booking */}
                    <div className="bg-white rounded p-3 border border-red-200">
                      <p className="font-medium text-red-900 mb-2 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Existing Booking
                      </p>
                      <div className="space-y-1 text-sm text-gray-700 ml-6">
                        <p><span className="font-medium">Booking #:</span> {conflict.existingBooking.bookingNumber}</p>
                        <p><span className="font-medium">Client:</span> {conflict.existingBooking.clientName}</p>
                        <p><span className="font-medium">Session:</span> {conflict.existingBooking.sessionName}</p>
                        <p><span className="font-medium">Time:</span> {conflict.existingBooking.startTime} - {conflict.existingBooking.endTime}</p>
                      </div>
                    </div>

                    {/* Your Conflicting Session */}
                    <div className="bg-orange-50 rounded p-3 border border-orange-200">
                      <p className="font-medium text-orange-900 mb-2 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Your Conflicting Session
                      </p>
                      <div className="space-y-1 text-sm text-orange-800 ml-6">
                        <p><span className="font-medium">Session:</span> {conflict.conflictingSession.sessionName}</p>
                        <p><span className="font-medium">Time:</span> {conflict.conflictingSession.startTime} - {conflict.conflictingSession.endTime}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Helpful message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="font-medium text-blue-900 mb-1">How to resolve this conflict:</p>
                <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                  <li>Change the session time to avoid the conflict</li>
                  <li>Select a different venue for the conflicting session</li>
                  <li>Choose a different date for your event</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => {
              setShowConflictDialog(false);
              setConflictData(null);
            }}
          >
            Close
          </Button>
          <Button
            onClick={() => {
              setShowConflictDialog(false);
              // Keep the form open so user can make changes
            }}
          >
            Modify Booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
