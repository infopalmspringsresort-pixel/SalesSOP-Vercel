import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { type Enquiry } from "@shared/schema-client";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Phone, Mail, Users, MapPin, FileText, Plus, Edit, Clock, CheckCircle, AlertCircle, Trash2, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import BookingForm from "../../bookings/components/booking-form";
import { getStatusColor, getStatusLabel, getValidNextStatuses } from "@/lib/status-utils";
import EnquirySessionManagement from "@/components/ui/enquiry-session-management";
import { TimePicker } from "@/components/ui/time-picker";
import QuotationForm from "../../quotations/components/quotation-form";
import QuotationHistory from "../../quotations/components/quotation-history";
import EnquiryTransferDialog from "@/components/enquiry-transfer-dialog";
import { z } from "zod";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const DAY_SESSION_ORDER: Record<string, number> = {
  Breakfast: 0,
  Lunch: 1,
  "Hi-Tea": 2,
  Dinner: 3,
  "All Day": 4,
};

interface EnquiryDetailsDialogProps {
  enquiry: Enquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNewFromClosed?: (enquiry: Enquiry) => void;
  onEdit?: (enquiry: Enquiry) => void;
}

export default function EnquiryDetailsDialog({ enquiry: initialEnquiry, open, onOpenChange, onCreateNewFromClosed, onEdit }: EnquiryDetailsDialogProps) {
  // Fetch fresh enquiry data to ensure we always have the latest information
  const { data: enquiry = initialEnquiry } = useQuery<Enquiry | null>({
    queryKey: [`/api/enquiries/${initialEnquiry?.id}`],
    enabled: !!initialEnquiry && open,
    initialData: initialEnquiry,
  });

  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [collisionOpen, setCollisionOpen] = useState(false);
  const [collisionBlocking, setCollisionBlocking] = useState(false);
  const [collisionMessages, setCollisionMessages] = useState<string[]>([]);
  const [bypassCollisionOnce, setBypassCollisionOnce] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [lossReasonNotes, setLossReasonNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('12:00');
  const [followUpNotes, setFollowUpNotes] = useState('');
  
  // Follow-up completion confirmation
  const [showFollowUpConfirmation, setShowFollowUpConfirmation] = useState(false);
  const [pendingStatusData, setPendingStatusData] = useState<any>(null);
  
  // Follow-up management state
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showCollisionDialog, setShowCollisionDialog] = useState(false);
  const [collisionMessage, setCollisionMessage] = useState<string>('');
  const [newFollowUpDate, setNewFollowUpDate] = useState('');
  const [newFollowUpTime, setNewFollowUpTime] = useState('12:00');
  const [newFollowUpNotes, setNewFollowUpNotes] = useState('');
  const [repeatFollowUp, setRepeatFollowUp] = useState(false);
  const [repeatInterval, setRepeatInterval] = useState(7);
  const [repeatEndDate, setRepeatEndDate] = useState('');

  // Reopen enquiry state
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [reopenNotes, setReopenNotes] = useState('');

  // Booking form state
  const [showBookingForm, setShowBookingForm] = useState(false);

  // Quotation management state
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("details");
  
  // Reset activeTab to "details" when enquiry dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab("details");
    }
  }, [open]);
  
  // Session management state
  const [sessions, setSessions] = useState<any[]>([]);
  const [isEditingSessions, setIsEditingSessions] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null); // Track which session is being edited
  const [editingSessionData, setEditingSessionData] = useState<any>(null); // Local state for session being edited (not applied until save)
  const [isNewSession, setIsNewSession] = useState(false); // Track if the session being edited is new (not yet saved)
  
  // Session schema for editing
  const sessionSchema = z.object({
    id: z.string(),
    sessionName: z.string(),
    sessionLabel: z.string().optional(),
    venue: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    sessionDate: z.date(),
    paxCount: z.number().default(0),
    specialInstructions: z.string().optional(),
  });

  const eventStartMidnight = useMemo(() => {
    if (!enquiry?.eventDate) return undefined;
    const start = new Date(enquiry.eventDate);
    if (isNaN(start.getTime())) return undefined;
    start.setHours(0, 0, 0, 0);
    return start;
  }, [enquiry?.eventDate]);

  const sessionNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    // Include new session being edited in the count if it exists
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

  const groupedSessions = useMemo(() => {
    if (!sessions.length) return [];

    const groupMap = new Map<
      string,
      {
        displayDate: Date;
        sessions: any[];
      }
    >();

    sessions.forEach((session) => {
      const rawDate =
        session.sessionDate instanceof Date
          ? new Date(session.sessionDate)
          : new Date(session.sessionDate);

      if (isNaN(rawDate.getTime())) {
        return;
      }

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
        const orderA =
          a.sessionLabel && DAY_SESSION_ORDER[a.sessionLabel] !== undefined
            ? DAY_SESSION_ORDER[a.sessionLabel]
            : Number.MAX_SAFE_INTEGER;
        const orderB =
          b.sessionLabel && DAY_SESSION_ORDER[b.sessionLabel] !== undefined
            ? DAY_SESSION_ORDER[b.sessionLabel]
            : Number.MAX_SAFE_INTEGER;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        if (a.startTime && b.startTime) {
          const timeDiff = a.startTime.localeCompare(b.startTime);
          if (timeDiff !== 0) {
            return timeDiff;
          }
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
  }, [sessions, eventStartMidnight]);

  // Load sessions when enquiry data changes - only load sessions with complete details
  // Use a ref to track if we're currently editing (to prevent resetting edit mode)
  const isEditingRef = useRef(false);
  
  useEffect(() => {
    // Don't reset sessions if we're currently editing a session
    // This prevents resetting edit mode when enquiry data updates
    // Update ref based on current state (synchronously)
    isEditingRef.current = editingSessionId !== null;
    
    if (isEditingRef.current) {
      return; // Don't reset if we're editing
    }
    
    if (enquiry?.sessions) {
      const loadedSessions = enquiry.sessions
        .map((session: any) => ({
          ...session,
          id: session.id || session._id || Math.random().toString(36).substr(2, 9), // Ensure every session has an id
          sessionDate: new Date(session.sessionDate)
        }))
        .filter((session: any) => {
          // Only include sessions that have required fields filled
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
  }, [enquiry]);
  
  // Reset edit state when dialog closes
  useEffect(() => {
    if (!open) {
      // Clear all editing state when dialog closes
      // This prevents unsaved new sessions from being created
      setEditingSessionId(null);
      setEditingSessionData(null);
      setIsNewSession(false);
      setIsEditingSessions(false);
      isEditingRef.current = false;
    }
  }, [open]);

  // Reset status when dialog opens
  useEffect(() => {
    if (showStatusChange) {
      setNewStatus('');
      setClosureReason('');
      setLossReason('');
      setLossReasonNotes('');
      setFollowUpDate('');
      setFollowUpTime('12:00');
      setFollowUpNotes('');
    }
  }, [showStatusChange]);

  // Fetch follow-up history - use the same data structure as dashboard
  const { data: followUpHistory = [], isLoading: followUpHistoryLoading } = useQuery<any[]>({
    queryKey: [`/api/enquiries/${enquiry?.id}/follow-ups`],
    enabled: !!enquiry && open,
    refetchOnWindowFocus: false,
  });

  // Update sessions mutation
  const updateSessionsMutation = useMutation({
    mutationFn: async ({ updatedSessions, isDelete = false }: { updatedSessions: any[], isDelete?: boolean }) => {
      if (!enquiry?.id) {
        throw new Error('Enquiry ID is required');
      }
      
      // Filter out incomplete sessions (those without required fields)
      const validSessions = updatedSessions.filter(session => 
        session.sessionName && 
        session.venue && 
        session.startTime && 
        session.endTime
      );

      const response = await apiRequest("PATCH", `/api/enquiries/${enquiry.id}`, {
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
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      setIsEditingSessions(false); // Exit edit mode after successful save
      setEditingSessionId(null); // Reset which session is being edited
      setEditingSessionData(null); // Clear editing data
      setIsNewSession(false); // Reset new session flag
      isEditingRef.current = false; // Reset ref
    },
    onError: (error: any) => {
      console.error('Session update error:', error);
      if (error?.status === 409) {
        const msg = error?.data?.message || 'Venue collision detected with existing converted/booked record.';
        setCollisionMessage(msg);
        setShowCollisionDialog(true);
        return;
      }
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update sessions. Please check that all required fields are filled.',
        variant: 'destructive',
      });
    },
  });

  // Fetch follow-up stats
  const { data: followUpStats } = useQuery<{total: number, completed: number}>({
    queryKey: [`/api/enquiries/${enquiry?.id}/follow-up-stats`],
    enabled: !!enquiry && open,
  });

  // Check if booking exists for this enquiry
  const { data: existingBookings = [] } = useQuery<any[]>({
    queryKey: [`/api/bookings`],
    enabled: !!enquiry && open,
  });

  const hasBooking = (existingBookings || []).some(booking => {
    // Debug: Log ALL booking fields to see what else might match
    console.log('🔍 FULL Booking Data:', {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      bookingEnquiryId: booking.enquiryId,
      bookingEnquiryIdType: typeof booking.enquiryId,
      bookingClientName: booking.clientName,
      bookingContactNumber: booking.contactNumber,
      bookingEmail: booking.email,
      bookingEventType: booking.eventType,
      bookingEventDate: booking.eventDate,
      bookingSalespersonId: booking.salespersonId,
      bookingEnquiry: booking.enquiry, // Full enquiry object in booking
      enquiryId: enquiry?.id,
      enquiryIdType: typeof enquiry?.id,
      enquiryNumber: enquiry?.enquiryNumber,
      enquiryClientName: enquiry?.clientName,
      enquiryContactNumber: enquiry?.contactNumber,
      enquiryEmail: enquiry?.email,
      enquiryEventType: enquiry?.eventType,
      enquiryEventDate: enquiry?.eventDate,
      enquirySalespersonId: enquiry?.salespersonId,
    });
    
    // Only check if both IDs exist and are valid (not null, undefined, or empty string)
    if (!booking.enquiryId || !enquiry?.id) {
      console.log('❌ Skipping - missing IDs:', { 
        hasBookingEnquiryId: !!booking.enquiryId, 
        hasEnquiryId: !!enquiry?.id,
        bookingEnquiryIdValue: booking.enquiryId,
        enquiryIdValue: enquiry?.id,
      });
      return false;
    }
    
    // Handle both string and ObjectId formats for enquiryId
    const bookingEnquiryId = booking.enquiryId?.toString ? booking.enquiryId.toString() : String(booking.enquiryId || '');
    const enquiryId = enquiry?.id?.toString ? enquiry.id.toString() : String(enquiry?.id || '');
    
    // Strict comparison - must be exact match, non-empty, and valid MongoDB ObjectId format (24 hex chars)
    const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
    
    const isBookingIdValid = bookingEnquiryId && bookingEnquiryId.trim() !== '' && isValidObjectId(bookingEnquiryId);
    const isEnquiryIdValid = enquiryId && enquiryId.trim() !== '' && isValidObjectId(enquiryId);
    const idsMatch = bookingEnquiryId === enquiryId;
    
    // Check if ANY other fields match (for debugging)
    const otherMatches = {
      clientNameMatch: booking.clientName === enquiry?.clientName,
      contactNumberMatch: booking.contactNumber === enquiry?.contactNumber,
      emailMatch: booking.email === enquiry?.email,
      eventTypeMatch: booking.eventType === enquiry?.eventType,
      salespersonIdMatch: String(booking.salespersonId || '') === String(enquiry?.salespersonId || ''),
      enquiryNumberInBooking: booking.enquiry?.enquiryNumber === enquiry?.enquiryNumber,
      enquiryIdInBookingEnquiry: booking.enquiry?.id === enquiry?.id,
    };
    
    const matches = isBookingIdValid && isEnquiryIdValid && idsMatch;
    
    // Debug logging to see what's being compared
    console.log('🔍 Comparison Result:', {
      bookingEnquiryId,
      enquiryId,
      isBookingIdValid,
      isEnquiryIdValid,
      idsMatch,
      matches,
      bookingEnquiryIdLength: bookingEnquiryId?.length,
      enquiryIdLength: enquiryId?.length,
      otherMatches, // Show what else matches
    });
    
    if (matches) {
      console.log('✅ MATCH FOUND - Booking linked to this enquiry:', {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        bookingEnquiryId: bookingEnquiryId,
        enquiryId: enquiryId,
        enquiryNumber: enquiry?.enquiryNumber,
        bookingClientName: booking.clientName,
        enquiryClientName: enquiry?.clientName,
        otherMatchingFields: Object.entries(otherMatches).filter(([_, matches]) => matches).map(([field]) => field),
      });
    }
    
    return matches;
  });

  // Create follow-up mutation
  const createFollowUpMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/follow-ups", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}/follow-ups`] });
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}/follow-up-stats`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      // Invalidate dashboard follow-up queries to sync with main dashboard
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
      // Force invalidate all queries that contain follow-up data
      queryClient.getQueryCache().getAll().forEach(query => {
        const key = query.queryKey.join('/');
        if (key.includes('follow-up') || key.includes('enquiries')) {
          queryClient.invalidateQueries({ queryKey: query.queryKey });
        }
      });
      // Force refetch to update dashboard immediately
      queryClient.refetchQueries({ queryKey: ["/api/follow-ups"] });
      setShowFollowUpForm(false);
      setNewFollowUpDate('');
      setNewFollowUpTime('12:00');
      setNewFollowUpNotes('');
      setRepeatFollowUp(false);
      setRepeatInterval(7);
      setRepeatEndDate('');
      toast({
        title: "Success",
        description: "Follow-up created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create follow-up",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { status: string; closureReason?: string; followUpDate?: string; followUpNotes?: string }) => {
      if (!enquiry) throw new Error('No enquiry selected');
      const response = await apiRequest("PATCH", `/api/enquiries/${enquiry.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enquiries'] });
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}`] });
      // Invalidate bookings to show newly created bookings
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      // Invalidate dashboard metrics for updated counts
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/follow-ups'] });
      // Force invalidate all queries that contain enquiry data to refresh everything
      queryClient.getQueryCache().getAll().forEach(query => {
        const key = query.queryKey.join('/');
        if (key.includes('enquiries') || key.includes('follow-up') || key.includes('bookings')) {
          queryClient.invalidateQueries({ queryKey: query.queryKey });
        }
      });
      setShowStatusChange(false);
      setNewStatus('');
      setClosureReason('');
      setLossReason('');
      setLossReasonNotes('');
      setFollowUpDate('');
      setFollowUpNotes('');
      toast({
        title: "Success",
        description: "Enquiry status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update enquiry status",
        variant: "destructive",
      });
    },
  });

  // Handle follow-up creation
  const handleCreateFollowUp = () => {
    if (!enquiry || !newFollowUpDate) {
      toast({
        title: "Error", 
        description: "Please fill in date and time",
        variant: "destructive"
      });
      return;
    }

    // Validate that follow-up date is not after event date
    if (enquiry.eventDate && newFollowUpDate) {
      const eventDate = new Date(enquiry.eventDate);
      eventDate.setHours(23, 59, 59, 999); // Set to end of event date
      const followUpDate = new Date(newFollowUpDate);
      followUpDate.setHours(23, 59, 59, 999);
      if (followUpDate > eventDate) {
        toast({
          title: "Invalid Date",
          description: "Follow-up date cannot be after the event date.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate that repeat end date (if provided) is not after event date
    if (repeatFollowUp && repeatEndDate && enquiry.eventDate) {
      const eventDate = new Date(enquiry.eventDate);
      eventDate.setHours(23, 59, 59, 999);
      const endDate = new Date(repeatEndDate);
      endDate.setHours(23, 59, 59, 999);
      if (endDate > eventDate) {
        toast({
          title: "Invalid Date",
          description: "Repeat end date cannot be after the event date.",
          variant: "destructive",
        });
        return;
      }
    }

    const followUpData = {
      enquiryId: enquiry.id,
      followUpDate: new Date(newFollowUpDate), // Convert to Date object
      followUpTime: newFollowUpTime,
      notes: newFollowUpNotes,
      setById: (user as any)?.id || "", // Use current user ID
      repeatFollowUp,
      repeatInterval: repeatFollowUp ? repeatInterval : null,
      repeatEndDate: repeatFollowUp && repeatEndDate ? new Date(repeatEndDate) : null, // Convert to Date object
    };

    createFollowUpMutation.mutate(followUpData);
  };

  // Mark follow-up as completed
  const markFollowUpCompleted = useMutation({
    mutationFn: async (followUpId: string) => {
      const response = await apiRequest("PATCH", `/api/follow-ups/${followUpId}/complete`, {});
      return response.json();
    },
    onMutate: async (followUpId: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: [`/api/enquiries/${enquiry?.id}/follow-ups`] });
      await queryClient.cancelQueries({ queryKey: ['/api/follow-ups'] });
      
      // Snapshot the previous values
      const previousFollowUps = queryClient.getQueryData<any[]>([`/api/enquiries/${enquiry?.id}/follow-ups`]);
      const previousAllFollowUps = queryClient.getQueryData<any[]>(['/api/follow-ups']);
      
      // Optimistically update enquiry-specific follow-ups
      if (previousFollowUps) {
        queryClient.setQueryData([`/api/enquiries/${enquiry?.id}/follow-ups`], (old: any[] = []) =>
          old.map((followUp: any) =>
            followUp.id === followUpId
              ? { ...followUp, completed: true, completedAt: new Date().toISOString() }
              : followUp
          )
        );
      }
      
      // Optimistically update all follow-ups (for dashboard)
      if (previousAllFollowUps) {
        queryClient.setQueryData(['/api/follow-ups'], (old: any[] = []) =>
          old.map((followUp: any) =>
            followUp.id === followUpId
              ? { ...followUp, completed: true, completedAt: new Date().toISOString() }
              : followUp
          )
        );
      }
      
      // Return a context object with the snapshotted values
      return { previousFollowUps, previousAllFollowUps };
    },
    onError: (err, followUpId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousFollowUps) {
        queryClient.setQueryData([`/api/enquiries/${enquiry?.id}/follow-ups`], context.previousFollowUps);
      }
      if (context?.previousAllFollowUps) {
        queryClient.setQueryData(['/api/follow-ups'], context.previousAllFollowUps);
      }
      toast({
        title: "Error",
        description: "Failed to mark follow-up as completed",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}/follow-ups`] });
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}/follow-up-stats`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      // Invalidate dashboard follow-up queries to sync with main dashboard
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
      toast({
        title: "Success",
        description: "Follow-up marked as completed",
      });
    },
  });

  // Reopen enquiry mutation
  const reopenEnquiryMutation = useMutation({
    mutationFn: async (data: { reason: string; notes: string }) => {
      if (!enquiry) throw new Error('No enquiry selected');
      const response = await apiRequest("POST", `/api/enquiries/${enquiry.id}/reopen`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enquiries'] });
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
      setShowReopenDialog(false);
      setReopenReason('');
      setReopenNotes('');
      toast({
        title: "Success",
        description: "Enquiry has been reopened successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to reopen enquiry",
        variant: "destructive",
      });
    },
  });

  // Accept enquiry mutation
  const acceptEnquiryMutation = useMutation({
    mutationFn: async () => {
      if (!enquiry) throw new Error('No enquiry selected');
      const response = await apiRequest("PATCH", `/api/enquiries/${enquiry.id}`, {
        assignmentStatus: 'accepted',
        salespersonId: (user as any)?.id
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      toast({
        title: "Success",
        description: "Enquiry accepted successfully",
      });
    },
    onError: (error: any) => {
      if (error.status === 409) {
        toast({
          title: "Enquiry Already Accepted",
          description: "This enquiry has already been accepted by another salesperson",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to accept enquiry",
          variant: "destructive",
        });
      }
    },
  });

  // Complete all follow-ups for an enquiry
  const completeAllFollowUpsMutation = useMutation({
    mutationFn: async () => {
      if (!enquiry) throw new Error('No enquiry selected');
      const response = await apiRequest("POST", `/api/enquiries/${enquiry.id}/complete-all-followups`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}/follow-ups`] });
      queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry?.id}/follow-up-stats`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      // Force immediate refetch to update dashboard counts
      queryClient.refetchQueries({ queryKey: ["/api/follow-ups"] });
      toast({
        title: "Success",
        description: "All follow-ups marked as completed",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to complete all follow-ups",
        variant: "destructive",
      });
    },
  });

  // Handle enquiry reopening
  const handleReopenEnquiry = () => {
    if (!reopenReason) {
      toast({
        title: "Error",
        description: "Please select a reason for reopening the enquiry",
        variant: "destructive"
      });
      return;
    }

    // Require notes for specific reopen reasons
    if (reopenReason === 'other' && !reopenNotes.trim()) {
      toast({
        title: "Error",
        description: "Additional notes are required for the selected reopen reason",
        variant: "destructive"
      });
      return;
    }

    // Map frontend values to backend enum values
    const reasonMapping: Record<string, string> = {
      'client_callback': 'client_reconnected',
      'pricing_discussion': 'client_reconnected', 
      'date_availability': 'client_reconnected',
      'requirement_change': 'client_reconnected',
      'competitor_comparison': 'client_reconnected',
      'budget_approval': 'client_reconnected',
      'wrongly_marked_lost': 'wrongly_marked_lost',
      'other': 'other'
    };

    reopenEnquiryMutation.mutate({
      reason: reasonMapping[reopenReason] || reopenReason,
      notes: reopenNotes,
    });
  };

  // Handle accepting enquiry
  const handleAcceptEnquiry = () => {
    acceptEnquiryMutation.mutate();
  };

  // Get valid next statuses based on current status
  const getValidNextStatuses = (currentStatus: string): Array<{ value: string; label: string }> => {
    const statusFlow: Record<string, Array<{ value: string; label: string }>> = {
      'new': [{ value: 'quotation_sent', label: 'Quotation Sent' }, { value: 'lost', label: 'Lost' }],
      'quotation_sent': [{ value: 'ongoing', label: 'Ongoing' }, { value: 'lost', label: 'Lost' }],
      'ongoing': [{ value: 'converted', label: 'Converted' }, { value: 'lost', label: 'Lost' }],
      'converted': [{ value: 'lost', label: 'Lost' }],
      'booked': [], // No further status changes allowed after booked
      'lost': []
    };
    return statusFlow[currentStatus] || [];
  };

  const handleStatusChange = async () => {
    if (!newStatus) {
      toast({
        title: "Error",
        description: "Please select a status",
        variant: "destructive",
      });
      return;
    }

    // Enforce collision rule when changing to converted or booked
    if (!bypassCollisionOnce && (newStatus === 'converted' || newStatus === 'booked')) {
      try {
        const [enqResp, bookResp] = await Promise.all([
          fetch('/api/enquiries'),
          fetch('/api/bookings')
        ]);
        const allEnquiries = await enqResp.json();
        const allBookings = await bookResp.json();
        // Sessions from current enquiry
        const currentSessions = ((enquiry as any)?.sessions || []).filter((s: any) => s.venue && s.sessionDate && s.startTime && s.endTime);
        const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && aEnd > bStart;
        let hasBlocking = false;
        let hasOnlyWarn = false;
        const toYMD = (d: any) => { const dt = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date(d); const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const day = String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };

        // Check BOOKINGS (booked) as blocking against current sessions
        for (const booking of allBookings) {
          if (booking.status && booking.status !== 'booked') continue;
          const bSessions = (booking.sessions || []).filter((s: any) => s.venue && s.sessionDate && s.startTime && s.endTime);
          for (const cs of currentSessions) {
            for (const bs of bSessions) {
              const sameVenue = bs.venue === cs.venue;
              const sameDate = toYMD(bs.sessionDate) === toYMD(cs.sessionDate);
              if (sameVenue && sameDate && overlaps(cs.startTime, cs.endTime, bs.startTime, bs.endTime)) {
                hasBlocking = true;
              }
            }
          }
        }
        for (const ex of allEnquiries) {
          if (ex.id === enquiry.id) continue; // skip self
          const status = ex.status;
          if (status === 'lost' || status === 'closed') continue;
          const exSessions = (ex.sessions || []).filter((s: any) => s.venue && s.sessionDate && s.startTime && s.endTime);
          for (const cs of currentSessions) {
            for (const es of exSessions) {
              const sameVenue = es.venue === cs.venue;
              const sameDate = toYMD(es.sessionDate) === toYMD(cs.sessionDate);
              if (sameVenue && sameDate && overlaps(cs.startTime, cs.endTime, es.startTime, es.endTime)) {
                if (status === 'converted' || status === 'booked') hasBlocking = true; else if (status === 'new' || status === 'ongoing' || status === 'quotation_sent') hasOnlyWarn = true;
              }
            }
          }
        }
        if (hasBlocking || hasOnlyWarn) {
          // Build messages for dialog
          const msgs: string[] = [];
          for (const ex of allEnquiries) {
            if (ex.id === enquiry.id) continue;
            const exSessions = (ex.sessions || []).filter((s: any) => s.venue && s.sessionDate && s.startTime && s.endTime);
            for (const cs of currentSessions) {
              for (const es of exSessions) {
                const sameVenue = es.venue === cs.venue;
                const sameDate = (new Date(es.sessionDate).toISOString().split('T')[0]) === (new Date(cs.sessionDate).toISOString().split('T')[0]);
                const overlaps = (a: string,b: string,c: string,d: string)=> a<b && b>c; // simplified for building text
                if (sameVenue && sameDate && overlaps(cs.startTime, cs.endTime, es.startTime, es.endTime)) {
                  // Only include statuses we consider (block: converted/booked; warn: new/ongoing/quotation_sent). Ignore 'lost'.
                  if (ex.status === 'converted' || ex.status === 'booked' || ex.status === 'new' || ex.status === 'ongoing' || ex.status === 'quotation_sent') {
                    msgs.push(`${new Date(cs.sessionDate).toLocaleDateString()} • ${cs.venue} • ${cs.startTime}-${cs.endTime} ↔ ${es.startTime}-${es.endTime} (${ex.clientName} - ${ex.status})`);
                  }
                }
              }
            }
          }
          setCollisionMessages(msgs);
          setCollisionBlocking(hasBlocking);
          setCollisionOpen(true);
          if (hasBlocking) return;
        }
      } catch (e) {
        toast({ title: 'Warning', description: 'Could not verify venue availability. Proceeding.', variant: 'default' });
      }
    }

    // reset bypass flag after use
    if (bypassCollisionOnce) setBypassCollisionOnce(false);

    if (newStatus === 'closed' && !closureReason.trim()) {
      toast({
        title: "Error",
        description: "Closure reason is required when closing enquiry",
        variant: "destructive",
      });
      return;
    }

    if (newStatus === 'lost' && !lossReason) {
      toast({
        title: "Error",
        description: "Loss reason is required when marking enquiry as lost",
        variant: "destructive",
      });
      return;
    }

    if (newStatus === 'lost' && lossReason === 'other' && !lossReasonNotes.trim()) {
      toast({
        title: "Error",
        description: "Additional notes are required for the selected loss reason",
        variant: "destructive",
      });
      return;
    }

    if (newStatus === 'quotation_sent' && !followUpDate) {
      toast({
        title: "Error",
        description: "Follow-up date is required when sending quotation",
        variant: "destructive",
      });
      return;
    }

    const updateData: { status: string; closureReason?: string; lossReason?: string; lossReasonNotes?: string; followUpDate?: string; followUpTime?: string; followUpNotes?: string } = { status: newStatus };
    if (newStatus === 'closed') {
      updateData.closureReason = closureReason.trim();
    }
    if (newStatus === 'lost') {
      updateData.lossReason = lossReason;
      if (lossReason === 'other' && lossReasonNotes.trim()) {
        updateData.lossReasonNotes = lossReasonNotes.trim();
      }
    }
    if (newStatus === 'quotation_sent') {
      // Combine date and time into a datetime string for followUpDate
      if (followUpDate && followUpTime) {
        const dateTimeString = `${followUpDate}T${followUpTime}:00`;
        updateData.followUpDate = dateTimeString;
      } else if (followUpDate) {
        updateData.followUpDate = followUpDate;
      }
      updateData.followUpTime = followUpTime || '12:00';
      updateData.followUpNotes = followUpNotes;
    }

    // Check if there are pending follow-ups before changing status
    const pendingFollowUps = (followUpHistory || []).filter((f: any) => !f.completed);
    
    // If changing to a status that would indicate completion and there are pending follow-ups, ask for confirmation
    if (pendingFollowUps.length > 0 && (newStatus === 'converted' || newStatus === 'lost' || newStatus === 'closed')) {
      setPendingStatusData(updateData);
      setShowFollowUpConfirmation(true);
      return;
    }

    updateStatusMutation.mutate(updateData);
  };

  // Handle follow-up completion confirmation
  const handleFollowUpConfirmation = (completeFollowUps: boolean) => {
    if (completeFollowUps) {
      completeAllFollowUpsMutation.mutate();
    }
    
    if (pendingStatusData) {
      updateStatusMutation.mutate(pendingStatusData);
    }
    
    setShowFollowUpConfirmation(false);
    setPendingStatusData(null);
  };

  if (!enquiry) return null;

  const validStatusOptions = enquiry ? getValidNextStatuses(enquiry.status || 'new') : [];

  const getSourceLabel = (source: string) => {
    // Source values are now stored as display names, so return as-is
    return source;
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[92vw] sm:w-[88vw] md:w-full max-h-[90vh] sm:max-h-[95vh] overflow-y-auto touch-manipulation mx-auto p-3 sm:p-4 md:p-6" style={{ pointerEvents: 'auto' }}>
        <DialogHeader className="space-y-2 pb-3 sm:pb-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="truncate text-sm sm:text-base md:text-lg">Enquiry Details - {enquiry.enquiryNumber}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Complete information about this enquiry
          </DialogDescription>
        </DialogHeader>

{/* Edit enquiry button hidden per user request */}

        <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-9 sm:h-10">
            <TabsTrigger value="details" data-testid="tab-enquiry-details" className="text-xs sm:text-sm">
              Details
            </TabsTrigger>
            <TabsTrigger value="sessions" data-testid="tab-sessions" className="text-xs sm:text-sm">
              Sessions
            </TabsTrigger>
            <TabsTrigger value="quotations" data-testid="tab-quotations" className="text-xs sm:text-sm">
              Quotations
            </TabsTrigger>
            <TabsTrigger value="followups" data-testid="tab-follow-ups" className="text-xs sm:text-sm">
              Follow-ups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 sm:space-y-6 min-h-[500px]">
          <div className="flex flex-col sm:flex-row justify-between gap-2">
  {/* Left side (Transfer button) */}
  <div className="flex justify-start w-full sm:w-auto">
    {((user as any)?.role?.name === 'admin' || 
      (user as any)?.role?.name === 'manager' || 
      (user as any)?.role?.name === 'salesperson') && (
      <Button 
        variant="outline"
        className="flex items-center justify-center gap-2 w-full sm:w-auto" 
        data-testid="button-transfer-enquiry"
        onClick={() => setShowTransferDialog(true)}
        size="sm"
      >
        <ArrowRightLeft className="w-4 h-4" />
        <span>Transfer</span>
      </Button>
    )}
  </div>

  {/* Right side (all other buttons) */}
  <div className="flex flex-col sm:flex-row justify-end gap-2 w-full sm:w-auto">
    {enquiry.status !== 'booked' && enquiry.status !== 'lost' && (
      <>
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

        {/* Accept Enquiry Button */}
        {enquiry.assignmentStatus === 'pending' && 
         enquiry.assignedTo === (user as any)?.id && 
         ((user as any)?.role?.name === 'salesperson' || (user as any)?.role?.name === 'manager') && (
          <Button 
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-blue-600 hover:bg-blue-700" 
            data-testid="button-accept-enquiry"
            onClick={() => handleAcceptEnquiry()}
            size="sm"
          >
            <CheckCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Accept Enquiry</span>
            <span className="sm:hidden">Accept</span>
          </Button>
        )}

        {/* Convert to Booking Button */}
        {enquiry.status === 'converted' && !hasBooking && (
          <Button 
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-green-600 hover:bg-green-700" 
            data-testid="button-convert-to-booking"
            onClick={() => setShowBookingForm(true)}
            size="sm"
          >
            <CheckCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Convert to Booking</span>
            <span className="sm:hidden">Book</span>
          </Button>
        )}

        {hasBooking && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            ✓ Booking already created for this enquiry
          </div>
        )}
      </>
    )}

    {/* Reopen Button */}
    {enquiry.status === 'lost' && (
      <Button 
        variant="default"
        className="flex items-center justify-center gap-2 w-full sm:w-auto" 
        data-testid="button-reopen-enquiry"
        onClick={() => setShowReopenDialog(true)}
        size="sm"
      >
        <AlertCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Reopen Enquiry</span>
        <span className="sm:hidden">Reopen</span>
      </Button>
    )}

    {/* Create New Enquiry Button */}
    {enquiry.status === 'closed' && (
      <Button 
        variant="outline"
        className="flex items-center justify-center gap-2 w-full sm:w-auto" 
        data-testid="button-create-new-enquiry"
        onClick={() => {
          if (onCreateNewFromClosed && enquiry) {
            onCreateNewFromClosed(enquiry);
          }
        }}
        size="sm"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Create New Enquiry</span>
        <span className="sm:hidden">New</span>
      </Button>
    )}

    {/* Locked State */}
    {enquiry.status === 'booked' && (
      <div className="text-sm text-muted-foreground italic px-3 py-2">
        Status locked after booking
      </div>
    )}
  </div>
</div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
              {/* Basic Information */}
              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Label className="font-medium text-xs sm:text-sm">Enquiry Date:</Label>
                    </div>
                    <span className="text-sm sm:ml-0">{format(new Date(enquiry.enquiryDate), "dd MMMM, yyyy")}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(enquiry.status || "new")}>
                      {getStatusLabel(enquiry.status || "new")}
                    </Badge>
                  </div>
                  
                  {enquiry.closureReason && (enquiry.status === 'closed' || enquiry.status === 'lost') && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                      <Label className="font-medium text-red-800">Closure Reason:</Label>
                      <p className="text-sm text-red-700 mt-1">{enquiry.closureReason}</p>
                    </div>
                  )}

                  {enquiry.followUpDate && (enquiry.status === 'quotation_sent' || enquiry.status === 'ongoing') && (enquiry as any).hasIncompleteFollowUp && (
                    <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-orange-600" />
                        <Label className="font-medium text-orange-800">Follow-up Scheduled:</Label>
                      </div>
                      <p className="text-sm text-orange-700 mt-1">
                        {format(new Date(enquiry.followUpDate), "dd MMMM, yyyy 'at' HH:mm")}
                      </p>
                      {(enquiry as any).followUpNotes && (
                        <p className="text-xs text-orange-600 mt-1 italic">{(enquiry as any).followUpNotes}</p>
                      )}
                    </div>
                  )}

                  <Separator />

                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <Label className="font-medium text-xs sm:text-sm">Client Name:</Label>
                    <span className="text-sm">{enquiry.clientName}</span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Label className="font-medium text-xs sm:text-sm">Contact:</Label>
                    </div>
                    <a 
                      href={`tel:${enquiry.contactNumber}`} 
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors break-all"
                      data-testid="link-contact-number"
                      title="Click to call"
                    >
                      {enquiry.contactNumber}
                    </a>
                  </div>

                  {enquiry.email && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Label className="font-medium text-xs sm:text-sm">Email:</Label>
                      </div>
                      <span className="text-sm break-all">{enquiry.email}</span>
                    </div>
                  )}

                  {enquiry.city && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Label className="font-medium text-xs sm:text-sm">City:</Label>
                      </div>
                      <span className="text-sm">{enquiry.city}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <Label className="font-medium text-xs sm:text-sm">Source:</Label>
                    <span className="text-sm">{getSourceLabel(enquiry.source || "")}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Event Information */}
              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Event Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <Label className="font-medium text-xs sm:text-sm">Event Type:</Label>
                    <span className="text-sm capitalize">{enquiry.eventType}</span>
                  </div>

                  {enquiry.eventDate && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Label className="font-medium text-xs sm:text-sm">Event Date:</Label>
                      </div>
                      <span className="text-sm sm:ml-0">{format(new Date(enquiry.eventDate), "dd MMMM, yyyy")}</span>
                    </div>
                  )}

                  {enquiry.expectedPax && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Label className="font-medium text-xs sm:text-sm">Expected PAX:</Label>
                      </div>
                      <span className="text-sm sm:ml-0">{enquiry.expectedPax}</span>
                    </div>
                  )}

                  {enquiry.numberOfRooms !== undefined && enquiry.numberOfRooms !== null && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Label className="font-medium text-xs sm:text-sm">Number of Rooms:</Label>
                      </div>
                      <span className="text-sm sm:ml-0">{enquiry.numberOfRooms}</span>
                    </div>
                  )}

                  {(enquiry as any).tentativeDates && Array.isArray((enquiry as any).tentativeDates) && (enquiry as any).tentativeDates.length > 0 && (
                    <div>
                      <Label className="font-medium">Tentative Dates:</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {((enquiry as any).tentativeDates as string[]).map((date: string, index: number) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {format(new Date(date), "dd MMM, yyyy")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Show confirmed booking dates if a booking exists */}
                  {hasBooking && (() => {
                    const relatedBooking = (existingBookings || []).find(booking => booking.enquiryId === enquiry?.id);
                    return relatedBooking && relatedBooking.eventDuration > 1 && relatedBooking.eventDates && (
                      <div>
                        <Label className="font-medium">Confirmed Event Dates:</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {relatedBooking.eventDates.map((date: string, index: number) => (
                            <Badge key={index} variant="default" className="text-xs bg-green-100 text-green-800">
                              Day {index + 1}: {format(new Date(date), "dd MMM, yyyy")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {enquiry.notes && (
              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Additional Notes</CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6">
                  <p className="text-sm whitespace-pre-wrap break-words">{enquiry.notes}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Follow-ups Tab */}
          <TabsContent value="sessions" className="space-y-4 min-h-[500px] relative z-10" style={{ pointerEvents: 'auto' }}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Event Sessions</h3>
                <p className="text-sm text-muted-foreground">
                  Manage venue sessions and event details
                </p>
              </div>
              {enquiry?.status !== 'booked' && enquiry?.status !== 'lost' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Create a new empty session and enter edit mode (don't add to sessions array yet)
                      const newSessionId = Math.random().toString(36).substr(2, 9);
                      const newSession = {
                        id: newSessionId,
                        sessionName: "",
                        sessionLabel: "",
                        venue: "",
                        startTime: "",
                        endTime: "",
                        sessionDate: enquiry?.eventDate ? new Date(enquiry.eventDate) : new Date(),
                        paxCount: 0,
                        specialInstructions: "",
                      };
                      // Store in local editing state, not in sessions array yet
                      setEditingSessionData(newSession);
                      setEditingSessionId(newSessionId);
                      setIsNewSession(true); // Mark as new session
                      setIsEditingSessions(true); // Enter edit mode
                    }}
                    className="flex items-center gap-2"
                    disabled={!!editingSessionId} // Disable if already editing a session
                  >
                    <Plus className="w-4 h-4" />
                    Add Session
                  </Button>
                </div>
              )}
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
                              }) || session; // Fallback to original session if not found
                              
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
                                  : (enquiry?.eventDate ? new Date(enquiry.eventDate) : new Date()),
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
                                        // In single session mode, we only accept exactly one session
                                        if (newSessions && newSessions.length === 1 && newSessions[0]) {
                                          const newSession = newSessions[0];
                                          
                                          // Update only the local editing state, not the main sessions array
                                          const updatedSession = { 
                                            ...(editingSessionData || sessionToEdit),
                                            ...newSession,
                                            id: sessionId,
                                            // Ensure all required fields are preserved
                                            sessionName: newSession.sessionName !== undefined ? newSession.sessionName : (editingSessionData?.sessionName || sessionToEdit.sessionName || ""),
                                            venue: newSession.venue !== undefined ? newSession.venue : (editingSessionData?.venue || sessionToEdit.venue || ""),
                                            sessionDate: newSession.sessionDate || editingSessionData?.sessionDate || sessionToEdit.sessionDate || (enquiry?.eventDate ? new Date(enquiry.eventDate) : new Date()),
                                            startTime: newSession.startTime !== undefined ? newSession.startTime : (editingSessionData?.startTime || sessionToEdit.startTime || ""),
                                            endTime: newSession.endTime !== undefined ? newSession.endTime : (editingSessionData?.endTime || sessionToEdit.endTime || ""),
                                            sessionLabel: newSession.sessionLabel !== undefined ? newSession.sessionLabel : (editingSessionData?.sessionLabel || sessionToEdit.sessionLabel || ""),
                                            paxCount: newSession.paxCount !== undefined ? newSession.paxCount : (editingSessionData?.paxCount ?? sessionToEdit.paxCount ?? 0),
                                            specialInstructions: newSession.specialInstructions !== undefined ? newSession.specialInstructions : (editingSessionData?.specialInstructions || sessionToEdit.specialInstructions || "")
                                          };
                                          
                                          // Update local editing state only
                                          setEditingSessionData(updatedSession);
                                        }
                                        // If newSessions.length !== 1 or invalid, ignore it (prevent add/remove in edit mode)
                                      }}
                                      eventStartDate={
                                        enquiry?.eventDate
                                          ? new Date(enquiry.eventDate).toISOString().split("T")[0]
                                          : undefined
                                      }
                                      eventEndDate={
                                        enquiry?.eventEndDate
                                          ? new Date(enquiry.eventEndDate).toISOString().split("T")[0]
                                          : undefined
                                      }
                                      eventDuration={enquiry?.eventDuration || 1}
                                      eventDates={
                                        Array.isArray(enquiry?.eventDates)
                                          ? (enquiry?.eventDates || [])
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
                                          // If it's a new session, remove it from the sessions array
                                          if (isNewSession) {
                                            // Don't need to remove from sessions array since we never added it
                                            // Just clear the editing state
                                          } else {
                                            // For existing sessions, restore from original enquiry.sessions
                                            if (enquiry?.sessions) {
                                              const originalSession = enquiry.sessions.find((s: any) => {
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
                                        {group.title && (
                                          <Badge variant="secondary">
                                            {group.title.includes("•")
                                              ? group.title.split("•")[1]?.trim()
                                              : group.title}
                                          </Badge>
                                        )}
                                      </div>
                                      {isComplete ? (
                                        <>
                                          <h4 className="font-medium text-lg">{session.sessionName}</h4>
                                          {session.sessionLabel && (
                                            <p className="text-sm text-muted-foreground">{session.sessionLabel}</p>
                                          )}
                                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                              <MapPin className="w-4 h-4" />
                                              <span className="font-medium">{session.venue}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <Clock className="w-4 h-4" />
                                              {session.startTime} - {session.endTime}
                                            </div>
                                            {session.paxCount > 0 && (
                                              <div className="flex items-center gap-1">
                                                <Users className="w-4 h-4" />
                                                {session.paxCount} guests
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
                                    {enquiry?.status !== "booked" && enquiry?.status !== "lost" && (
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
                                              setIsNewSession(false); // Existing session
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
                                    )}
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
                // Empty State
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p>No sessions added yet</p>
                  <p className="text-xs mt-1">Click "Add Session" above to create your first session</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Collision Dialog for Sessions Update */}
          <Dialog open={showCollisionDialog} onOpenChange={setShowCollisionDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Collision detected</DialogTitle>
                <DialogDescription>
                  {collisionMessage || 'Venue collision with an existing converted/booked record. Your changes were not saved.'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setShowCollisionDialog(false)}>OK</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Quotations Tab */}
          <TabsContent value="quotations" className="space-y-4 min-h-[500px]">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Quotation Management</h3>
                <p className="text-sm text-muted-foreground">
                  Create and send custom quotations to customers
                </p>
              </div>
              <Button
                onClick={() => setShowQuotationForm(true)}
                size="sm"
                data-testid="button-add-quotation"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Quotation
              </Button>
            </div>

            {/* Quotation History Component */}
            {enquiry && (
              <QuotationHistory 
                enquiryId={enquiry.id} 
                onEditQuotation={(quotation) => {
                  setEditingQuotation(quotation);
                  setShowQuotationForm(true);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="followups" className="space-y-4 min-h-[500px]">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Follow-up Management</h3>
                {followUpStats && (
                  <p className="text-sm text-muted-foreground">
                    {followUpStats.completed || 0} of {followUpStats.total || 0} follow-ups completed
                  </p>
                )}
              </div>
              <Button
                onClick={() => setShowFollowUpForm(true)}
                size="sm"
                data-testid="button-add-followup"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Follow-up
              </Button>
            </div>

            {/* Follow-up Form */}
            {showFollowUpForm && (
              <Card>
                <CardHeader>
                  <CardTitle>Schedule New Follow-up</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="followUpDate">Date *</Label>
                      <Input
                        id="followUpDate"
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        max={enquiry?.eventDate ? new Date(enquiry.eventDate).toISOString().split('T')[0] : undefined}
                        value={newFollowUpDate}
                        onChange={(e) => {
                          const selectedDate = e.target.value;
                          // Validate that selected date is not after event date
                          if (enquiry?.eventDate && selectedDate) {
                            const eventDateStr = new Date(enquiry.eventDate).toISOString().split('T')[0];
                            if (selectedDate > eventDateStr) {
                              toast({
                                title: "Invalid Date",
                                description: "Follow-up date cannot be after the event date.",
                                variant: "destructive",
                              });
                              return;
                            }
                          }
                          setNewFollowUpDate(selectedDate);
                        }}
                        data-testid="input-new-followup-date"
                      />
                      {enquiry?.eventDate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Must be on or before event date: {new Date(enquiry.eventDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="followUpTime">Time *</Label>
                      <TimePicker
                        id="followUpTime"
                        value={newFollowUpTime}
                        onChange={setNewFollowUpTime}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="followUpNotes">Notes</Label>
                    <Textarea
                      id="followUpNotes"
                      value={newFollowUpNotes}
                      onChange={(e) => setNewFollowUpNotes(e.target.value)}
                      placeholder="Enter follow-up notes and instructions..."
                      rows={3}
                      data-testid="textarea-new-followup-notes"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="repeatFollowUp"
                      checked={repeatFollowUp}
                      onCheckedChange={(checked) => setRepeatFollowUp(checked as boolean)}
                      data-testid="checkbox-repeat-followup"
                    />
                    <Label htmlFor="repeatFollowUp">Repeat follow-up</Label>
                  </div>

                  {repeatFollowUp && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <Label htmlFor="repeatInterval">Repeat every (days)</Label>
                        <Input
                          id="repeatInterval"
                          type="number"
                          value={repeatInterval}
                          onChange={(e) => setRepeatInterval(parseInt(e.target.value) || 7)}
                          min="1"
                          data-testid="input-repeat-interval"
                        />
                      </div>
                      <div>
                        <Label htmlFor="repeatEndDate">End date (optional)</Label>
                        <Input
                          id="repeatEndDate"
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          max={enquiry?.eventDate ? new Date(enquiry.eventDate).toISOString().split('T')[0] : undefined}
                          value={repeatEndDate}
                          onChange={(e) => {
                            const selectedDate = e.target.value;
                            // Validate that selected date is not after event date
                            if (enquiry?.eventDate && selectedDate) {
                              const eventDateStr = new Date(enquiry.eventDate).toISOString().split('T')[0];
                              if (selectedDate > eventDateStr) {
                                toast({
                                  title: "Invalid Date",
                                  description: "Repeat end date cannot be after the event date.",
                                  variant: "destructive",
                                });
                                return;
                              }
                            }
                            setRepeatEndDate(selectedDate);
                          }}
                          data-testid="input-repeat-end-date"
                        />
                        {enquiry?.eventDate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be on or before event date: {new Date(enquiry.eventDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowFollowUpForm(false)}
                      data-testid="button-cancel-followup"
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateFollowUp}
                      disabled={createFollowUpMutation.isPending}
                      data-testid="button-save-followup"
                      className="w-full sm:w-auto"
                    >
                      {createFollowUpMutation.isPending ? "Saving..." : "Save Follow-up"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Follow-up History */}
            <Card>
              <CardHeader>
                <CardTitle>Follow-up History</CardTitle>
              </CardHeader>
              <CardContent>
                {followUpHistoryLoading ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">Loading follow-up history...</p>
                  </div>
                ) : (followUpHistory || []).length > 0 ? (
                  <div className="space-y-3">
                    {(followUpHistory || []).map((followUp: any) => (
                      <div
                        key={followUp.id}
                        className={`p-3 border rounded-lg ${
                          followUp.completed ? 'bg-green-50 border-green-200' : 
                          new Date(followUp.followUpDate) < new Date() ? 'bg-red-50 border-red-200' : 
                          'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="w-4 h-4" />
                              <span className="font-medium">
                                {format(new Date(followUp.followUpDate), "dd MMM, yyyy")} at {followUp.followUpTime}
                              </span>
                              {followUp.completed ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : new Date(followUp.followUpDate) < new Date() ? (
                                <AlertCircle className="w-4 h-4 text-red-600" />
                              ) : null}
                            </div>
                            <p className="text-sm text-gray-700">{followUp.notes}</p>
                            {followUp.repeatFollowUp && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Repeats every {followUp.repeatInterval} days
                                {followUp.repeatEndDate && ` until ${format(new Date(followUp.repeatEndDate), "dd MMM, yyyy")}`}
                              </p>
                            )}
                          </div>
                          {!followUp.completed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markFollowUpCompleted.mutate(followUp.id)}
                              disabled={markFollowUpCompleted.isPending}
                              data-testid={`button-complete-followup-${followUp.id}`}
                            >
                              Mark Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No follow-ups scheduled yet. Click "Add Follow-up" to schedule one.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Booking Form Dialog */}

        {/* Status Change Dialog */}
        <Dialog open={showStatusChange} onOpenChange={setShowStatusChange}>
          <DialogContent className="max-w-md w-[98vw] sm:w-[95vw] md:w-full touch-manipulation">
            <DialogHeader className="space-y-2 pb-4">
              <DialogTitle className="text-lg">Change Enquiry Status</DialogTitle>
              <DialogDescription className="text-sm">
                Update the status of this enquiry
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="status">New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {validStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newStatus === 'lost' && (
                <>
                  <div>
                    <Label htmlFor="lossReason">Loss Reason *</Label>
                    <Select value={lossReason} onValueChange={setLossReason}>
                      <SelectTrigger data-testid="select-loss-reason">
                        <SelectValue placeholder="Select loss reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="price_budget_mismatch">Price too high / Budget mismatch</SelectItem>
                        <SelectItem value="venue_not_available">Venue not available on required date</SelectItem>
                        <SelectItem value="chose_competitor">Chose competitor venue</SelectItem>
                        <SelectItem value="client_unresponsive">Client unresponsive / Not reachable</SelectItem>
                        <SelectItem value="requirements_changed">Requirements changed / Event cancelled by client</SelectItem>
                        <SelectItem value="duplicate_invalid">Duplicate / Invalid enquiry</SelectItem>
                        <SelectItem value="other">Other (with notes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {lossReason === 'other' && (
                    <div>
                      <Label htmlFor="lossReasonNotes">Additional Notes *</Label>
                      <Textarea
                        id="lossReasonNotes"
                        value={lossReasonNotes}
                        onChange={(e) => setLossReasonNotes(e.target.value)}
                        placeholder="Please provide more details..."
                        data-testid="textarea-loss-reason-notes"
                        rows={3}
                      />
                    </div>
                  )}
                </>
              )}

              {newStatus === 'closed' && (
                <div>
                  <Label htmlFor="reason">Closure Reason *</Label>
                  <Input
                    id="reason"
                    value={closureReason}
                    onChange={(e) => setClosureReason(e.target.value)}
                    placeholder="Enter reason for closing this enquiry"
                    data-testid="input-closure-reason"
                  />
                </div>
              )}

              {newStatus === 'quotation_sent' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="followUpDate">Follow-up Date *</Label>
                      <Input
                        id="followUpDate"
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        data-testid="input-follow-up-date"
                      />
                    </div>
                    <div>
                      <Label htmlFor="followUpTime">Follow-up Time *</Label>
                      <TimePicker
                        id="followUpTime"
                        value={followUpTime}
                        onChange={setFollowUpTime}
                        data-testid="input-follow-up-time"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="followUpNotes">Follow-up Notes</Label>
                    <Input
                      id="followUpNotes"
                      value={followUpNotes}
                      onChange={(e) => setFollowUpNotes(e.target.value)}
                      placeholder="Notes for follow-up (optional)"
                      data-testid="input-follow-up-notes"
                    />
                  </div>
                </>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowStatusChange(false)}
                  data-testid="button-cancel-status"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleStatusChange}
                  disabled={updateStatusMutation.isPending}
                  data-testid="button-save-status"
                  className="w-full sm:w-auto"
                >
                  {updateStatusMutation.isPending ? "Updating..." : "Update Status"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Follow-up Completion Confirmation Dialog */}
        <Dialog open={showFollowUpConfirmation} onOpenChange={setShowFollowUpConfirmation}>
          <DialogContent aria-describedby="followup-confirmation-description">
            <DialogHeader>
              <DialogTitle>Complete Follow-ups?</DialogTitle>
              <DialogDescription id="followup-confirmation-description">
                This enquiry has pending follow-up reminders. Would you like to mark all follow-ups as completed?
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {(followUpHistory || []).filter((f: any) => !f.completed).length} pending follow-up(s) will be marked as completed if you select "Yes".
              </p>
              
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleFollowUpConfirmation(false)}
                  data-testid="button-keep-followups"
                  className="w-full sm:w-auto"
                >
                  No, Keep Follow-ups
                </Button>
                <Button 
                  onClick={() => handleFollowUpConfirmation(true)}
                  data-testid="button-complete-followups"
                  className="w-full sm:w-auto"
                >
                  Yes, Complete All
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reopen Enquiry Dialog */}
        <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
          <DialogContent aria-describedby="reopen-dialog-description">
            <DialogHeader>
              <DialogTitle>Reopen Lost Enquiry</DialogTitle>
              <DialogDescription id="reopen-dialog-description">
                Provide a reason for reopening this enquiry. The enquiry will be moved back to ongoing status.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reopenReason">Reopen Reason *</Label>
                <Select 
                  value={reopenReason} 
                  onValueChange={setReopenReason}
                >
                  <SelectTrigger data-testid="select-reopen-reason">
                    <SelectValue placeholder="Select reason for reopening" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_reconnected">Client reconnected & revived interest</SelectItem>
                    <SelectItem value="wrongly_marked_lost">Wrongly marked Lost earlier</SelectItem>
                    <SelectItem value="package_revised">Package revised & acceptable now</SelectItem>
                    <SelectItem value="event_postponed">Event postponed, revived later</SelectItem>
                    <SelectItem value="other">Other (with notes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="reopenNotes">
                  {reopenReason === 'other' 
                    ? 'Additional Notes *' 
                    : 'Additional Notes (Optional)'}
                </Label>
                <Textarea
                  id="reopenNotes"
                  value={reopenNotes}
                  onChange={(e) => setReopenNotes(e.target.value)}
                  placeholder={
                    reopenReason === 'other' 
                      ? "Please specify the reason for reopening..." 
                      : "Enter any additional notes about why this enquiry is being reopened..."
                  }
                  rows={3}
                  data-testid="textarea-reopen-notes"
                />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowReopenDialog(false);
                    setReopenReason('');
                    setReopenNotes('');
                  }}
                  data-testid="button-cancel-reopen"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleReopenEnquiry}
                  disabled={reopenEnquiryMutation.isPending || !reopenReason}
                  data-testid="button-confirm-reopen"
                  className="w-full sm:w-auto"
                >
                  {reopenEnquiryMutation.isPending ? "Reopening..." : "Reopen Enquiry"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>

    {/* Collision Dialog for status change */}
    <Dialog open={collisionOpen} onOpenChange={setCollisionOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {collisionBlocking ? 'Venue Collision Detected' : 'Venue Collision Warning'}
          </DialogTitle>
          <DialogDescription>
            {collisionBlocking
              ? 'Another enquiry is already Converted/Booked for the same venue, date and time. You cannot change to this status.'
              : 'Another enquiry exists for the same venue, date and time (New/Ongoing/Quotation Sent). You may still proceed.'}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-60 overflow-auto space-y-2 text-sm">
          {collisionMessages.map((m, i) => (
            <div key={i} className="p-2 rounded border bg-amber-50 border-amber-200 text-amber-900">{m}</div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" onClick={() => setCollisionOpen(false)}>Close</Button>
          {!collisionBlocking && (
            <Button onClick={() => { setCollisionOpen(false); setBypassCollisionOnce(true); setTimeout(() => handleStatusChange(), 0); }}>Proceed Anyway</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Booking Form Dialog */}
    {enquiry && (
      <BookingForm 
        enquiryId={enquiry.id}
        open={showBookingForm}
        onOpenChange={setShowBookingForm}
      />
    )}

    {/* Quotation Form Dialog */}
    {enquiry && (
      <QuotationForm 
        enquiry={enquiry}
        open={showQuotationForm}
        onOpenChange={(open) => {
          if (!open) {
            // Close all quotation-related modals
            setShowQuotationForm(false);
            setEditingQuotation(null);
            // Open enquiry modal with quotations tab
            setActiveTab("quotations");
          }
        }}
        editingQuotation={editingQuotation}
        onQuotationCreated={() => {
          // Close all quotation-related modals
          setShowQuotationForm(false);
          setEditingQuotation(null);
          // Open enquiry modal with quotations tab
          setActiveTab("quotations");
        }}
      />
    )}

    {/* Transfer Dialog */}
    <EnquiryTransferDialog
      enquiry={enquiry}
      open={showTransferDialog}
      onOpenChange={setShowTransferDialog}
    />
    </>
  );
}