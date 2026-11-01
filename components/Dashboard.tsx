
import React, { useState, useRef } from 'react';
import { Lens, CollectionName } from '../types';

interface DashboardProps {
  onAddLens: (lens: Lens) => void;
  onBack: () => void;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onAddLens, onBack, onLogout }) => {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    collection: 'MERAL' as CollectionName,
    color: '#D4AF37',
    description: ''
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePreview || !formData.name || !formData.code) return;

    const newLens: Lens = {
      id: `custom-${Date.now()}`,
      name: formData.name.trim(),
      code: formData.code.trim(),
      collection: formData.collection,
      price: '',
      color: formData.color,
      description: formData.description,
      imageUrl: imagePreview
    };

    onAddLens(newLens);
    // Reset form
    setFormData({ name: '', code: '', collection: 'MERAL', color: '#D4AF37', description: '' });
    setImagePreview(null);
  };

  return (
    <div className="min-h-screen pb-32 bg-luxury-black text-right">
      <div className="p-6 border-b border-white/5 bg-luxury-surface/50 sticky top-0 z-50 backdrop-blur-md flex items-center justify-between">
         <button onClick={onLogout} className="text-red-500/50 hover:text-red-500 transition-colors">
          <span className="material-symbols-outlined">logout</span>
        </button>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-serif font-bold text-white tracking-widest">إدارة المتجر</h2>
          <button onClick={onBack} className="text-luxury-gold">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>

      <div className="p-6 space-y-10">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
            <label className="text-white/60 text-xs font-bold uppercase tracking-widest block">صورة المنتج</label>
            <div onClick={() => fileInputRef.current?.click()} className={`aspect-[4/3] rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center bg-luxury-surface/50 ${imagePreview ? 'border-luxury-gold' : 'border-white/10'}`}>
              {imagePreview ? (<img src={imagePreview} className="w-full h-full object-contain p-2" alt="Preview" />) : (<span className="material-symbols-outlined text-luxury-gold text-4xl">add_a_photo</span>)}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <input type="text" required placeholder="اسم العدسة" className="col-span-2 w-full bg-luxury-surface border border-white/5 rounded-xl px-4 py-4 text-white focus:border-luxury-gold outline-none text-right" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input type="text" required placeholder="الكود" className="w-full bg-luxury-surface border border-white/5 rounded-xl px-4 py-4 text-white focus:border-luxury-gold outline-none text-center" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <select className="bg-luxury-surface border border-white/5 rounded-xl px-4 py-4 text-white focus:border-luxury-gold outline-none text-right" value={formData.collection} onChange={e => setFormData({...formData, collection: e.target.value as CollectionName})}>
                <option value="MERAL">مجموعة MERAL</option>
                <option value="SHERAZ">مجموعة SHERAZ</option>
                <option value="NATURAL">مجموعة NATURAL</option>
                <option value="VENUS">مجموعة VENUS</option>
              </select>
              <input type="color" title="لون المحاكاة" className="w-full h-full bg-luxury-surface border border-white/5 rounded-xl p-1 cursor-pointer" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} />
            </div>
          </div>

          <button type="submit" className="w-full gold-gradient text-luxury-black font-black py-5 rounded-2xl uppercase tracking-[0.2em]">إضافة للمتجر الآن</button>
        </form>
      </div>
    </div>
  );
};

export default Dashboard;
