import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Send, Paperclip, User, Phone, MessageSquare, Check, Mail } from 'lucide-react';

interface MContactProps {
  isOpen: boolean;
  onClose: () => void;
}

const MContact = ({ onClose }: Omit<MContactProps, 'isOpen'>) => {
  const [isDark, setIsDark] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    number: '',
    hasWhatsapp: false,
    message: '',
    attachments: [] as File[],
  });

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...newFiles]
      }));
    }
  };

  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    setFormData({
      name: '',
      number: '',
      hasWhatsapp: false,
      message: '',
      attachments: [],
    });
    onClose();
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#00000060',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1400,
        padding: '1rem',
      }} onClick={onClose}>
      <motion.div
        layoutId="contact-trigger"
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{
          backgroundColor: isDark ? 'rgba(20,20,20,0.95)' : 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '24px',
          boxShadow: isDark ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)' : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
          maxWidth: '480px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
          willChange: 'transform',
        }} onClick={e => e.stopPropagation()}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <motion.div layoutId="contact-icon" style={{ color: '#3b82f6', display: 'flex' }}>
                <Mail size={24} />
              </motion.div>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                fontFamily: "'Inter', sans-serif",
                color: 'var(--text-primary)',
                margin: 0
              }}>
                Contact Me
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '50%',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Name *</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 44px',
                    border: '1px solid var(--navbar-border)',
                    borderRadius: '12px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    fontSize: '0.875rem'
                  }}
                  placeholder="Your full name"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Phone Number *</label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="tel"
                  name="number"
                  value={formData.number}
                  onChange={handleInputChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 44px',
                    border: '1px solid var(--navbar-border)',
                    borderRadius: '12px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    fontSize: '0.875rem'
                  }}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.875rem' }}>
                <MessageSquare size={16} />
                WhatsApp Available
              </div>
              <div
                onClick={() => setFormData(prev => ({ ...prev, hasWhatsapp: !prev.hasWhatsapp }))}
                style={{
                  width: '44px',
                  height: '24px',
                  backgroundColor: formData.hasWhatsapp ? 'rgb(59, 130, 246)' : 'var(--navbar-border)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: formData.hasWhatsapp ? '22px' : '2px',
                  width: '20px',
                  height: '20px',
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {formData.hasWhatsapp && <Check size={12} style={{ color: 'rgb(59, 130, 246)' }} />}
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Message</label>
              <div style={{ position: 'relative' }}>
                <MessageSquare size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 44px',
                    border: '1px solid var(--navbar-border)',
                    borderRadius: '12px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    fontSize: '0.875rem',
                    resize: 'none'
                  }}
                  placeholder="Your message..."
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Attachments</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {formData.attachments.map((file, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'var(--navbar-border)', borderRadius: '8px', fontSize: '0.75rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                    <X size={14} onClick={() => removeFile(i)} style={{ cursor: 'pointer' }} />
                  </div>
                ))}
                <input type="file" id="contact-file" multiple onChange={handleFileChange} style={{ display: 'none' }} />
                <label htmlFor="contact-file" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', border: '1px dashed var(--navbar-border)', borderRadius: '12px', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)', justifyContent: 'center' }}>
                  <Paperclip size={16} /> Add Files
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: 'rgb(59, 130, 246)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Send size={16} /> Send
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

export default MContact;
