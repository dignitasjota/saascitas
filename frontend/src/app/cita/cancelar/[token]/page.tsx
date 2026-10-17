import type { Metadata } from 'next'
import { BookingTokenAction } from '@/components/booking/booking-token-action'

export const metadata: Metadata = {
  title: 'Cancelar cita',
  robots: { index: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <BookingTokenAction action="cancel" token={token} />
}
