import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BookingFlow } from './booking-flow'

interface Props {
  params: Promise<{ slug: string }>
}

async function getBusinessInfo(slug: string) {
  try {
    const res = await fetch(`${process.env.BACKEND_URL ?? 'http://localhost:3001'}/v1/booking/${slug}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const business = await getBusinessInfo(slug)
  if (!business) return { title: 'Negocio no encontrado' }

  return {
    title: `Reservar cita — ${business.name}`,
    description: `Reserva tu cita online con ${business.name}. Rápido, sencillo y sin esperas.`,
  }
}

export default async function BookingPage({ params }: Props) {
  const { slug } = await params
  const business = await getBusinessInfo(slug)
  if (!business) notFound()

  return <BookingFlow business={business} />
}
