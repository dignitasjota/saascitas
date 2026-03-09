export interface ApiResponse<T> {
  data: T
}

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor: string | null
  hasMore: boolean
}

export interface ApiError {
  type: string
  title: string
  status: number
  detail: string
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'owner' | 'admin' | 'technician'
}

export interface Tenant {
  id: string
  name: string
  slug: string
  email: string
  phone?: string
  plan: 'basic' | 'professional' | 'premium'
  planStatus: 'trialing' | 'active' | 'past_due' | 'cancelled'
  trialEndsAt?: string
}

export interface Employee {
  id: string
  tenantId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  color: string
  specialties: string[]
  isActive: boolean
  createdAt: string
}

export interface Service {
  id: string
  tenantId: string
  name: string
  description?: string
  durationMinutes: number
  priceCents?: number
  color?: string
  isPublic: boolean
  isActive: boolean
  sortOrder: number
}

export interface Customer {
  id: string
  tenantId: string
  firstName: string
  lastName?: string
  email?: string
  phone: string
  address?: string
  city?: string
  postalCode?: string
  notes?: string
  tags: string[]
  totalAppointments: number
  totalSpentCents: number
  lastAppointmentAt?: string
  createdAt: string
}

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface Appointment {
  id: string
  tenantId: string
  employeeId: string
  customerId: string
  serviceId?: string
  startsAt: string
  endsAt: string
  durationMinutes: number
  status: AppointmentStatus
  address?: string
  city?: string
  postalCode?: string
  notes?: string
  customerNotes?: string
  priceCents?: number
  source: string
  employee?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'color'>
  customer?: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone'>
  service?: Pick<Service, 'id' | 'name' | 'color'>
  createdAt: string
}

export interface TimeSlot {
  start: string
  end: string
  available: boolean
}

export interface WorkingHour {
  id: string
  employeeId: string
  dayOfWeek: string
  startTime: string
  endTime: string
  isActive: boolean
}
