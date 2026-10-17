import Link from 'next/link'
import {
  CalendarCheck,
  Users,
  BarChart3,
  Bell,
  Globe,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-blue-600">SaaS Citas</span>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Funciones</a>
            <a href="#pricing"  className="hover:text-blue-600 transition-colors">Precios</a>
            <a href="#faq"      className="hover:text-blue-600 transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-24 pb-20 px-6 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="inline-block rounded-full bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 mb-6">
            14 días gratis del plan Profesional · Sin tarjeta de crédito
          </span>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
            Gestiona tus citas.<br />
            <span className="text-blue-600">Haz crecer tu negocio.</span>
          </h1>
          <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
            La plataforma todo-en-uno para autónomos y pequeños negocios que quieren ahorrar tiempo,
            reducir cancelaciones y ofrecer reservas online 24/7 a sus clientes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors"
            >
              Comenzar gratis <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-8 py-4 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Ver demo
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-10 border-y border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-4xl px-6 flex flex-wrap justify-center gap-10 text-center">
          {[
            { value: '+500', label: 'negocios activos' },
            { value: '98%', label: 'clientes satisfechos' },
            { value: '40 h', label: 'ahorradas al mes de media' },
            { value: '24/7', label: 'reservas online' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold text-blue-600">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Todo lo que necesitas en un solo lugar</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Deja de gestionar citas por WhatsApp y llamadas. Con SaaS Citas lo tienes todo automatizado.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(f => (
              <div key={f.title} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-shadow">
                <div className={`inline-flex rounded-xl p-3 mb-4 ${f.bg}`}>
                  <f.icon className={`h-6 w-6 ${f.color}`} />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-gray-50">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-4">Planes simples y transparentes</h2>
            <p className="text-gray-500">Sin sorpresas. Cancela cuando quieras.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map(p => (
              <div
                key={p.name}
                className={`rounded-2xl p-8 flex flex-col ${
                  p.highlight
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-200 scale-105'
                    : 'bg-white border border-gray-100'
                }`}
              >
                {p.highlight && (
                  <span className="text-xs font-bold uppercase tracking-widest text-blue-200 mb-3">
                    Más popular
                  </span>
                )}
                <h3 className={`text-xl font-bold mb-1 ${p.highlight ? 'text-white' : ''}`}>{p.name}</h3>
                <p className={`text-4xl font-extrabold mt-2 mb-1 ${p.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {p.price}
                  {p.price !== 'Gratis' && (
                    <span className={`text-base font-normal ${p.highlight ? 'text-blue-200' : 'text-gray-400'}`}>/mes</span>
                  )}
                </p>
                <p className={`text-sm mb-6 ${p.highlight ? 'text-blue-100' : 'text-gray-500'}`}>{p.desc}</p>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${p.highlight ? 'text-blue-200' : 'text-green-500'}`} />
                      <span className={p.highlight ? 'text-blue-50' : 'text-gray-600'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`text-center rounded-xl py-3 text-sm font-semibold transition-colors ${
                    p.highlight
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Empezar gratis
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-10">
            ¿Más de 20 empleados?{' '}
            <a href="mailto:soporte@saascitas.com?subject=Plan a medida" className="font-medium text-blue-600 hover:underline">
              Contacta con nosotros
            </a>{' '}
            y te preparamos un plan a medida.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12">Preguntas frecuentes</h2>
          <div className="space-y-6">
            {faqs.map(faq => (
              <details key={faq.q} className="group rounded-xl border border-gray-100 p-6">
                <summary className="cursor-pointer font-semibold text-gray-900 list-none flex justify-between items-center">
                  {faq.q}
                  <span className="ml-4 text-gray-400 group-open:rotate-45 transition-transform inline-block">+</span>
                </summary>
                <p className="mt-4 text-sm text-gray-500 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-blue-600 text-white text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-4xl font-extrabold mb-4">¿Listo para empezar?</h2>
          <p className="text-blue-100 mb-10 text-lg">
            Únete a cientos de profesionales que ya ahorran horas cada semana con SaaS Citas.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base font-bold text-blue-600 hover:bg-blue-50 transition-colors shadow-xl shadow-blue-800/30"
          >
            Crear cuenta gratis <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10 px-6">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <span className="font-bold text-blue-600">SaaS Citas</span>
          <span>© {new Date().getFullYear()} SaaS Citas · Todos los derechos reservados</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-gray-900 transition-colors">Privacidad</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Términos</a>
            <a href="mailto:soporte@saascitas.com" className="hover:text-gray-900 transition-colors">Soporte</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

const features = [
  {
    icon: CalendarCheck,
    title: 'Agenda inteligente',
    desc: 'Visualiza y gestiona todas las citas del día, semana o mes en un calendario intuitivo con vista por empleado.',
    bg: 'bg-blue-50',
    color: 'text-blue-600',
  },
  {
    icon: Globe,
    title: 'Reservas online 24/7',
    desc: 'Tus clientes reservan directamente desde tu página personalizada, sin llamadas ni WhatsApps.',
    bg: 'bg-green-50',
    color: 'text-green-600',
  },
  {
    icon: Bell,
    title: 'Recordatorios automáticos',
    desc: 'Envía confirmaciones y recordatorios por email para reducir las cancelaciones de última hora.',
    bg: 'bg-amber-50',
    color: 'text-amber-600',
  },
  {
    icon: Users,
    title: 'Gestión de clientes',
    desc: 'Mantén un historial completo de cada cliente: citas, pagos, notas y preferencias en un solo lugar.',
    bg: 'bg-purple-50',
    color: 'text-purple-600',
  },
  {
    icon: BarChart3,
    title: 'Métricas e informes',
    desc: 'Analiza el rendimiento de tu negocio con estadísticas en tiempo real: ingresos, ocupación y mucho más.',
    bg: 'bg-red-50',
    color: 'text-red-600',
  },
  {
    icon: ShieldCheck,
    title: 'Seguro y fiable',
    desc: 'Datos cifrados, copias de seguridad automáticas y disponibilidad 99.9% para que nunca pierdas información.',
    bg: 'bg-teal-50',
    color: 'text-teal-600',
  },
]

const plans = [
  {
    name: 'Básico',
    price: 'Gratis',
    desc: 'Para autónomos que empiezan',
    highlight: false,
    features: [
      'Hasta 100 citas/mes',
      '1 empleado',
      'Reservas online',
      'Recordatorios por email',
      'Exportación CSV',
    ],
  },
  {
    name: 'Profesional',
    price: '29€',
    desc: 'Para equipos en crecimiento',
    highlight: true,
    features: [
      'Citas ilimitadas',
      'Hasta 5 empleados',
      'Recordatorios por email',
      'Métricas avanzadas',
      'Exportación CSV',
      'Soporte prioritario',
    ],
  },
  {
    name: 'Business',
    price: '79€',
    desc: 'Para negocios grandes',
    highlight: false,
    features: [
      'Citas ilimitadas',
      'Hasta 20 empleados',
      'API acceso',
      'Integraciones (Zapier, etc.)',
      'Manager de cuenta dedicado',
      'SLA garantizado',
    ],
  },
]

const faqs = [
  {
    q: '¿Necesito tarjeta de crédito para el periodo de prueba?',
    a: 'No. Durante 14 días tienes el plan Profesional gratis y sin introducir ningún dato de pago. Si al terminar no contratas, pasas automáticamente al plan Básico gratuito sin perder nada; solo te pediremos la tarjeta si decides seguir con el Profesional.',
  },
  {
    q: '¿Puedo cancelar en cualquier momento?',
    a: 'Sí. No hay permanencia. Puedes cancelar tu suscripción desde el panel de control en cualquier momento y no se te cobrará el siguiente período.',
  },
  {
    q: '¿Mis clientes necesitan registrarse para reservar?',
    a: 'No. Tus clientes solo necesitan tu enlace de reservas personalizado. Pueden reservar una cita en menos de 2 minutos sin crear ninguna cuenta.',
  },
  {
    q: '¿Qué pasa con mis datos si cancelo?',
    a: 'Puedes exportar todos tus datos en formato CSV antes de cancelar. Conservamos tus datos durante 30 días después de la cancelación por si cambias de opinión.',
  },
  {
    q: '¿Ofrecéis soporte en español?',
    a: 'Sí. Nuestro equipo de soporte está disponible en español de lunes a viernes de 9h a 18h. Los planes Profesional y Business incluyen soporte prioritario.',
  },
]
