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

      <div className="flex justify-center">
        <div className="glass p-12 rounded-[3rem] border border-border/50 hover:border-accent/30 transition-all group max-w-md w-full text-center shadow-2xl">
          <div className="bg-bg-secondary w-20 h-20 rounded-3xl flex items-center justify-center mb-8 mx-auto group-hover:scale-110 transition-transform duration-500 shadow-lg">
            <Mail className="text-accent" size={40} />
          </div>
          <h3 className="text-2xl font-black text-text-primary mb-3">Email Support</h3>
          <p className="text-text-secondary font-medium mb-10 leading-relaxed">For general inquiries, account issues, and booking disputes.</p>
          <a href="mailto:support@cras.edu" className="inline-flex items-center gap-3 bg-accent text-white px-8 py-4 rounded-2xl font-black text-lg hover:opacity-90 active:scale-95 transition-all shadow-xl shadow-accent/20">
            support@cras.edu
            <ExternalLink size={20} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default Contact;
