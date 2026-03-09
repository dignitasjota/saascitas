import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">SaaS Citas</h1>
      <p className="text-lg text-gray-600 mb-8 text-center max-w-md">
        Gestión de citas y optimización de rutas para técnicos e instaladores.
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/register"
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          Registrarse
        </Link>
      </div>
    </main>
  );
}
