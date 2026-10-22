import Navbar from './Navbar'

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f5f7f5]">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="bg-white border-t border-gray-100 py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} MENRO Gloria · Municipal Environment and Natural Resources Office
          </p>
          <p className="text-xs text-gray-400">Gloria, Oriental Mindoro, Philippines</p>
        </div>
      </footer>
    </div>
  )
}
