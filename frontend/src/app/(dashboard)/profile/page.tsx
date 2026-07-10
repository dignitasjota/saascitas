'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, User, Lock, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, 'Requerido').max(100),
  lastName: z.string().min(1, 'Requerido').max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
})

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Requerido'),
    newPassword: z.string().min(8, 'Mínimo 8 caracteres').max(100),
    confirmPassword: z.string().min(1, 'Requerido'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

// ─── Role label ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  technician: 'Técnico',
}

// ─── Profile section ──────────────────────────────────────────────────────────

interface ProfileData {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: string
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

function ProfileSection({ profile }: { profile: ProfileData }) {
  const { user, setAuth, tenant } = useAuthStore()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (data: ProfileForm) =>
      apiClient.patch('/users/me', { ...data, phone: data.phone || undefined }),
    onSuccess: (res) => {
      const updated = res.data.data
      // Update auth store so sidebar name reflects changes
      if (user && tenant) {
        setAuth(
          { ...user, firstName: updated.firstName, lastName: updated.lastName },
          tenant,
        )
      }
      queryClient.setQueryData(['profile'], updated)
      toast.success('Perfil actualizado')
      reset({ firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone ?? '' })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? 'Error al actualizar')
    },
  })

  return (
    <Card className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-xl">
            {getInitials(profile.firstName, profile.lastName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-lg font-semibold">{profile.firstName} {profile.lastName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            {profile.emailVerifiedAt && (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ROLE_LABELS[profile.role] ?? profile.role}
            {profile.lastLoginAt && (
              <> · Último acceso {format(new Date(profile.lastLoginAt), "d MMM yyyy 'a las' HH:mm", { locale: es })}</>
            )}
          </p>
        </div>
      </div>

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
          <Label>Teléfono <span className="text-muted-foreground text-xs">(opcional)</span></Label>
          <Input {...register('phone')} type="tel" placeholder="+34 600 000 000" />
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Email: {profile.email} — no se puede cambiar desde aquí
        </div>

        <Button type="submit" disabled={mutation.isPending || !isDirty}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Guardar cambios
        </Button>
      </form>
    </Card>
  )
}

// ─── Password section ─────────────────────────────────────────────────────────

function PasswordSection() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const mutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      apiClient.post('/users/me/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    onSuccess: () => {
      toast.success('Contraseña actualizada correctamente')
      reset()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? 'Error al cambiar contraseña')
    },
  })

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-muted p-2.5">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Cambiar contraseña</h2>
          <p className="text-sm text-muted-foreground">Usa al menos 8 caracteres</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 max-w-sm">
        <div className="space-y-1">
          <Label>Contraseña actual</Label>
          <Input {...register('currentPassword')} type="password" autoComplete="current-password" />
          {errors.currentPassword && (
            <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Nueva contraseña</Label>
          <Input {...register('newPassword')} type="password" autoComplete="new-password" />
          {errors.newPassword && (
            <p className="text-xs text-destructive">{errors.newPassword.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Confirmar nueva contraseña</Label>
          <Input {...register('confirmPassword')} type="password" autoComplete="new-password" />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await apiClient.get('/users/me')
      return res.data.data
    },
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="text-muted-foreground mt-1">Gestiona tus datos personales y seguridad</p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-52" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        </div>
      ) : profile ? (
        <>
          <ProfileSection profile={profile} />
          <PasswordSection />
        </>
      ) : null}
    </div>
  )
}
