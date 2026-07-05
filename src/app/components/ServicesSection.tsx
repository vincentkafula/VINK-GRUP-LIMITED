import { Wallet, TrendingUp, Shield, Building2, Banknote, Award } from 'lucide-react';

export function ServicesSection() {
  return (
    <div className="bg-gradient-to-b from-gray-50 to-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl mb-4">Our Services</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Comprehensive financial solutions designed to help you achieve your goals
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ServiceCard
            icon={<Wallet className="w-10 h-10" />}
            title="Personal Account"
            description="Simple, secure banking for everyday needs"
            link="#"
          />
          <ServiceCard
            icon={<TrendingUp className="w-10 h-10" />}
            title="Investment"
            description="Grow your wealth with smart investment options"
            link="#"
          />
          <ServiceCard
            icon={<Shield className="w-10 h-10" />}
            title="Insurance"
            description="Protect what matters most with our insurance plans"
            link="#"
          />
          <ServiceCard
            icon={<Building2 className="w-10 h-10" />}
            title="Business Solutions"
            description="Tailored banking for your business growth"
            link="#"
          />
          <ServiceCard
            icon={<Banknote className="w-10 h-10" />}
            title="Loans"
            description="Flexible loan options for all your needs"
            link="#"
          />
          <ServiceCard
            icon={<Award className="w-10 h-10" />}
            title="Rewards Program"
            description="Earn rewards on every transaction you make"
            link="#"
          />
        </div>
      </div>
    </div>
  );
}

interface ServiceCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  link: string;
}

function ServiceCard({ icon, title, description, link }: ServiceCardProps) {
  return (
    <a
      href={link}
      className="group bg-white border border-border rounded-xl p-6 hover:shadow-lg hover:border-[#6B5ED7] transition-all duration-300"
    >
      <div className="text-[#6B5ED7] mb-4 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="mb-2 group-hover:text-[#6B5ED7] transition-colors">{title}</h3>
      <p className="text-muted-foreground text-sm mb-4">{description}</p>
      <span className="text-[#6B5ED7] text-sm font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all">
        Learn more
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </a>
  );
}
