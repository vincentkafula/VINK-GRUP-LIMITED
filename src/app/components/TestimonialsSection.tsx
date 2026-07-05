import { Star, Quote } from 'lucide-react';

export function TestimonialsSection() {
  return (
    <div className="bg-gradient-to-b from-gray-50 to-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl mb-4">What Our Customers Say</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Real stories from real people who love using Vink
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <TestimonialCard
            name="Sarah Johnson"
            role="Small Business Owner"
            image="SJ"
            rating={5}
            text="Vink has transformed how I manage my business finances. The cashback rewards are incredible, and the customer service is always there when I need them."
          />
          <TestimonialCard
            name="Michael Chen"
            role="Freelance Designer"
            image="MC"
            rating={5}
            text="I've tried many credit cards, but Vink is by far the best. No hidden fees, great rewards, and the mobile app is so easy to use. Highly recommend!"
          />
          <TestimonialCard
            name="Emily Rodriguez"
            role="Marketing Manager"
            image="ER"
            rating={5}
            text="The travel benefits alone are worth it! Plus, I love how transparent they are with fees and charges. Best decision I made this year."
          />
        </div>
      </div>
    </div>
  );
}

interface TestimonialCardProps {
  name: string;
  role: string;
  image: string;
  rating: number;
  text: string;
}

function TestimonialCard({ name, role, image, rating, text }: TestimonialCardProps) {
  return (
    <div className="bg-white border border-border rounded-xl p-6 hover:shadow-lg transition-shadow relative">
      <Quote className="w-10 h-10 text-[#6B5ED7]/20 absolute top-4 right-4" />

      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-[#6B5ED7] to-[#8B7EE7] rounded-full flex items-center justify-center text-white">
          {image}
        </div>
        <div>
          <h4 className="text-sm">{name}</h4>
          <p className="text-xs text-muted-foreground">{role}</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {[...Array(rating)].map((_, i) => (
          <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
        ))}
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
    </div>
  );
}
