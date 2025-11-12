import Link from 'next/link';
import SleekLineCursor from './components/SleekLineCursor';

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center md:p-8 relative">
      {/* Login Button */}
      <Link 
        href="/signin"
        className="absolute top-8 right-8 px-6 py-2 border border-white bg-black text-white font-serif text-sm hover:bg-white hover:text-black transition-colors duration-200 z-10"
      >
        Login
      </Link>

      <div className="max-w-2xl w-full bg-black md:bg-black/50 md:backdrop-blur-sm md:rounded-lg p-8 md:p-16 md:shadow-2xl min-h-screen md:min-h-0">
        {/* Hero Section */}
        <section className="mb-12 md:mb-16 text-left">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-light mb-4 md:mb-6 font-serif">
            ipg<span style={{ color: '#11766E' }}>.</span>inc
          </h1>
          <p className="text-gray-400 italic text-sm md:text-base font-serif">
            Talk to your users 24/7.
          </p>
        </section>

        {/* What We Do Section */}
        <section className="mb-10 md:mb-12">
          <h2 className="text-xs font-medium mb-3 md:mb-4 tracking-[0.2em] text-gray-300 font-sans">
            WHAT WE DO
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-gray-300 font-serif">
            We're building the future of market research with AI-moderated interview agents that capture authentic human insights in minutes. Our platform conducts dynamic interviews, identifies key audience patterns, and creates generative-agent representations of your customers—so you can engage with them continuously and make faster, more informed decisions.
          </p>
        </section>

        {/* Who We Are Section */}
        <section className="mb-10 md:mb-12">
          <h2 className="text-xs font-medium mb-3 md:mb-4 tracking-[0.2em] text-gray-300 font-sans">
            WHO WE ARE
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-gray-300 font-serif">
            We're two UCLA students on a mission to predict everything.
          </p>
        </section>

        {/* Early Access / Careers Section */}
        <section className="mb-16">
          <h2 className="text-xs font-medium mb-3 md:mb-4 tracking-[0.2em] text-gray-300 font-sans">
            EARLY ACCESS / CAREERS
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-gray-300 font-serif">
            Join the future of decision-making. Please reach out: {' '}
            <a 
              href="mailto:contact@ipg.inc" 
              className="text-blue-400 hover:text-blue-300 underline"
            >
              contact@ipg.inc
            </a>
          </p>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-gray-800 mt-auto">
          <div className="flex justify-between items-center">
            <p className="text-xs md:text-sm text-gray-500">
              © 2025 ipg.inc
            </p>
            <div className="flex gap-1.5">
              <span className="w-1.5 h-1.5 bg-gray-600 rounded-full"></span>
              <span className="w-1.5 h-1.5 bg-gray-600 rounded-full"></span>
              <span className="w-1.5 h-1.5 bg-gray-600 rounded-full"></span>
            </div>
          </div>
        </footer>
      </div>

      {/* Sleek Line Cursor - Desktop only */}
      <div className="hidden md:block">
        <SleekLineCursor />
      </div>
    </div>
  );
}