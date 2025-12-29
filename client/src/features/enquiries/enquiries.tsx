import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import EnquiryForm from "./components/enquiry-form";
import EnquiryDetailsDialog from "./components/enquiry-details-dialog";
import PhoneLookupDialog from "./components/phone-lookup-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePicker } from "@/components/ui/time-picker";
import { Plus, Search, Filter, Eye, Phone, FileText, Edit, Calendar, X, Mail, ClipboardList, BarChart3, MapPin, Users } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EnquiryWithRelations } from "@/types";
import { formatDate } from "@/utils/dateFormat";
import { getStatusColor, getStatusLabel, enquiryStatusOptions } from "@/lib/status-utils";
import UnassignedEnquiries from "@/components/unassigned-enquiries";
import TransferNotifications from "@/components/transfer-notifications";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export default function Enquiries() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showPhoneLookup, setShowPhoneLookup] = useState(false);
  const [showEnquiryForm, setShowEnquiryForm] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<EnquiryWithRelations | null>(null);
  const [editingEnquiry, setEditingEnquiry] = useState<EnquiryWithRelations | null>(null);
  const [prefilledData, setPrefilledData] = useState<{ clientName?: string; email?: string; city?: string; contactNumber?: string } | null>(null);
  const [showEnquiryDetails, setShowEnquiryDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date"); // "date" for creation date, "status" for status
  const [showFilters, setShowFilters] = useState(false);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpEnquiry, setFollowUpEnquiry] = useState<EnquiryWithRelations | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("12:00");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [repeatFollowUp, setRepeatFollowUp] = useState(false);
  const [repeatInterval, setRepeatInterval] = useState(7);
  const [repeatEndDate, setRepeatEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25); // Default page size

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
  }, [isAuthenticated, isLoading, toast]);

  // Build query params for pagination
  const queryParams = new URLSearchParams();
  queryParams.set('page', currentPage.toString());
  queryParams.set('pageSize', pageSize.toString());
  if (statusFilter !== "all") {
    queryParams.set('status', statusFilter);
  }
  if (searchQuery.trim()) {
    queryParams.set('search', searchQuery.trim());
  }

  const queryString = queryParams.toString();
  const apiUrl = `/api/enquiries${queryString ? `?${queryString}` : ''}`;

  const { data: enquiriesResponse, isLoading: enquiriesLoading } = useQuery<EnquiryWithRelations[] | { data: EnquiryWithRelations[]; total: number; page: number; pageSize: number }>({
    queryKey: [apiUrl],
    enabled: isAuthenticated,
  });

  // Handle both paginated and non-paginated responses
  const enquiries = Array.isArray(enquiriesResponse) ? enquiriesResponse : (enquiriesResponse?.data || []);
  const totalCount = Array.isArray(enquiriesResponse) ? undefined : enquiriesResponse?.total;
  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, followUpFilter, dateFilter, eventTypeFilter, salespersonFilter]);

  // Handle URL search parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    const highlightParam = urlParams.get('highlight');
    
    if (searchParam) {
      setSearchQuery(searchParam);
    }
    
    if (highlightParam && (enquiries || []).length > 0) {
      const enquiryToHighlight = (enquiries || []).find(e => e.id === highlightParam);
      if (enquiryToHighlight) {
        // Check if user can view enquiry details before opening modal
        const userRole = (user as any)?.role?.name || (user as any)?.role;
        const userId = (user as any)?.id || (user as any)?._id;
        const isOwner = enquiryToHighlight.salespersonId === userId || enquiryToHighlight.createdBy === userId;
        
        // Permission rules:
        // Staff: Cannot open any enquiry modal
        // Admin: Can open any enquiry modal
        // Manager/Salesperson: Can open only their own enquiries
        if (userRole === 'staff') {
          toast({
            title: "Access Restricted",
            description: "Staff users cannot view enquiry details.",
            variant: "destructive",
          });
          return;
        } else if ((userRole === 'manager' || userRole === 'salesperson') && !isOwner) {
          toast({
            title: "Access Restricted",
            description: "You can only view details of enquiries you own.",
            variant: "destructive",
          });
          return;
        }
        // Admin can access all enquiries (no restriction needed)
        
        setSelectedEnquiry(enquiryToHighlight);
        setShowEnquiryDetails(true);
      }
    }
  }, [enquiries]);


  // Handle claiming an unassigned enquiry
  const handleClaimEnquiry = async (enquiry: EnquiryWithRelations) => {
    try {
      const response = await apiRequest("PATCH", `/api/enquiries/${enquiry.id}`, {
        assignmentStatus: 'assigned',
        salespersonId: (user as any)?.id,
        assignedTo: (user as any)?.id
      });
      
      if (response.ok) {
        // Invalidate queries to refresh the enquiry list
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
        queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiry.id}`] });
        
        toast({
          title: "Success",
          description: `Enquiry ${enquiry.enquiryNumber} claimed successfully`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to claim enquiry",
        variant: "destructive",
      });
    }
  };

  const handleFollowUpSubmit = () => {
    if (!followUpDate || !followUpEnquiry) {
      toast({
        variant: "destructive",
        description: "Please select a follow-up date",
      });
      return;
    }

    // Validate that follow-up date is not in the past
    const followUpDateObj = new Date(followUpDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    if (followUpDateObj < today) {
      toast({
        variant: "destructive",
        description: "Follow-up date cannot be in the past",
      });
      return;
    }

    // Validate that follow-up date is not after event date
    if (followUpEnquiry.eventDate && followUpDate) {
      const eventDate = new Date(followUpEnquiry.eventDate);
      eventDate.setHours(23, 59, 59, 999); // Set to end of event date
      const followUpDateObj = new Date(followUpDate);
      followUpDateObj.setHours(23, 59, 59, 999);
      if (followUpDateObj > eventDate) {
        toast({
          variant: "destructive",
          description: "Follow-up date cannot be after the event date.",
        });
        return;
      }
    }

    // Validate that repeat end date (if provided) is not after event date
    if (repeatFollowUp && repeatEndDate && followUpEnquiry.eventDate) {
      const eventDate = new Date(followUpEnquiry.eventDate);
      eventDate.setHours(23, 59, 59, 999);
      const endDate = new Date(repeatEndDate);
      endDate.setHours(23, 59, 59, 999);
      if (endDate > eventDate) {
        toast({
          variant: "destructive",
          description: "Repeat end date cannot be after the event date.",
        });
        return;
      }
    }

    // Create follow-up history entry when setting a follow-up
    const followUpHistoryData = {
      enquiryId: followUpEnquiry.id,
      followUpDate: new Date(followUpDate), // Convert to Date object
      followUpTime: followUpTime,
      notes: followUpNotes,
      setById: user?.id || "", // Use current user ID
      repeatFollowUp: repeatFollowUp,
      repeatInterval: repeatFollowUp ? repeatInterval : null,
      repeatEndDate: repeatFollowUp && repeatEndDate ? new Date(repeatEndDate) : null,
    };

    // Create the follow-up history record
    apiRequest("POST", "/api/follow-ups", followUpHistoryData)
      .then(() => {
        // Invalidate and refetch follow-up related queries after creating the follow-up history
        queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
        queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${followUpEnquiry.id}/follow-ups`] });
        queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${followUpEnquiry.id}/follow-up-stats`] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
        // Force refetch to update dashboard immediately
        queryClient.refetchQueries({ queryKey: ["/api/follow-ups"] });
        
        toast({
          title: "Success",
          description: "Follow-up created successfully",
        });
        
        setShowFollowUpDialog(false);
        setFollowUpDate("");
        setFollowUpTime("12:00");
        setFollowUpNotes("");
        setRepeatFollowUp(false);
        setRepeatInterval(7);
        setRepeatEndDate("");
      })
      .catch((error) => {
        toast({
          title: "Error",
          description: "Failed to create follow-up record",
          variant: "destructive",
        });
      });
  };

  const openFollowUpDialog = (enquiry: EnquiryWithRelations) => {
    setFollowUpEnquiry(enquiry);
    setFollowUpDate(enquiry.followUpDate ? new Date(enquiry.followUpDate).toISOString().split('T')[0] : "");
    setFollowUpTime(enquiry.followUpTime || "12:00");
    setFollowUpNotes(enquiry.followUpNotes || "");
    setRepeatFollowUp(enquiry.repeatFollowUp || false);
    setRepeatInterval(enquiry.repeatInterval || 7);
    setRepeatEndDate(enquiry.repeatEndDate ? new Date(enquiry.repeatEndDate).toISOString().split('T')[0] : "");
    setShowFollowUpDialog(true);
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case 'wedding': return 'Wedding';
      case 'birthday': return 'Birthday Party';
      case 'corporate': return 'Corporate Event';
      case 'conference': return 'Conference';
      case 'anniversary': return 'Anniversary';
      case 'other': return 'Other';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="hidden lg:block w-64 bg-card border-r animate-pulse"></div>
        <div className="flex-1 p-4 lg:p-6 animate-pulse">
          <div className="h-6 lg:h-8 bg-muted rounded w-32 lg:w-48 mb-4 lg:mb-6"></div>
          <div className="space-y-3 lg:space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-12 lg:h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto lg:ml-0 ml-0 h-screen touch-pan-y" style={{ paddingTop: '0' }}>
        <header className="bg-card border-b border-border px-4 lg:px-6 py-3 lg:py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1 flex justify-center">
              <div className="text-center">
                <h1 className="text-xl lg:text-2xl font-bold text-foreground">Enquiries</h1>
                <p className="text-sm text-muted-foreground hidden lg:block">Manage and track all customer enquiries</p>
              </div>
            </div>
            
            <Button 
              onClick={() => {
                setPrefilledData(null);
                setEditingEnquiry(null);
                setShowPhoneLookup(true);
              }} 
              data-testid="button-new-enquiry"
              size="sm"
              className="lg:size-default"
            >
              <Plus className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">New Enquiry</span>
            </Button>
          </div>
        </header>

        <div className="p-3 lg:p-6 pb-20 lg:pb-6 space-y-6">
          {/* Transfer Notifications */}
          <TransferNotifications />
          
          {/* Unassigned Enquiries Section */}
          <UnassignedEnquiries onClaim={() => {
            // Refresh enquiries when one is claimed
            queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
          }} />
          
          <Card className="shadow-lg border-0">
            <CardHeader className="pb-3 lg:pb-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <CardTitle className="text-lg lg:text-xl">All Enquiries</CardTitle>
                <div className="flex flex-row items-center gap-2 sm:gap-3">
                  {/* Search - Side by side with filter on all screens */}
                  <div className="relative flex-1 min-w-0">
                    <Input
                      type="search"
                      placeholder="Search by ENQ number, client name..."
                      className="w-full"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-search-enquiries"
                    />
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                  
                  {/* Sort and Filters */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[140px] sm:w-[160px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">By Date (Newest)</SelectItem>
                        <SelectItem value="date-oldest">By Date (Oldest)</SelectItem>
                        <SelectItem value="status">By Status</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Popover open={showFilters} onOpenChange={setShowFilters}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="relative whitespace-nowrap">
                          <Filter className="w-4 h-4 mr-2" />
                          <span className="hidden sm:inline">Filters</span>
                          {(statusFilter !== "all" || followUpFilter !== "all" || eventTypeFilter !== "all" || dateFilter !== "all") && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0 max-h-96 overflow-hidden" align="end">
                        <div className="p-4 border-b">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Filter Enquiries</h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowFilters(false)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="p-4 space-y-4 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                          <div>
                            <Label className="text-sm font-medium mb-2 block">Status</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {enquiryStatusOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-sm font-medium mb-2 block">Follow-up Status</Label>
                            <Select value={followUpFilter} onValueChange={setFollowUpFilter}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Follow-ups</SelectItem>
                                <SelectItem value="overdue">🔴 Overdue</SelectItem>
                                <SelectItem value="pending">🟡 Pending</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <Label className="text-sm font-medium mb-2 block">Event Type</Label>
                            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Events</SelectItem>
                                <SelectItem value="wedding">Wedding</SelectItem>
                                <SelectItem value="corporate">Corporate</SelectItem>
                                <SelectItem value="birthday">Birthday</SelectItem>
                                <SelectItem value="anniversary">Anniversary</SelectItem>
                                <SelectItem value="social">Social</SelectItem>
                                <SelectItem value="conference">Conference</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <Label className="text-sm font-medium mb-2 block">Date Range</Label>
                            <Select value={dateFilter} onValueChange={setDateFilter}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Dates</SelectItem>
                                <SelectItem value="today">Today</SelectItem>
                                <SelectItem value="tomorrow">Tomorrow</SelectItem>
                                <SelectItem value="this_week">This Week</SelectItem>
                                <SelectItem value="next_week">Next Week</SelectItem>
                                <SelectItem value="this_month">This Month</SelectItem>
                                <SelectItem value="next_month">Next Month</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        
                        <div className="p-4 border-t bg-background sticky bottom-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSearchQuery("");
                              setStatusFilter("all");
                              setFollowUpFilter("all");
                              setEventTypeFilter("all");
                              setDateFilter("all");
                              setSalespersonFilter("all");
                            }}
                          >
                            Clear All
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {enquiriesLoading ? (
                <div className="space-y-4">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
                  ))}
                </div>
              ) : (enquiries || []).length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No enquiries found</p>
                  <Button onClick={() => {
                    setPrefilledData(null);
                    setEditingEnquiry(null);
                    setShowPhoneLookup(true);
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Enquiry
                  </Button>
                </div>
              ) : (
                <>
                  {/* Desktop Table View - Enhanced */}
                  <div className="hidden lg:block overflow-x-auto rounded-xl border border-border shadow-sm">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-border">
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">
                            ENQ #
                          </th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Client Details</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Event Details</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Status & Follow-up</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Salesperson</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                      {(enquiries || []).map((enquiry) => (
                        <tr 
                          key={enquiry.id} 
                          className="border-b border-border hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent cursor-pointer transition-all duration-200 group"
                          onClick={() => {
                            // Check if user can view enquiry details
                            const userRole = (user as any)?.role?.name || (user as any)?.role;
                            const userId = (user as any)?.id || (user as any)?._id;
                            const isOwner = enquiry.salespersonId === userId || enquiry.createdBy === userId;
                            
                            // Permission rules:
                            // Staff: Cannot open any enquiry modal
                            // Admin: Can open any enquiry modal
                            // Manager/Salesperson: Can open only their own enquiries
                            if (userRole === 'staff') {
                              toast({
                                title: "Access Restricted",
                                description: "Staff users cannot view enquiry details.",
                                variant: "destructive",
                              });
                              return;
                            } else if ((userRole === 'manager' || userRole === 'salesperson') && !isOwner) {
                              toast({
                                title: "Access Restricted",
                                description: "You can only view details of enquiries you own.",
                                variant: "destructive",
                              });
                              return;
                            }
                            // Admin can access all enquiries (no restriction needed)
                            
                            setSelectedEnquiry(enquiry);
                            setShowEnquiryDetails(true);
                          }}
                          data-testid={`enquiry-row-${enquiry.id}`}
                        >
                          <td className="px-6 py-4 align-top">
                            <div>
                              <div className="text-xs text-muted-foreground font-mono bg-gray-100 px-2 py-1 rounded-md font-semibold" data-testid={`enquiry-number-${enquiry.id}`}>
                                {enquiry.enquiryNumber}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 font-medium">
                                {formatDate(enquiry.enquiryDate)}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="text-sm font-bold text-foreground leading-tight mb-1" data-testid={`enquiry-client-${enquiry.id}`}>
                              {enquiry.clientName}
                            </div>
                            <div className="text-xs text-muted-foreground font-medium">{enquiry.contactNumber}</div>
                            {enquiry.email && (
                              <div className="text-xs text-muted-foreground">{enquiry.email}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="text-sm font-semibold text-foreground mb-1">
                              {formatDate(enquiry.eventDate)}
                            </div>
                            <div className="text-xs text-muted-foreground font-medium">
                              {getEventTypeLabel(enquiry.eventType)} • {enquiry.expectedPax} PAX
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="space-y-3">
                              <Badge className={`${getStatusColor(enquiry.status || 'new')} shadow-sm font-medium`}>
                                {getStatusLabel(enquiry.status || 'new')}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                Updated: {formatDate(enquiry.updatedAt)}
                              </div>
                              {enquiry.nextFollowUpDate && enquiry.status !== 'booked' && (
                                <div className={`text-xs p-2 rounded-lg font-medium shadow-sm ${
                                  new Date(enquiry.nextFollowUpDate) < new Date() 
                                    ? 'bg-red-50 text-red-700 border border-red-200' 
                                    : 'bg-orange-50 text-orange-700 border border-orange-200'
                                }`}>
                                  📅 Follow-up: {formatDate(enquiry.nextFollowUpDate)}
                                  {new Date(enquiry.nextFollowUpDate) < new Date() && (
                                    <span className="font-bold"> (OVERDUE)</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="text-sm font-semibold text-foreground">
                              {enquiry.salesperson?.firstName} {enquiry.salesperson?.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground font-medium capitalize">
                              {enquiry.salesperson?.role}
                            </div>
                            {/* Assignment Status Display - Only show for unassigned/pending */}
                            {enquiry.assignmentStatus && enquiry.assignmentStatus !== 'assigned' && (
                              <div className="mt-1">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    enquiry.assignmentStatus === 'unassigned'
                                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                                      : enquiry.assignmentStatus === 'pending' 
                                      ? 'bg-yellow-50 text-yellow-700 border-yellow-200' 
                                      : enquiry.assignmentStatus === 'accepted'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : enquiry.assignmentStatus === 'rejected'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-gray-50 text-gray-700 border-gray-200'
                                  }`}
                                >
                                  {enquiry.assignmentStatus === 'unassigned' && '🔓 Available to Claim'}
                                  {enquiry.assignmentStatus === 'pending' && '⏳ Pending Assignment'}
                                  {enquiry.assignmentStatus === 'accepted' && '✅ Accepted'}
                                  {enquiry.assignmentStatus === 'rejected' && '❌ Rejected'}
                                </Badge>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="flex space-x-2">
                              {/* Role-based action permissions */}
                              {(() => {
                                const userRole = (user as any)?.role?.name || (user as any)?.role;
                                const userId = (user as any)?.id || (user as any)?._id;
                                const isOwner = enquiry.salespersonId === userId || enquiry.createdBy === userId;
                                
                                // Staff: No actions allowed
                                if (userRole === 'staff') {
                                  return (
                                    <span className="text-sm text-muted-foreground">View only</span>
                                  );
                                }
                                
                                // Salespeople/Managers: Can only act on their own enquiries
                                if (userRole === 'salesperson' || userRole === 'manager') {
                                  if (!isOwner) {
                                    return (
                                      <span className="text-sm text-muted-foreground">No actions</span>
                                    );
                                  }
                                }
                                
                                // Admin: Full rights on all enquiries
                                if (userRole === 'admin') {
                                  // Admin can do everything
                                }
                                
                                // Show action buttons for authorized users
                                return (
                                  <>
                                    {/* Claim Enquiry Button for unassigned enquiries */}
                                    {enquiry.assignmentStatus === 'unassigned' && 
                                     (userRole === 'salesperson' || userRole === 'manager' || userRole === 'admin') && (
                                      <Button 
                                        size="sm" 
                                        className="bg-blue-600 hover:bg-blue-700 text-white"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleClaimEnquiry(enquiry);
                                        }}
                                        title="Claim this enquiry"
                                        data-testid={`button-claim-enquiry-${enquiry.id}`}
                                      >
                                        <Plus className="w-4 h-4 mr-1" />
                                        Claim
                                      </Button>
                                    )}
                                    
                                    {/* Follow-up Button - Only for authorized users */}
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openFollowUpDialog(enquiry);
                                      }}
                                      title="Set Follow-up"
                                      data-testid={`button-follow-up-${enquiry.id}`}
                                      className="hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700"
                                    >
                                      <Calendar className="w-4 h-4" />
                                    </Button>
                                  </>
                                );
                              })()}
{/* Edit button hidden per user request */}
                            </div>
                          </td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination - Desktop */}
                  {totalCount !== undefined && totalCount > 0 && (
                    <div className="hidden lg:flex flex-col items-center justify-center gap-4 px-6 py-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} enquiries
                      </div>
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious 
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (currentPage > 1) setCurrentPage(currentPage - 1);
                              }}
                              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 7) {
                              pageNum = i + 1;
                            } else if (currentPage <= 4) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 3) {
                              pageNum = totalPages - 6 + i;
                            } else {
                              pageNum = currentPage - 3 + i;
                            }
                            
                            return (
                              <PaginationItem key={pageNum}>
                                <PaginationLink
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentPage(pageNum);
                                  }}
                                  isActive={currentPage === pageNum}
                                  className="cursor-pointer"
                                >
                                  {pageNum}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          })}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                              }}
                              className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}

                  {/* Mobile Card View - Enhanced for touch */}
                  <div className="lg:hidden space-y-3 pb-20">
                    {(enquiries || []).map((enquiry) => (
                      <Card 
                        key={enquiry.id} 
                        className="interactive-card glass-effect border-l-4 border-l-primary shadow-lg group touch-manipulation"
                        onClick={() => {
                          // Check if user can view enquiry details
                          const userRole = (user as any)?.role?.name || (user as any)?.role;
                          const userId = (user as any)?.id || (user as any)?._id;
                          const isOwner = enquiry.salespersonId === userId || enquiry.createdBy === userId;
                          
                          // Permission rules:
                          // Staff: Cannot open any enquiry modal
                          // Admin: Can open any enquiry modal
                          // Manager/Salesperson: Can open only their own enquiries
                          if (userRole === 'staff') {
                            toast({
                              title: "Access Restricted",
                              description: "Staff users cannot view enquiry details.",
                              variant: "destructive",
                            });
                            return;
                          } else if ((userRole === 'manager' || userRole === 'salesperson') && !isOwner) {
                            toast({
                              title: "Access Restricted",
                              description: "You can only view details of enquiries you own.",
                              variant: "destructive",
                            });
                            return;
                          }
                          // Admin can access all enquiries (no restriction needed)
                          
                          setSelectedEnquiry(enquiry);
                          setShowEnquiryDetails(true);
                        }}
                        data-testid={`enquiry-card-${enquiry.id}`}
                      >
                        <CardContent className="p-3 sm:p-4 touch-manipulation">
                          <div className="flex justify-between items-start mb-2 gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <div className="font-mono text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded font-semibold" data-testid={`enquiry-number-${enquiry.id}`}>
                                  {enquiry.enquiryNumber}
                                </div>
                              </div>
                              <div className="font-bold text-base sm:text-lg text-foreground mb-1.5" data-testid={`enquiry-client-${enquiry.id}`}>
                                {enquiry.clientName}
                              </div>
                            </div>
                            <Badge className={`${getStatusColor(enquiry.status || 'new')} shadow-sm font-medium text-xs flex-shrink-0`}>
                              {getStatusLabel(enquiry.status || 'new')}
                            </Badge>
                          </div>
                          
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                              <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                              <span className="font-medium">{formatDate(enquiry.eventDate)}</span>
                              <span className="text-muted-foreground/50">•</span>
                              <Users className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                              <span>{enquiry.expectedPax} PAX</span>
                              <span className="text-muted-foreground/50">•</span>
                              <span>{getEventTypeLabel(enquiry.eventType)}</span>
                              {enquiry.city && (
                                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                  <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                  <span className="truncate">{enquiry.city}</span>
                                </div>
                              )}
                              {enquiry.salesperson && (enquiry.salesperson.firstName || enquiry.salesperson.lastName) && (
                                <>
                                  <span className="text-muted-foreground/50">•</span>
                                  <Users className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                  <span>Salesperson: {enquiry.salesperson.firstName} {enquiry.salesperson.lastName}</span>
                                </>
                              )}
                            </div>
                            
                            {enquiry.nextFollowUpDate && enquiry.status !== 'booked' && (
                              <div className={`text-xs sm:text-sm py-1.5 px-2 rounded border font-medium ${
                                new Date(enquiry.nextFollowUpDate) < new Date() 
                                  ? 'bg-red-50 text-red-700 border-red-200' 
                                  : 'bg-orange-50 text-orange-700 border-orange-200'
                              }`}>
                                📅 Follow-up: {formatDate(enquiry.nextFollowUpDate)}
                                {new Date(enquiry.nextFollowUpDate) < new Date() && (
                                  <span className="font-bold"> (OVERDUE)</span>
                                )}
                              </div>
                            )}
                            
                            {/* Assignment Status for Mobile - Only show for unassigned/pending */}
                            {enquiry.assignmentStatus && enquiry.assignmentStatus !== 'assigned' && (
                              <div className="flex items-center justify-between gap-2 mt-1.5">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs py-0.5 px-2 ${
                                    enquiry.assignmentStatus === 'unassigned'
                                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                                      : enquiry.assignmentStatus === 'pending' 
                                      ? 'bg-yellow-50 text-yellow-700 border-yellow-200' 
                                      : enquiry.assignmentStatus === 'accepted'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : enquiry.assignmentStatus === 'rejected'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-gray-50 text-gray-700 border-gray-200'
                                  }`}
                                >
                                  {enquiry.assignmentStatus === 'unassigned' && '🔓 Available to Claim'}
                                  {enquiry.assignmentStatus === 'pending' && '⏳ Pending Assignment'}
                                  {enquiry.assignmentStatus === 'accepted' && '✅ Accepted'}
                                  {enquiry.assignmentStatus === 'rejected' && '❌ Rejected'}
                                </Badge>
                                
                                {/* Claim Button for Mobile - Role-based permissions */}
                                {(() => {
                                  const userRole = (user as any)?.role?.name || (user as any)?.role;
                                  
                                  // Staff: No actions allowed
                                  if (userRole === 'staff') {
                                    return (
                                      <span className="text-xs text-muted-foreground">View only</span>
                                    );
                                  }
                                  
                                  // Show claim button for authorized users on unassigned enquiries
                                  if (enquiry.assignmentStatus === 'unassigned' && 
                                      (userRole === 'salesperson' || userRole === 'manager' || userRole === 'admin')) {
                                    return (
                                      <Button 
                                        size="sm" 
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleClaimEnquiry(enquiry);
                                        }}
                                        data-testid={`button-claim-enquiry-mobile-${enquiry.id}`}
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Claim
                                      </Button>
                                    );
                                  }
                                  
                                  return null;
                                })()}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Pagination for Mobile */}
                  {totalCount !== undefined && totalCount > 0 && (
                    <div className="lg:hidden flex flex-col items-center justify-center gap-4 px-4 py-4 border-t mt-4">
                      <div className="text-sm text-muted-foreground text-center">
                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} enquiries
                      </div>
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious 
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (currentPage > 1) setCurrentPage(currentPage - 1);
                              }}
                              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            
                            return (
                              <PaginationItem key={pageNum}>
                                <PaginationLink
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentPage(pageNum);
                                  }}
                                  isActive={currentPage === pageNum}
                                  className="cursor-pointer"
                                >
                                  {pageNum}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          })}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                              }}
                              className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <PhoneLookupDialog
          open={showPhoneLookup}
          onOpenChange={setShowPhoneLookup}
          onPhoneFound={(data) => {
            setPrefilledData(data);
            setShowPhoneLookup(false);
            setShowEnquiryForm(true);
          }}
        />

        <EnquiryForm 
          open={showEnquiryForm} 
          onOpenChange={(open) => {
            setShowEnquiryForm(open);
            if (!open) {
              setEditingEnquiry(null);
              setPrefilledData(null);
            }
          }}
          editingEnquiry={editingEnquiry}
          prefilledData={prefilledData}
        />
        <EnquiryDetailsDialog 
          enquiry={selectedEnquiry} 
          open={showEnquiryDetails} 
          onOpenChange={setShowEnquiryDetails}
          onCreateNewFromClosed={(enquiry) => {
            // Close the details dialog
            setShowEnquiryDetails(false);
            setSelectedEnquiry(null);
            
            // Pre-fill form with enquiry data but clear IDs and dates for new enquiry
            const { id, enquiryNumber, createdAt, updatedAt, ...enquiryDataForNew } = enquiry;
            const enquiryForNewCreation = {
              ...enquiryDataForNew,
              status: 'new',
              enquiryDate: new Date().toISOString().split('T')[0],
              eventDate: '',
              closureReason: '',
              followUpDate: null,
              followUpNotes: '',
            };
            
            setEditingEnquiry(enquiryForNewCreation as any);
            setPrefilledData(null);
            setShowEnquiryForm(true);
          }}
          onEdit={(enquiry) => {
            setEditingEnquiry(enquiry);
            setPrefilledData(null);
            setShowEnquiryForm(true);
          }}
        />

        <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
          <DialogContent className="max-w-md w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle>Set Follow-up for {followUpEnquiry?.clientName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="followUpDate">Follow-up Date</Label>
                  <Input
                    id="followUpDate"
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    max={followUpEnquiry?.eventDate ? new Date(followUpEnquiry.eventDate).toISOString().split('T')[0] : undefined}
                    value={followUpDate}
                    onChange={(e) => {
                      const selectedDate = e.target.value;
                      // Validate that selected date is not after event date
                      if (followUpEnquiry?.eventDate && selectedDate) {
                        const eventDateStr = new Date(followUpEnquiry.eventDate).toISOString().split('T')[0];
                        if (selectedDate > eventDateStr) {
                          toast({
                            title: "Invalid Date",
                            description: "Follow-up date cannot be after the event date.",
                            variant: "destructive",
                          });
                          return;
                        }
                      }
                      setFollowUpDate(selectedDate);
                    }}
                    data-testid="input-follow-up-date"
                  />
                  {followUpEnquiry?.eventDate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Must be on or before event date: {new Date(followUpEnquiry.eventDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="followUpTime">Follow-up Time</Label>
                  <TimePicker
                    id="followUpTime"
                    value={followUpTime}
                    onChange={setFollowUpTime}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="followUpNotes">Follow-up Notes</Label>
                <Textarea
                  id="followUpNotes"
                  placeholder="Enter notes for the follow-up..."
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                  data-testid="textarea-follow-up-notes"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="repeatFollowUp"
                  checked={repeatFollowUp}
                  onCheckedChange={(checked) => setRepeatFollowUp(checked === true)}
                  data-testid="checkbox-repeat-follow-up"
                />
                <Label htmlFor="repeatFollowUp">Repeat follow-up</Label>
              </div>

              {repeatFollowUp && (
                <>
                  <div>
                    <Label htmlFor="repeatInterval">Repeat every (days)</Label>
                    <Input
                      id="repeatInterval"
                      type="number"
                      min="1"
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(parseInt(e.target.value) || 7)}
                      data-testid="input-repeat-interval"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="repeatEndDate">End Date (optional)</Label>
                    <Input
                      id="repeatEndDate"
                      type="date"
                      min={followUpDate || new Date().toISOString().split('T')[0]}
                      max={followUpEnquiry?.eventDate ? new Date(followUpEnquiry.eventDate).toISOString().split('T')[0] : undefined}
                      value={repeatEndDate}
                      onChange={(e) => {
                        const selectedDate = e.target.value;
                        // Validate that selected date is not after event date
                        if (followUpEnquiry?.eventDate && selectedDate) {
                          const eventDateStr = new Date(followUpEnquiry.eventDate).toISOString().split('T')[0];
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
                    {followUpEnquiry?.eventDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Must be on or before event date: {new Date(followUpEnquiry.eventDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowFollowUpDialog(false)}
                  data-testid="button-cancel-follow-up"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleFollowUpSubmit}
                  data-testid="button-save-follow-up"
                >
                  Save Follow-up
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
