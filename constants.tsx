
import { Collection, Lens } from './types';

// ==========================================
//  منطقة تغيير الصور (غير الروابط هنا فقط)
// ==========================================

// شعار التطبيق الجديد
export const APP_LOGO = 'https://i.ibb.co/x8BMYwbN/image.png';

// 1. صور العارضات (للتجربة الافتراضية)
const MODEL_IMG_1 = 'https://images.unsplash.com/photo-1615566252329-a035c6a1ad65?w=500&q=80'; 
const MODEL_IMG_2 = 'https://images.unsplash.com/photo-1594519934249-5a1532981329?w=500&q=80'; 
const MODEL_IMG_3 = 'https://images.unsplash.com/photo-1552885229-4c1b18126b8a?w=500&q=80'; 

// 2. الصورة الرئيسية الكبيرة في واجهة التطبيق (Hero Image)
export const HERO_IMAGE = 'https://i.ibb.co/B2nVm14K/DSC00872-e.jpg';

// 3. صور المجموعات (Collections) - صور عيون مقربة جداً (Ultra Macro)
export const COLLECTION_IMAGES: Record<string, string> = {
  // MERAL: عين خضراء/عسلي فاتحة جداً ومقربة
  MERAL: 'https://i.ibb.co/mrVSVjn5/b3.jpg', 
  
  // SHERAZ: عين عسلية ذهبية دافئة
  SHERAZ: 'https://i.ibb.co/b5gfXHJ6/b2.jpg', 
  
  // NATURAL: عين بنية داكنة طبيعية جداً وواضحة
  NATURAL: 'https://i.ibb.co/jvm9ZZzN/b12.jpg', 
  
  // VENUS: عين زرقاء/رمادية ساحرة
  VENUS: 'https://i.ibb.co/d0kg27hn/B7.jpg',
};

// ==========================================
//  نهاية منطقة الصور
// ==========================================

export const LENSES: Lens[] = [
  // --- ROW 1 FROM IMAGE ---
  { id: 'nat01', name: 'Gray Natural', code: 'N01', collection: 'NATURAL', price: '', color: '#968477', description: '', imageUrl: MODEL_IMG_2 },
  { id: 'ven01', name: 'Gray Talent', code: 'V01', collection: 'VENUS', price: '', color: '#5A5A5A', description: '', imageUrl: MODEL_IMG_2 },
  { id: 'ven02', name: 'Gray Venus', code: 'V02', collection: 'VENUS', price: '', color: '#CACACA', description: '', imageUrl: MODEL_IMG_2 },
  { id: 'she01', name: 'Sheraz Green', code: 'S01', collection: 'SHERAZ', price: '', color: '#8BA186', description: '', imageUrl: MODEL_IMG_1 },
  { id: 'she02', name: 'Sheraz Honey', code: 'S02', collection: 'SHERAZ', price: '', color: '#B3997D', description: '', imageUrl: MODEL_IMG_1 },
  { id: 'she03', name: 'Sheraz Yellow', code: 'S03', collection: 'SHERAZ', price: '', color: '#C4B49C', description: '', imageUrl: MODEL_IMG_3 },
  { id: 'she04', name: 'Sheraz Blue', code: 'S04', collection: 'SHERAZ', price: '', color: '#85A0AF', description: '', imageUrl: MODEL_IMG_2 },
  { id: 'mer01', name: 'Meral Gray', code: 'M01', collection: 'MERAL', price: '', color: '#D1D1D1', description: '', imageUrl: MODEL_IMG_2 },
  { id: 'mer02', name: 'Meral Blue', code: 'M02', collection: 'MERAL', price: '', color: '#A9C2D1', description: '', imageUrl: MODEL_IMG_2 },

  // --- ROW 2 FROM IMAGE ---
  { id: 'mer03', name: 'Meral Light Gray', code: 'M03', collection: 'MERAL', price: '', color: '#C0C0C0', description: '', imageUrl: MODEL_IMG_2 },
  { id: 'mer04', name: 'Meral Green', code: 'M04', collection: 'MERAL', price: '', color: '#A6C2A5', description: '', imageUrl: MODEL_IMG_1 },
  { id: 'mer05', name: 'Meral Honey', code: 'M05', collection: 'MERAL', price: '', color: '#D4A988', description: '', imageUrl: MODEL_IMG_1 },
  { id: 'mer06', name: 'Meral Talent', code: 'M06', collection: 'MERAL', price: '', color: '#6A8CC2', description: '', imageUrl: MODEL_IMG_2 },
  { id: 'mer07', name: 'Meral Yellow', code: 'M07', collection: 'MERAL', price: '', color: '#D9D3A3', description: '', imageUrl: MODEL_IMG_3 },
  { id: 'nat02', name: 'Nutella', code: 'N02', collection: 'NATURAL', price: '', color: '#AF835C', description: '', imageUrl: MODEL_IMG_3 },
  { id: 'nat03', name: 'Coffee Black', code: 'N03', collection: 'NATURAL', price: '', color: '#4A4A4A', description: '', imageUrl: MODEL_IMG_3 },
  { id: 'nat04', name: 'Green Natural', code: 'N04', collection: 'NATURAL', price: '', color: '#97916D', description: '', imageUrl: MODEL_IMG_1 },
  { id: 'nat05', name: 'Honey Natural', code: 'N05', collection: 'NATURAL', price: '', color: '#C08C5C', description: '', imageUrl: MODEL_IMG_1 },
];

export const COLLECTIONS: Collection[] = [
  { name: 'MERAL', description: 'عيونك مرآة للكون', lenses: LENSES.filter(l => l.collection === 'MERAL') },
  { name: 'NATURAL', description: 'جمال طبيعي خلاب', lenses: LENSES.filter(l => l.collection === 'NATURAL') },
  { name: 'VENUS', description: 'سحر الكواكب في عينيك', lenses: LENSES.filter(l => l.collection === 'VENUS') },
  { name: 'SHERAZ', description: 'أناقة لا تتكرر', lenses: LENSES.filter(l => l.collection === 'SHERAZ') },
];