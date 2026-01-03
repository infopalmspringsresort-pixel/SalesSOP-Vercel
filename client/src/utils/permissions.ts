/**
 * Utility functions for checking user permissions
 */

export interface User {
  id?: string;
  _id?: string;
  role?: {
    name?: string;
  } | string;
}

export interface Resource {
  salespersonId?: string;
  createdBy?: string;
  salesperson?: {
    id?: string;
  };
}

/**
 * Check if a user can edit a resource (enquiry or booking)
 * - Admins can edit all resources
 * - Salespeople/Managers can only edit their own resources
 * - Staff cannot edit any resources
 */
export function canEditResource(user: User | undefined | null, resource: Resource | null | undefined): boolean {
  if (!user || !resource) return false;
  
  const userRole = typeof user.role === 'object' ? user.role?.name : user.role;
  const userId = user.id || user._id;
  
  // Staff cannot edit anything
  if (userRole === 'staff') return false;
  
  // Admin can edit everything
  if (userRole === 'admin') return true;
  
  // Salespeople and managers can only edit their own resources
  if (userRole === 'salesperson' || userRole === 'manager') {
    const resourceOwnerId = resource.salespersonId || resource.createdBy || resource.salesperson?.id;
    return String(resourceOwnerId) === String(userId);
  }
  
  return false;
}

/**
 * Check if a user can view a resource (enquiry or booking)
 * - All authenticated users can view all resources
 * - This is used to allow viewing but restrict editing
 */
export function canViewResource(user: User | undefined | null): boolean {
  return !!user;
}

