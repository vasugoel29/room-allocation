import { Mail, Phone, MapPin, ExternalLink, MessageSquare } from 'lucide-react';

function Contact() {
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto w-full h-full overflow-y-auto no-scrollbar">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-accent/10 px-4 py-2 rounded-full text-accent font-black text-[10px] uppercase tracking-widest mb-4">
          <MessageSquare size={14} />
          Support & Feedback
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-text-primary tracking-tighter mb-4 leading-tight">Get in touch with us.</h1>
        <p className="text-text-secondary font-medium max-w-lg mx-auto leading-relaxed">Have questions about room allocations or technical issues? We're here to help you get the most out of CRAS.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="glass p-8 rounded-3xl border border-border/50 hover:border-accent/30 transition-all group">
          <div className="bg-bg-secondary w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <Mail className="text-accent" size={28} />
          </div>
          <h3 className="text-xl font-bold text-text-primary mb-2">Email Support</h3>
          <p className="text-text-secondary text-sm mb-6 font-medium">For general inquiries and booking disputes.</p>
          <a href="mailto:support@cras.edu" className="text-accent font-black text-sm flex items-center gap-2 hover:translate-x-1 transition-transform">
            support@cras.edu
            <ExternalLink size={14} />
          </a>
        </div>

        <div className="glass p-8 rounded-3xl border border-border/50 hover:border-accent/30 transition-all group">
          <div className="bg-bg-secondary w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <Phone className="text-accent" size={28} />
          </div>
          <h3 className="text-xl font-bold text-text-primary mb-2">Internal Hotline</h3>
          <p className="text-text-secondary text-sm mb-6 font-medium">Available during blocks 5 and 6 operating hours.</p>
          <a href="tel:+1234567890" className="text-accent font-black text-sm flex items-center gap-2 hover:translate-x-1 transition-transform">
            Ext: 5122
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div className="glass p-8 rounded-3xl border border-border/50 flex flex-col md:flex-row items-center gap-8 justify-between">
        <div className="flex items-center gap-6">
          <div className="bg-bg-secondary w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
            <MapPin className="text-text-secondary" size={24} />
          </div>
          <div>
            <h4 className="font-bold text-text-primary">Office Location</h4>
            <p className="text-sm text-text-secondary font-medium">Block 5, Level 2, Room 5204</p>
          </div>
        </div>
        <div className="w-full md:w-px h-px md:h-12 bg-border"></div>
        <div className="text-center md:text-left">
          <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50 mb-1">Operating Hours</p>
          <p className="font-bold text-text-primary">Mon - Fri, 08:00 - 18:00</p>
        </div>
      </div>
    </div>
  );
}

export default Contact;
