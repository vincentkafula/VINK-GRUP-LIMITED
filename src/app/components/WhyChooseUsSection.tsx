import { Users, Trophy, Clock, DollarSign } from 'lucide-react';

export function WhyChooseUsSection() {
  return (
    <div className="bg-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl mb-4">Why Choose Vink?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join millions of satisfied customers who trust us with their financial future
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <StatCard
            icon={<Users className="w-12 h-12" />}
            number="10M+"
            label="Active Users"
          />
          <StatCard
            icon={<Trophy className="w-12 h-12" />}
            number="50+"
            label="Industry Awards"
          />
          <StatCard
            icon={<Clock className="w-12 h-12" />}
            number="24/7"
            label="Customer Support"
          />
          <StatCard
            icon={<DollarSign className="w-12 h-12" />}
            number="$0"
            label="Hidden Fees"
          />
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <BenefitCard
            title="Trusted & Secure"
            description="Bank-level security with 256-bit encryption and fraud protection to keep your money safe."
          />
          <BenefitCard
            title="Fast Approval"
            description="Get approved in minutes with our streamlined application process. No waiting, no hassle."
          />
          <BenefitCard
            title="Transparent Pricing"
            description="No hidden fees, no surprises. We believe in complete transparency with our pricing."
          />
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  number: string;
  label: string;
}

function StatCard({ icon, number, label }: StatCardProps) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-[#6B5ED7]/10 rounded-full text-[#6B5ED7] mb-4">
        {icon}
      </div>
      <h3 className="text-3xl mb-2">{number}</h3>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

interface BenefitCardProps {
  title: string;
  description: string;
}

function BenefitCard({ title, description }: BenefitCardProps) {
  return (
    <div className="text-center">
      <h3 className="mb-3">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
