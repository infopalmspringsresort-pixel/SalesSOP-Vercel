import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Filter, Eye, FileText, Edit, CreditCard, Phone, Calendar, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import type { BookingWithRelations } from "@/types";
import { formatDate } from "@/utils/dateFormat";
import { getStatusColor, getStatusLabel, bookingStatusOptions } from "@/lib/status-utils";
import BookingDetailsDialog from "./components/booking-details-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export default function Bookings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [showBookingDetails, setShowBookingDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25); // Default page size

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

  // Function to check if user can access booking modal
  const canAccessBookingModal = (booking: any) => {
    if (!user) return false;
    
    const userRole = user.role?.name || user.role;
    const userId = user.id || user._id;
    const isOwner = booking.salespersonId === userId || booking.salesperson?.id === userId;
    
    // Staff: Cannot open any booking modal
    if (userRole === 'staff') return false;
    
    // Admin: Can open any booking modal
    if (userRole === 'admin') return true;
    
    // Manager/Salesperson: Can open only their own bookings
    if (userRole === 'manager' || userRole === 'salesperson') {
      return isOwner;
    }
    
    return false;
  };

  // Function to handle booking row click
  const handleBookingClick = (booking: any) => {
    // Allow all authenticated users to view booking details
    // Actions will be restricted in the details dialog
    setSelectedBooking(booking);
    setShowBookingDetails(true);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, eventTypeFilter]);

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
  const apiUrl = `/api/bookings${queryString ? `?${queryString}` : ''}`;

  const { data: bookingsResponse, isLoading: bookingsLoading } = useQuery<any[] | { data: any[]; total: number; page: number; pageSize: number }>({
    queryKey: [apiUrl],
    enabled: isAuthenticated,
  });

  // Handle both paginated and non-paginated responses
  const bookingsData = Array.isArray(bookingsResponse) ? bookingsResponse : (bookingsResponse?.data || []);
  const totalCount = Array.isArray(bookingsResponse) ? undefined : bookingsResponse?.total;
  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1;

  // Apply client-side filtering for complex filters (date, event type)
  const bookings = bookingsData.filter(booking => {
    // Event type filter
    if (eventTypeFilter !== "all" && booking.eventType !== eventTypeFilter) {
      return false;
    }
    
    // Date filter
    if (dateFilter !== "all" && booking.eventDate) {
      const eventDate = new Date(booking.eventDate);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      switch (dateFilter) {
        case "today":
          if (eventDate.toDateString() !== today.toDateString()) return false;
          break;
        case "tomorrow":
          if (eventDate.toDateString() !== tomorrow.toDateString()) return false;
          break;
        case "this_week":
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          if (eventDate < weekStart || eventDate > weekEnd) return false;
          break;
        case "next_week":
          const nextWeekStart = new Date(today);
          nextWeekStart.setDate(today.getDate() + (7 - today.getDay()));
          const nextWeekEnd = new Date(nextWeekStart);
          nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
          if (eventDate < nextWeekStart || eventDate > nextWeekEnd) return false;
          break;
        case "this_month":
          if (eventDate.getMonth() !== today.getMonth() || eventDate.getFullYear() !== today.getFullYear()) return false;
          break;
        case "next_month":
          const nextMonth = new Date(today);
          nextMonth.setMonth(today.getMonth() + 1);
          if (eventDate.getMonth() !== nextMonth.getMonth() || eventDate.getFullYear() !== nextMonth.getFullYear()) return false;
          break;
      }
    }
    
    return true;
  }).sort((a, b) => {
    const dateA = new Date(a.createdAt || a.eventDate || 0).getTime();
    const dateB = new Date(b.createdAt || b.eventDate || 0).getTime();
    return dateB - dateA;
  });

  // Handle URL search parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    const highlightParam = urlParams.get('highlight');
    
    if (searchParam) {
      setSearchQuery(searchParam);
    }
    
    if (highlightParam && (bookings || []).length > 0) {
      const bookingToHighlight = (bookings || []).find(b => b.id === highlightParam);
      if (bookingToHighlight) {
        handleBookingClick(bookingToHighlight);
      }
    }
  }, [bookings]);

  // Search and status filtering are handled server-side via API query params
  // Event type and date filtering are already applied to `bookings` variable above
  // So use bookings directly to avoid duplicate filtering
  const filteredBookings = bookings;

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-64 bg-card border-r animate-pulse"></div>
        <div className="flex-1 p-6 animate-pulse">
          <div className="h-8 bg-muted rounded w-48 mb-6"></div>
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto h-screen touch-pan-y" style={{ paddingTop: '0' }}>
        <header className="bg-card border-b border-border px-4 lg:px-6 py-3 lg:py-4 shadow-sm">
          <div className="flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">Bookings</h1>
              <p className="text-sm text-muted-foreground hidden lg:block">View and manage all confirmed bookings</p>
            </div>
          </div>
        </header>

        <div className="p-6 pb-20 lg:pb-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="pb-3 lg:pb-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <CardTitle className="text-lg lg:text-xl">All Bookings</CardTitle>
                <div className="flex flex-row items-center gap-2 sm:gap-3">
                  {/* Search - Side by side with filter */}
                  <div className="relative flex-1 min-w-0">
                    <Input
                      type="search"
                      placeholder="Search by booking number, client name..."
                      className="w-full"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-search-bookings"
                    />
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                  
                  {/* Filters */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Popover open={showFilters} onOpenChange={setShowFilters}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="relative whitespace-nowrap">
                          <Filter className="w-4 h-4 mr-2" />
                          <span className="hidden sm:inline">Filters</span>
                          {(statusFilter !== "all" || eventTypeFilter !== "all" || dateFilter !== "all") && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0 max-h-96 overflow-hidden" align="end">
                        <div className="p-4 border-b">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Filter Bookings</h3>
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
                                {bookingStatusOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
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
                              setEventTypeFilter("all");
                              setDateFilter("all");
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
              {bookingsLoading ? (
                <div className="space-y-4">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
                  ))}
                </div>
              ) : filteredBookings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No bookings found</p>
                  <p className="text-sm text-muted-foreground">
                    Bookings will appear here when enquiries are marked as 'booked'
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto rounded-xl border border-border shadow-sm">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-border">
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Booking #</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Client Details</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Event Details</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Salesperson</th>
                          <th className="text-left px-6 py-4 text-sm font-bold text-foreground tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBookings.map((booking) => {
                          
                          return (
                            <tr key={booking.id} className="border-b border-border hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent cursor-pointer transition-all duration-200 group"
                                onClick={() => handleBookingClick(booking)}>
                              <td className="px-6 py-4 align-top">
                                <div className="text-xs text-muted-foreground font-mono bg-gray-100 px-2 py-1 rounded-md font-semibold" data-testid={`booking-number-${booking.id}`}>
                                  {booking.bookingNumber}
                                </div>
                                {booking.enquiryNumber && (
                                  <div className="text-xs text-muted-foreground mt-1 font-medium">
                                    From {booking.enquiryNumber}
                                  </div>
                                )}
                                {booking.enquiryId && !booking.enquiryNumber && (
                                  <div className="text-xs text-muted-foreground mt-1 font-medium italic text-amber-600">
                                    Enquiry not found
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 align-top">
                                <div className="text-sm font-bold text-foreground leading-tight mb-1 group-hover:text-primary transition-colors" data-testid={`booking-client-${booking.id}`}>{booking.clientName}</div>
                                <div className="text-xs text-muted-foreground font-medium">{booking.contactNumber}</div>
                                {booking.email && (
                                  <div className="text-xs text-muted-foreground">{booking.email}</div>
                                )}
                              </td>
                              <td className="px-6 py-4 align-top">
                                <div className="text-sm font-semibold text-foreground mb-1">
                                  {formatDate(booking.eventDate)}
                                  {booking.eventDuration > 1 && booking.eventEndDate && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      to {formatDate(booking.eventEndDate)}
                                    </span>
                                  )}
                                </div>
                                {booking.eventDuration > 1 && (
                                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    {booking.eventDuration} Day Event
                                  </div>
                                )}
                                {(booking.eventStartTime || booking.eventEndTime) && (
                                  <div className="text-xs text-muted-foreground font-medium">
                                    {booking.eventStartTime} - {booking.eventEndTime || 'TBD'}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground font-medium">
                                  {booking.confirmedPax} pax • {booking.eventType?.replace('_', ' ') || 'Event'}
                                </div>
                              </td>
                              <td className="px-6 py-4 align-top">
                                <div className="text-sm text-foreground">
                                  {booking.salesperson?.firstName && booking.salesperson?.lastName ? 
                    `${booking.salesperson.firstName} ${booking.salesperson.lastName}` : 
                    'TBD'
                  }
                                </div>
                                {(() => {
                                  const userRole = user?.role?.name || user?.role;
                                  if (userRole === 'staff') {
                                    return (
                                      <div className="text-xs text-muted-foreground">
                                        View only
                                      </div>
                                    );
                                  }
                                  if (canAccessBookingModal(booking)) {
                                    return null; // Don't show extra text if user can access
                                  }
                                  if (userRole === 'manager' || userRole === 'salesperson') {
                                    return (
                                      <div className="text-xs text-muted-foreground">
                                        View only
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </td>
                              <td className="px-6 py-4 align-top">
                                <Badge className={getStatusColor(booking.status || 'booked')}>
                                  {getStatusLabel(booking.status || 'booked')}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination - Desktop */}
                  {totalCount !== undefined && totalCount > 0 && (
                    <div className="hidden lg:flex flex-col items-center justify-center gap-4 px-6 py-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} bookings
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
                  <div className="lg:hidden space-y-2 sm:space-y-3 pb-20">
                    {filteredBookings.map((booking) => {

                      return (
                        <Card 
                          key={booking.id} 
                          className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-green-400 shadow-md border-0 touch-manipulation group"
                          onClick={() => handleBookingClick(booking)}
                          data-testid={`booking-card-${booking.id}`}
                        >
                          <CardContent className="p-3 sm:p-4 touch-manipulation">
                            <div className="flex justify-between items-start mb-2 gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <div className="font-mono text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded font-semibold" data-testid={`booking-number-${booking.id}`}>
                                    {booking.bookingNumber}
                                  </div>
                                  <Badge className={`${getStatusColor(booking.status || 'booked')} shadow-sm font-medium text-xs`}>
                                    {getStatusLabel(booking.status || 'booked')}
                                  </Badge>
                                </div>
                                <div className="font-bold text-base sm:text-lg text-foreground mb-1.5" data-testid={`booking-client-${booking.id}`}>
                                  {booking.clientName}
                                </div>
                                {booking.enquiryNumber && (
                                  <div className="text-xs text-muted-foreground mb-1 font-medium">
                                    From {booking.enquiryNumber}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                <Phone className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                <span className="font-medium truncate">{booking.contactNumber}</span>
                                {booking.email && (
                                  <>
                                    <span className="text-muted-foreground/50">•</span>
                                    <span className="truncate">{booking.email}</span>
                                  </>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                                <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                <span className="font-medium">{formatDate(booking.eventDate)}</span>
                                {booking.eventDuration > 1 && booking.eventEndDate && (
                                  <>
                                    <span className="text-muted-foreground/50">•</span>
                                    <span>to {formatDate(booking.eventEndDate)}</span>
                                  </>
                                )}
                                <span className="text-muted-foreground/50">•</span>
                                <span>{booking.confirmedPax} PAX</span>
                                <span className="text-muted-foreground/50">•</span>
                                <span className="capitalize">{booking.eventType?.replace('_', ' ') || 'Event'}</span>
                              </div>
                              
                              {booking.eventDuration > 1 && (
                                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                  {booking.eventDuration} Day Event
                                </div>
                              )}
                              
                              {(booking.eventStartTime || booking.eventEndTime) && (
                                <div className="text-xs sm:text-sm text-muted-foreground font-medium">
                                  {booking.eventStartTime} - {booking.eventEndTime || 'TBD'}
                                </div>
                              )}

                              {booking.salesperson && (booking.salesperson.firstName || booking.salesperson.lastName) && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Salesperson: {booking.salesperson.firstName} {booking.salesperson.lastName}</span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Pagination for Mobile */}
                  {totalCount !== undefined && totalCount > 0 && (
                    <div className="lg:hidden flex flex-col items-center justify-center gap-4 px-4 py-4 border-t mt-4">
                      <div className="text-sm text-muted-foreground text-center">
                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} bookings
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

        <BookingDetailsDialog 
          booking={selectedBooking} 
          open={showBookingDetails} 
          onOpenChange={setShowBookingDetails} 
        />
      </main>
    </div>
  );
}
