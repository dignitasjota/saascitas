'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  UserPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Shield,
  User,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { getInitials } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'owner' | 'admin' | 'technician'

interface TenantUser {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: UserRole
  employeeId: string | null
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  employee: { id: string; firstName: string; lastName: string } | null
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  firstName: z.string().min(1, 'Requerido').max(100),
  lastName: z.string().min(1, 'Requerido').max(100),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
  role: z.enum(['admin', 'technician']),
})

const editSchema = z.object({
  firstName: z.string().min(1, 'Requerido').max(100),
  lastName: z.string().min(1, 'Requerido').max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
  role: z.enum(['owner', 'admin', 'technician']),
})

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, { label: string; className: string }> = {
  owner: { label: 'Propietario', className: 'bg-purple-100 text-purple-700' },
  admin: { label: 'Administrador', className: 'bg-blue-100 text-blue-700' },
  technician: { label: 'Técnico', className: 'bg-gray-100 text-gray-600' },
}

function RoleBadge({ role }: { role: UserRole }) {
  const { label, className } = ROLE_LABELS[role] ?? ROLE_LABELS.technician
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

// ─── Create user dialog ───────────────────────────────────────────────────────

function CreateUserDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'technician' },
  })

  const mutation = useMutation({
    mutationFn: (data: CreateForm) =>
      apiClient.post('/users', { ...data, phone: data.phone || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Usuario creado correctamente')
      reset()
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail ?? 'Error al crear usuario'
      toast.error(msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input {...register('firstName')} placeholder="Ana" />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Apellidos</Label>
              <Input {...register('lastName')} placeholder="García" />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Email</Label>
            <Input {...register('email')} type="email" placeholder="ana@empresa.com" />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Contraseña</Label>
            <Input {...register('password')} type="password" placeholder="Mínimo 8 caracteres" />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Teléfono <span className="text-muted-foreground">(opcional)</span></Label>
            <Input {...register('phone')} type="tel" placeholder="+34 600 000 000" />
          </div>

          <div className="space-y-1">
            <Label>Rol</Label>
            <Select
              value={watch('role')}
              onValueChange={(v) => setValue('role', v as CreateForm['role'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="technician">Técnico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit user dialog ─────────────────────────────────────────────────────────

function EditUserDialog({
  user,
  currentUserId,
  onClose,
}: {
  user: TenantUser
  currentUserId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isSelf = user.id === currentUserId

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? '',
      role: user.role,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: EditForm) =>
      apiClient.patch(`/users/${user.id}`, { ...data, phone: data.phone || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Usuario actualizado')
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail ?? 'Error al actualizar'
      toast.error(msg)
    },
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Apellidos</Label>
              <Input {...register('lastName')} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Teléfono</Label>
            <Input {...register('phone')} type="tel" />
          </div>

          <div className="space-y-1">
            <Label>Rol</Label>
            <Select
              value={watch('role')}
              onValueChange={(v) => setValue('role', v as EditForm['role'])}
              disabled={user.role === 'owner' || isSelf}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {user.role === 'owner' && <SelectItem value="owner">Propietario</SelectItem>}
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="technician">Técnico</SelectItem>
              </SelectContent>
            </Select>
            {(user.role === 'owner' || isSelf) && (
              <p className="text-xs text-muted-foreground">El rol no puede cambiarse aquí</p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Email: {user.email}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  currentUserId,
  currentRole,
  onEdit,
  onDelete,
}: {
  user: TenantUser
  currentUserId: string
  currentRole: string
  onEdit: (u: TenantUser) => void
  onDelete: (u: TenantUser) => void
}) {
  const isSelf = user.id === currentUserId
  const canEdit = currentRole === 'owner' || isSelf
  const canDelete = currentRole === 'owner' && !isSelf && user.role !== 'owner'

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors rounded-lg">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">
          {getInitials(user.firstName, user.lastName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">
            {user.firstName} {user.lastName}
            {isSelf && <span className="ml-1 text-xs text-muted-foreground">(tú)</span>}
          </p>
          <RoleBadge role={user.role} />
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          {user.emailVerifiedAt && (
            <span title="Email verificado" className="inline-flex shrink-0">
              <CheckCircle2 className="h-3 w-3 text-green-500" aria-label="Email verificado" />
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:block text-right shrink-0">
        <p className="text-xs text-muted-foreground">
          {user.lastLoginAt
            ? `Último acceso ${format(new Date(user.lastLoginAt), 'd MMM', { locale: es })}`
            : 'Sin acceso'}
        </p>
        {user.employee && (
          <p className="text-xs text-muted-foreground">
            {user.employee.firstName} {user.employee.lastName}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {canEdit && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(user)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(user)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({
  user,
  onConfirm,
  onClose,
  loading,
}: {
  user: TenantUser
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar usuario</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          ¿Seguro que quieres eliminar a{' '}
          <strong>{user.firstName} {user.lastName}</strong>?
          Esta acción no se puede deshacer.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null)
  const [deletingUser, setDeletingUser] = useState<TenantUser | null>(null)

  const { data: users = [], isLoading } = useQuery<TenantUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await apiClient.get('/users')
      return res.data.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Usuario eliminado')
      setDeletingUser(null)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail ?? 'Error al eliminar'
      toast.error(msg)
    },
  })

  const canCreate = currentUser?.role === 'owner'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los accesos al panel de administración
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Nuevo usuario
          </Button>
        )}
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-purple-600" />
          <span className="text-muted-foreground">Propietario — acceso total, no se puede eliminar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <User className="h-4 w-4 text-blue-600" />
          <span className="text-muted-foreground">Admin — gestión completa excepto usuarios</span>
        </div>
      </div>

      {/* Users list */}
      <Card className="divide-y">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No hay usuarios
          </div>
        ) : (
          <div className="p-2">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                currentUserId={currentUser?.id ?? ''}
                currentRole={currentUser?.role ?? ''}
                onEdit={setEditingUser}
                onDelete={setDeletingUser}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Dialogs */}
      {showCreate && (
        <CreateUserDialog open onClose={() => setShowCreate(false)} />
      )}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          currentUserId={currentUser?.id ?? ''}
          onClose={() => setEditingUser(null)}
        />
      )}
      {deletingUser && (
        <DeleteConfirmDialog
          user={deletingUser}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingUser.id)}
          onClose={() => setDeletingUser(null)}
        />
      )}
    </div>
  )
}
