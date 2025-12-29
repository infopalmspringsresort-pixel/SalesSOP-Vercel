import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { loadUserPermissions, requirePermission } from "../../middleware/rbac";
import { insertBookingSchema, insertBeoSchema, insertQuotationSchema } from "@shared/schema-client";
import { z } from "zod";

export function registerBookingRoutes(app: Express) {
  // Apply RBAC middleware to all booking routes
  app.use('/api/bookings*', isAuthenticated, loadUserPermissions);
  app.use('/api/quotations*', isAuthenticated, loadUserPermissions);
  app.use('/api/beos*', isAuthenticated, loadUserPermissions);

  // Booking CRUD operations
  app.post("/api/bookings", requirePermission('bookings', 'create'), async (req: any, res) => {
    try {
      // Convert date strings to Date objects before validation
      const processedData = { ...req.body };
      if (processedData.eventDate && typeof processedData.eventDate === 'string') {
        processedData.eventDate = new Date(processedData.eventDate);
      }
      if (processedData.eventEndDate && typeof processedData.eventEndDate === 'string') {
        processedData.eventEndDate = new Date(processedData.eventEndDate);
      }
      if (processedData.contractSignedAt && typeof processedData.contractSignedAt === 'string') {
        processedData.contractSignedAt = new Date(processedData.contractSignedAt);
      }
      if (processedData.eventDates && Array.isArray(processedData.eventDates)) {
        processedData.eventDates = processedData.eventDates.map((date: any) => 
          typeof date === 'string' ? new Date(date) : date
        );
      }
      
      // Convert session dates to Date objects BEFORE validation
      if (processedData.sessions && Array.isArray(processedData.sessions)) {
        processedData.sessions = processedData.sessions.map((session: any) => ({
          ...session,
          sessionDate: typeof session.sessionDate === 'string' ? new Date(session.sessionDate) : (session.sessionDate instanceof Date ? session.sessionDate : new Date(session.sessionDate))
        }));
      }
      
      const validatedData = insertBookingSchema.parse(processedData);
      
      // Inherit salespersonId from enquiry if enquiryId is provided
      if (validatedData.enquiryId) {
        const enquiry = await storage.getEnquiryById(validatedData.enquiryId);
        if (enquiry && enquiry.salespersonId) {
          validatedData.salespersonId = enquiry.salespersonId;
        }
      }
      
      if (validatedData.sessions) {
        }
      
      // Check for venue conflicts before creating the booking
      const conflictCheck = await storage.checkVenueConflicts(validatedData);
      if (conflictCheck.hasConflict) {
        return res.status(409).json({ 
          message: "Venue conflict detected", 
          conflicts: conflictCheck.conflicts,
          details: "The selected venue and time slot conflicts with existing bookings"
        });
      }
      
      const booking = await storage.createBooking(validatedData);
      
      // Enhanced audit logging for booking creation
      if (req.audit) {
        await req.audit.logBusinessAction('booking_created', 'bookings', booking.id, {
          clientName: booking.clientName,
          eventDate: booking.eventDate,
          totalAmount: booking.totalAmount,
          advanceAmount: booking.advanceAmount,
          balanceAmount: booking.balanceAmount,
          eventType: booking.eventType,
          confirmedPax: booking.confirmedPax,
          businessContext: true
        }, req);
      }
      
      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.get("/api/bookings", requirePermission('bookings', 'read'), async (req, res) => {
    try {
      // Extract pagination parameters
      const page = req.query.page ? parseInt(req.query.page, 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : undefined;
      
      // If pagination params are provided, use them; otherwise fetch all
      const filters = {
        ...req.query,
        ...(page !== undefined && pageSize !== undefined ? { page, pageSize } : {})
      };
      
      const result = await storage.getBookings(filters);
      
      // If pagination was requested, result will be an object with data, total, page, pageSize
      // Otherwise it will be an array
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.patch("/api/bookings/:id", requirePermission('bookings', 'update'), async (req: any, res) => {
    try {
      // Convert enquiryId to ObjectId if provided
      const processedData = { ...req.body };
      if (processedData.enquiryId !== undefined) {
        if (typeof processedData.enquiryId === 'string' && processedData.enquiryId.trim() !== '') {
          // Use MongoDB ObjectId constructor directly
          const { ObjectId } = require('mongodb');
          processedData.enquiryId = new ObjectId(processedData.enquiryId);
        } else if (processedData.enquiryId === null || processedData.enquiryId === '') {
          processedData.enquiryId = null;
        }
      }
      
      // Get old booking data for comparison
      const oldBooking = await storage.getBookingById(req.params.id);
      
      // Prevent status updates if booking is already closed or cancelled
      if ((oldBooking?.status === 'closed' || oldBooking?.status === 'cancelled') && processedData.status && processedData.status !== oldBooking.status) {
        return res.status(400).json({ 
          message: `Cannot update status: Booking is already ${oldBooking.status}. ${oldBooking.status === 'closed' ? 'Closed' : 'Cancelled'} bookings cannot have their status changed.` 
        });
      }
      
      const booking = await storage.updateBooking(req.params.id, processedData);
      
      // Enhanced audit logging for booking updates
      if (req.audit) {
        await req.audit.logDataChange(oldBooking, booking, 'booking_updated', 'bookings', booking.id, req);
        
        // Log specific business actions
        if (req.body.status) {
          await req.audit.logBusinessAction('booking_status_changed', 'bookings', booking.id, {
            fromStatus: oldBooking?.status,
            toStatus: req.body.status,
            clientName: booking.clientName,
            eventDate: booking.eventDate,
            businessContext: true
          }, req);
        }
        
        // Log enquiryId changes
        if (req.body.enquiryId !== undefined && oldBooking?.enquiryId !== booking.enquiryId) {
          await req.audit.logBusinessAction('booking_enquiry_linked', 'bookings', booking.id, {
            oldEnquiryId: oldBooking?.enquiryId,
            newEnquiryId: booking.enquiryId,
            clientName: booking.clientName,
            businessContext: true
          }, req);
        }
      }
      
      res.json(booking);
    } catch (error) {
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  // Quotation operations - DISABLED (using dedicated quotation routes instead)
  // The dedicated quotation routes in server/features/quotations/routes.ts handle
  // quotation creation with activity tracking for history
  // app.post("/api/quotations", requirePermission('bookings', 'create'), async (req: any, res) => {
  //   try {
  //     const validatedData = insertQuotationSchema.parse(req.body);
  //     const quotation = await storage.createQuotation(validatedData);
  //     
  //     // Enhanced audit logging for quotation creation
  //     if (req.audit) {
  //       await req.audit.logBusinessAction('quotation_generated', 'quotations', quotation.id, {
  //         enquiryId: quotation.enquiryId,
  //         totalAmount: quotation.totalAmount,
  //         finalAmount: quotation.finalAmount,
  //         validUntil: quotation.validUntil,
  //         businessContext: true
  //       }, req);
  //     }
  //     
  //     res.status(201).json(quotation);
  //   } catch (error) {
  //     if (error instanceof z.ZodError) {
  //       return res.status(400).json({ message: "Validation error", errors: error.errors });
  //     }
  //     res.status(500).json({ message: "Failed to create quotation" });
  //   }
  // });

  // BEO operations
  app.post("/api/beos", requirePermission('bookings', 'create'), async (req: any, res) => {
    try {
      const validatedData = insertBeoSchema.parse(req.body);
      const beo = await storage.createBeo(validatedData);
      
      // Enhanced audit logging for BEO creation
      if (req.audit) {
        await req.audit.logBusinessAction('beo_created', 'beos', beo.id, {
          bookingId: beo.bookingId,
          status: beo.status,
          businessContext: true
        }, req);
      }
      
      res.status(201).json(beo);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create BEO" });
    }
  });

  app.patch("/api/beos/:id", requirePermission('bookings', 'approve'), async (req, res) => {
    try {
      const beo = await storage.updateBeo(req.params.id, req.body);
      res.json(beo);
    } catch (error) {
      res.status(500).json({ message: "Failed to update BEO" });
    }
  });
}